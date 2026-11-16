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

import { createClient } from 'npm:@supabase/supabase-js@2.103.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_ANON = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// Atomic per-user AI limits (migration 041): ai_reserve() books the
// worst-case cost of a call before it is made, in one locked transaction
// (hourly/daily call counts, per-user daily $ cap, org-wide daily ceiling);
// ai_settle() swaps the reservation for the real cost afterwards, also when
// the call fails. Fails closed: a DB error counts as over the limit.
// $ per million tokens = micro-dollars per token.
const PRICE_PER_MTOK: Record<string, [number, number]> = {
  'claude-sonnet-5-5': [2, 10],
  'claude-haiku-5-5': [0.1, 0.5],
};
function costMicros(model: string, inputTokens: number, outputTokens: number): number {
  const [inRate, outRate] = PRICE_PER_MTOK[model] ?? [10, 50];
  const mult = model.startsWith('claude-haiku') && inputTokens > 100_000 ? 5 : 1;
  return Math.ceil((inputTokens * inRate + outputTokens * outRate) * mult);
}
function usageMicros(model: string, usage: Record<string, number> | undefined): number {
  if (!usage) return 0;
  const input = (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
  return costMicros(model, input, usage.output_tokens ?? 0);
}
async function aiReserve(userId: string, bucket: string, maxHour: number, maxDay: number, micros: number): Promise<boolean> {
  const { data, error } = await createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY).rpc('ai_reserve', {
    p_user: userId, p_bucket: bucket, p_max_hour: maxHour, p_max_day: maxDay, p_reserve_micros: micros,
  });
  return !error && data === true;
}
async function aiSettle(userId: string, reservedMicros: number, actualMicros: number): Promise<void> {
  const { error } = await createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY).rpc('ai_settle', {
    p_user: userId, p_reserved_micros: reservedMicros, p_actual_micros: actualMicros,
  });
  if (error) console.error('ai_settle failed', error.message);
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB base64 ≈ 3.75MB image
const MAX_BODY_BYTES = MAX_IMAGE_BYTES + 64 * 1024; // image + JSON wrapper
const MAX_OUTPUT_TOKENS = 2048;
const MODEL = 'claude-haiku-5-5';
const VALID_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

const TOO_LARGE = Symbol('too large');
/** Reads a JSON body, giving up as soon as it passes maxBytes (never buffers more). */
async function readJsonCapped(req: Request, maxBytes: number): Promise<unknown> {
  if (Number(req.headers.get('content-length') || '0') > maxBytes) return TOO_LARGE;
  if (!req.body) return null;
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return TOO_LARGE;
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { buf.set(c, offset); offset += c.byteLength; }
  try {
    return JSON.parse(new TextDecoder().decode(buf));
  } catch {
    return null;
  }
}

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

  if (!ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'AI not configured' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Size is enforced while reading: the body is never buffered past the cap.
  const parsed = await readJsonCapped(req, MAX_BODY_BYTES);
  if (parsed === TOO_LARGE) {
    return new Response(
      JSON.stringify({ error: 'Payload too large (max 5MB image)' }),
      { status: 413, headers: { 'Content-Type': 'application/json' } }
    );
  }
  const { image, mimeType } = (parsed ?? {}) as { image?: unknown; mimeType?: unknown };

  if (typeof image !== 'string' || !image) {
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
  const effectiveMime = typeof mimeType === 'string' && mimeType ? mimeType : 'image/jpeg';
  if (!VALID_MIME_TYPES.includes(effectiveMime)) {
    return new Response(
      JSON.stringify({ error: 'Invalid image type. Accepted: JPEG, PNG, GIF, WebP' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Worst case: full output; input ≈ image bytes / 750 + prompt chars / 3.
  const imageBytes = Math.ceil(image.length * 3 / 4);
  const reserved = costMicros(MODEL, Math.ceil(imageBytes / 750 + ANALYSIS_PROMPT.length / 3), MAX_OUTPUT_TOKENS);
  if (!(await aiReserve(user.id, 'analyze-photo', 30, 150, reserved))) {
    return new Response(JSON.stringify({ error: 'AI limit reached, try again later' }), { status: 429, headers: { 'Content-Type': 'application/json' } });
  }

  let actual = 0;
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        output_config: { effort: 'low' },
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: effectiveMime,
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
      console.error(`analyze-photo: Claude API ${response.status}`, (await response.text().catch(() => '')).slice(0, 500));
      return new Response(
        JSON.stringify({ error: 'AI service error' }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const result = await response.json();
    actual = usageMicros(MODEL, result.usage);
    const text = (result.content ?? []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('') || '';

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    let analysis: unknown = null;
    try { analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : null; } catch { analysis = null; }
    if (!analysis || typeof analysis !== 'object' || Array.isArray(analysis)) {
      console.error('analyze-photo: unparseable model output', text.slice(0, 500));
      return new Response(
        JSON.stringify({ error: 'Failed to parse AI response' }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify(analysis), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('analyze-photo failed', String(err));
    return new Response(
      JSON.stringify({ error: 'AI request failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  } finally {
    await aiSettle(user.id, reserved, actual);
  }
});
