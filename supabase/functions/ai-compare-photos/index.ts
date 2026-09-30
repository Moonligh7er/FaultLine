// Supabase Edge Function: ai-compare-photos
// Compares two infrastructure photos to determine if they show the same issue.
// Used for intelligent clustering beyond GPS proximity.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';
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
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);
  const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.substring(7));
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  if (!(await withinRateLimit(user.id, 'ai-compare-photos', [{ max: 60, windowMs: 3600000 }, { max: 300, windowMs: 86400000 }]))) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429, headers: { 'Content-Type': 'application/json' } });
  }

  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ isSameIssue: false, confidence: 0, reasoning: 'AI not configured' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { image1, image2 } = await req.json();
  if (!image1 || !image2) {
    return new Response(JSON.stringify({ error: 'Two images required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  if (image1.length > MAX_IMAGE_BYTES || image2.length > MAX_IMAGE_BYTES) {
    return new Response(JSON.stringify({ error: 'Images too large' }), { status: 413, headers: { 'Content-Type': 'application/json' } });
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
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image1 } },
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image2 } },
            { type: 'text', text: `Compare these two infrastructure photos. Do they show the SAME specific issue (same pothole, same broken light, etc.) or different issues?

Return JSON only: {"isSameIssue": true/false, "confidence": 0.0-1.0, "reasoning": "brief explanation"}` },
          ],
        }],
      }),
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ isSameIssue: false, confidence: 0, reasoning: 'API error' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const result = await response.json();
    const text = result.content?.[0]?.text || '';
    const match = text.match(/\{[\s\S]*\}/);

    if (match) {
      return new Response(match[0], { headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ isSameIssue: false, confidence: 0, reasoning: 'Parse error' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ isSameIssue: false, confidence: 0, reasoning: String(err) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
