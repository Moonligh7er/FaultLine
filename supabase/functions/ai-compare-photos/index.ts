// Supabase Edge Function: ai-compare-photos
// Compares two infrastructure photos to determine if they show the same issue.
// Used for intelligent clustering beyond GPS proximity.

import { createClient } from 'npm:@supabase/supabase-js@2.103.0';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';
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

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_BODY_BYTES = 2 * MAX_IMAGE_BYTES + 64 * 1024;
const MAX_OUTPUT_TOKENS = 1024;
const MODEL = 'claude-haiku-5-5';
const COMPARE_PROMPT = `Compare these two infrastructure photos. Do they show the SAME specific issue (same pothole, same broken light, etc.) or different issues?

Return JSON only: {"isSameIssue": true/false, "confidence": 0.0-1.0, "reasoning": "brief explanation"}`;

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

/** The model's answer, only if it has exactly the shape the app expects. */
function validComparison(text: string): { isSameIssue: boolean; confidence: number; reasoning: string } | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let v: any;
  try { v = JSON.parse(match[0]); } catch { return null; }
  if (!v || typeof v !== 'object' || typeof v.isSameIssue !== 'boolean') return null;
  const confidence = Number(v.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) return null;
  const reasoning = typeof v.reasoning === 'string' ? v.reasoning.slice(0, 500) : '';
  return { isSameIssue: v.isSameIssue, confidence, reasoning };
}

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

  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ isSameIssue: false, confidence: 0, reasoning: 'AI not configured' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const parsed = await readJsonCapped(req, MAX_BODY_BYTES);
  if (parsed === TOO_LARGE) {
    return new Response(JSON.stringify({ error: 'Images too large' }), { status: 413, headers: { 'Content-Type': 'application/json' } });
  }
  const { image1, image2 } = (parsed ?? {}) as { image1?: unknown; image2?: unknown };
  if (typeof image1 !== 'string' || typeof image2 !== 'string' || !image1 || !image2) {
    return new Response(JSON.stringify({ error: 'Two images required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  if (image1.length > MAX_IMAGE_BYTES || image2.length > MAX_IMAGE_BYTES) {
    return new Response(JSON.stringify({ error: 'Images too large' }), { status: 413, headers: { 'Content-Type': 'application/json' } });
  }

  // Worst case: full output; input ≈ image bytes / 750 + prompt chars / 3.
  const imageBytes = Math.ceil((image1.length + image2.length) * 3 / 4);
  const reserved = costMicros(MODEL, Math.ceil(imageBytes / 750 + COMPARE_PROMPT.length / 3), MAX_OUTPUT_TOKENS);
  if (!(await aiReserve(user.id, 'ai-compare-photos', 60, 300, reserved))) {
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
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image1 } },
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image2 } },
            { type: 'text', text: COMPARE_PROMPT },
          ],
        }],
      }),
    });

    if (!response.ok) {
      console.error(`ai-compare-photos: Claude API ${response.status}`, (await response.text().catch(() => '')).slice(0, 500));
      return new Response(JSON.stringify({ isSameIssue: false, confidence: 0, reasoning: 'API error' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const result = await response.json();
    actual = usageMicros(MODEL, result.usage);
    const text = (result.content ?? []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('') || '';
    const comparison = validComparison(text);

    if (comparison) {
      return new Response(JSON.stringify(comparison), { headers: { 'Content-Type': 'application/json' } });
    }
    console.error('ai-compare-photos: unexpected model output', text.slice(0, 500));

    return new Response(JSON.stringify({ isSameIssue: false, confidence: 0, reasoning: 'Parse error' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('ai-compare-photos failed', String(err));
    return new Response(JSON.stringify({ isSameIssue: false, confidence: 0, reasoning: 'AI request failed' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  } finally {
    await aiSettle(user.id, reserved, actual);
  }
});
