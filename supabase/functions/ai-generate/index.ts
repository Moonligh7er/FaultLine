// Supabase Edge Function: ai-generate
// Unified AI text generation. Routes tasks to the optimal model.
// Sonnet 4.6: legal letters, escalation emails, feedback triage (accuracy)
// Haiku 4.5: descriptions, notifications, summaries (speed + cost)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_ANON = Deno.env.get('SUPABASE_ANON_KEY') || '';

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

// Task → optimal model
const TASK_MODELS: Record<string, string> = {
  legal_letter: 'claude-sonnet-4-6-20250514',
  escalation_email: 'claude-sonnet-4-6-20250514',
  feedback_triage: 'claude-sonnet-4-6-20250514',
  description: 'claude-haiku-4-5-20251001',
  notification: 'claude-haiku-4-5-20251001',
  summarize: 'claude-haiku-4-5-20251001',
  transcribe: 'claude-haiku-4-5-20251001',
};

const TASK_MAX_TOKENS: Record<string, number> = {
  description: 200,
  notification: 200,
  summarize: 300,
  legal_letter: 3000,
  escalation_email: 1500,
  feedback_triage: 2000,
  transcribe: 500,
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

  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'AI not configured', text: '' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }

  const { task, prompt } = await req.json();
  if (!prompt) {
    return new Response(JSON.stringify({ error: 'No prompt' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const model = TASK_MODELS[task] || 'claude-haiku-4-5-20251001';
  const maxTokens = TASK_MAX_TOKENS[task] || 500;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: maxTokens, system: SYSTEM_CONTEXT, messages: [{ role: 'user', content: prompt }] }),
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ error: `Claude API ${response.status}`, text: '', model }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    }

    const result = await response.json();
    const text = result.content?.[0]?.text || '';

    return new Response(JSON.stringify({ text, task, model }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err), text: '', model }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
