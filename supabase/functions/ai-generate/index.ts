// Supabase Edge Function: ai-generate
// Unified AI text generation. Routes tasks to the optimal model.
// Sonnet 5.5: legal letters, escalation emails, feedback triage (accuracy)
// Haiku 5.5: descriptions, notifications, summaries (speed + cost)

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

const SYSTEM_CONTEXT = `You are the AI engine for Fault Line, a community infrastructure accountability platform.

Key facts:
- Users report 24 categories of infrastructure issues (potholes, streetlights, sidewalks, signage, drainage, graffiti, road debris, guardrails, crosswalks, traffic signals, needed traffic lights, water mains, sewers, bridges, fallen trees, snow/ice, accessibility, bike lanes, abandoned vehicles, illegal dumping, parking meters, parks/playgrounds, utility poles, other).
- Reports are GPS-tagged with AI-analyzed photos.
- 3 unique reporters at same location = "community-verified."
- 10 reports over 30 days = automated escalation email to responsible government authority.
- App generates formal legal demand letters citing state-specific statutes.
- Infrastructure health scores grade cities A+ to F.
- Currently covers Massachusetts, Rhode Island, and New Hampshire.

Key statutes:
- MA: M.G.L. c. 84, § 15 — municipalities liable for defective public ways with notice. 30-day notice period. 3-year filing deadline.
- RI: R.I. Gen. Laws § 24-5-14 — towns/cities liable for defective highways with notice. 60-day notice period.
- NH: RSA 231:90-92 — municipalities liable for highway insufficiency with actual notice. 60-day notice period. $50,000 cap.

Rules:
- Be factual, specific, and professional.
- NEVER fabricate case citations, statistics, or legal references.
- If you're not confident about a case citation, omit it rather than guessing.
- For legal tasks, cite only the specific statutes provided above unless you are certain of additional relevant law.`;

// Task → model. Sonnet for drafting that carries legal weight; Haiku for short text.
const TASK_MODELS: Record<string, string> = {
  legal_letter: 'claude-sonnet-5-5',
  escalation_email: 'claude-sonnet-5-5',
  feedback_triage: 'claude-sonnet-5-5',
  description: 'claude-haiku-5-5',
  notification: 'claude-haiku-5-5',
  summarize: 'claude-haiku-5-5',
  transcribe: 'claude-haiku-5-5',
};

// Thinking is on by default on these models and counts toward max_tokens,
// so caps leave room for it; effort is the cost lever.
const TASK_EFFORT: Record<string, 'low' | 'medium'> = {
  legal_letter: 'medium',
  escalation_email: 'low',
  feedback_triage: 'low',
  description: 'low',
  notification: 'low',
  summarize: 'low',
  transcribe: 'low',
};

// Largest real prompt is the legal-letter rewrite (full base letter).
const MAX_PROMPT_CHARS = 16000;

const TASK_MAX_TOKENS: Record<string, number> = {
  description: 1024,
  notification: 1024,
  summarize: 1024,
  legal_letter: 8000,
  escalation_email: 4000,
  feedback_triage: 4000,
  transcribe: 1536,
};

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

  if (!(await withinRateLimit(user.id, 'ai-generate', [{ max: 20, windowMs: 3600000 }, { max: 100, windowMs: 86400000 }]))) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429, headers: { 'Content-Type': 'application/json' } });
  }

  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'AI not configured', text: '' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }

  const { task, prompt } = await req.json();
  if (typeof prompt !== 'string' || !prompt) {
    return new Response(JSON.stringify({ error: 'No prompt' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  // Only the app's own tasks; unknown tasks were silently routed to Haiku.
  if (typeof task !== 'string' || !(task in TASK_MODELS)) {
    return new Response(JSON.stringify({ error: 'Unknown task' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    return new Response(JSON.stringify({ error: 'Prompt too long' }), { status: 413, headers: { 'Content-Type': 'application/json' } });
  }

  if (!(await aiBudgetOk())) {
    return new Response(JSON.stringify({ error: 'AI is paused for today', text: '' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }

  const model = TASK_MODELS[task];
  const maxTokens = TASK_MAX_TOKENS[task] || 500;

  try {
    const isSonnet = model.startsWith('claude-sonnet');
    const headers: Record<string, string> = { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' };
    // Server-side fallback re-runs a classifier decline on another model (Sonnet only; Haiku has none).
    if (isSonnet) headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        output_config: { effort: TASK_EFFORT[task] ?? 'low' },
        ...(isSonnet ? { fallbacks: 'default' } : {}),
        system: SYSTEM_CONTEXT,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ error: `Claude API ${response.status}`, text: '', model }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    }

    const result = await response.json();
    await recordAiUsage(model, result.usage).catch(() => {});
    if (result.stop_reason === 'refusal') {
      return new Response(JSON.stringify({ error: 'Declined', text: '', model }), { status: 422, headers: { 'Content-Type': 'application/json' } });
    }
    // Responses can open with thinking blocks; the answer is the text blocks.
    const text = (result.content ?? []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('');

    return new Response(JSON.stringify({ text, task, model }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err), text: '', model }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
