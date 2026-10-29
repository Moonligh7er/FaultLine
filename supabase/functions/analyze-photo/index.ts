// Supabase Edge Function: analyze-photo
// Uses Claude's vision capabilities to analyze infrastructure damage photos
// Returns structured severity assessment

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';

const ANALYSIS_PROMPT = `You are an infrastructure damage assessment AI for a civic reporting app called Fault Line.

Analyze this photo and return a JSON object with the following fields:

{
  "detectedCategory": one of: "pothole", "streetlight", "sidewalk", "signage", "drainage", "graffiti", "road_debris", "guardrail", "crosswalk", "traffic_signal", "water_main", "sewer", "bridge", "fallen_tree", "snow_ice", "accessibility", "bike_lane", "abandoned_vehicle", "illegal_dumping", "parking_meter", "park_playground", "utility_pole", "other", or null if no infrastructure issue detected,
  "confidence": number 0-1 how confident you are in the detection,
  "suggestedSize": one of "small", "medium", "large", "massive" or null if not applicable,
  "suggestedHazard": one of "minor", "moderate", "significant", "dangerous", "extremely_dangerous",
  "damageDescription": brief 1-2 sentence description of what you see,
  "detectedObjects": array of strings describing detected damage features (e.g., ["crack", "water pooling", "exposed rebar"]),
  "estimatedDimensions": { "widthCm": number, "lengthCm": number, "depthEstimate": "shallow"|"medium"|"deep" } or null,
  "roadSurfaceType": "asphalt", "concrete", "gravel", "brick", or null,
  "weatherConditions": "dry", "wet", "icy", "snowy", or null
}

Be conservative with hazard ratings - only rate "extremely_dangerous" if there's genuine risk of vehicle damage or pedestrian injury. Return ONLY valid JSON, no other text.`;

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_ANON = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// Per-user sliding-window limit backed by public.edge_rate_limit_log
// (migration 023). Fails closed: a DB error counts as over the limit.
async function withinRateLimit(
  userId: string,
  bucket: string,
  limits: { max: number; windowMs: number }[],
): Promise<boolean> {
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  for (const { max, windowMs } of limits) {
    const { count, error } = await admin
      .from('edge_rate_limit_log')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('bucket', bucket)
      .gte('created_at', new Date(Date.now() - windowMs).toISOString());
    if (error || (count ?? 0) >= max) return false;
  }
  const { error } = await admin.from('edge_rate_limit_log').insert({ user_id: userId, bucket });
  return !error;
}
// Org-wide daily AI spend ceiling (migration 039): checked before each call,
// cost recorded after from the response's token usage. Fails closed.
// $ per million tokens = micro-dollars per token.
const PRICE_PER_MTOK: Record<string, [number, number]> = {
  'claude-sonnet-5-5': [2, 10],
  'claude-haiku-5-5': [0.1, 0.5],
};
async function aiBudgetOk(): Promise<boolean> {
  const { data, error } = await createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY).rpc('ai_budget_ok');
  return !error && data === true;
}
async function recordAiUsage(model: string, usage: Record<string, number> | undefined): Promise<void> {
  if (!usage) return;
  const input = (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
  const [inRate, outRate] = PRICE_PER_MTOK[model] ?? [10, 50];
  const long = model.startsWith('claude-haiku') && input > 100_000;
  const micros = Math.ceil(input * (long ? inRate * 5 : inRate) + (usage.output_tokens ?? 0) * (long ? outRate * 5 : outRate));
  await createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY).rpc('ai_record_usage', { p_cost_micros: micros });
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB base64 ≈ 3.75MB image
const VALID_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Auth: require valid user token
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);
  const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.substring(7));
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  if (!(await withinRateLimit(user.id, 'analyze-photo', [{ max: 30, windowMs: 3600000 }, { max: 150, windowMs: 86400000 }]))) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429, headers: { 'Content-Type': 'application/json' } });
  }

  if (!ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Payload size check (approximate — req body limit)
  const contentLength = parseInt(req.headers.get('content-length') || '0');
  if (contentLength > MAX_IMAGE_BYTES * 1.4) { // base64 is ~33% larger
    return new Response(
      JSON.stringify({ error: 'Payload too large (max 5MB image)' }),
      { status: 413, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { image, mimeType } = await req.json();

  if (!image) {
    return new Response(
      JSON.stringify({ error: 'No image provided' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Validate image size
  if (image.length > MAX_IMAGE_BYTES) {
    return new Response(
      JSON.stringify({ error: 'Image too large (max 5MB)' }),
      { status: 413, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Validate MIME type
  const effectiveMime = mimeType || 'image/jpeg';
  if (!VALID_MIME_TYPES.includes(effectiveMime)) {
    return new Response(
      JSON.stringify({ error: 'Invalid image type. Accepted: JPEG, PNG, GIF, WebP' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!(await aiBudgetOk())) {
    return new Response(JSON.stringify({ error: 'AI is paused for today' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-5-5',
        max_tokens: 2048,
        output_config: { effort: 'low' },
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mimeType || 'image/jpeg',
                  data: image,
                },
              },
              {
                type: 'text',
                text: ANALYSIS_PROMPT,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(
        JSON.stringify({ error: `Claude API error: ${response.status}`, detail: errorText }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const result = await response.json();
    await recordAiUsage('claude-haiku-5-5', result.usage).catch(() => {});
    const text = (result.content ?? []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('') || '';

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return new Response(
        JSON.stringify({ error: 'Failed to parse AI response', raw: text }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const analysis = JSON.parse(jsonMatch[0]);

    return new Response(JSON.stringify(analysis), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
