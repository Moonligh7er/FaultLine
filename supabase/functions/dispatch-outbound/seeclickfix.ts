// SeeClickFix API v2 issue creation — https://dev.seeclickfix.com/v2/issues/reporting/
//
// Three steps, as SeeClickFix requires:
//   1. GET /issues/new?lat&lng        → request types offered at the point
//   2. GET /request_types/:id         → that type's questions
//   3. POST /issues (Bearer token)    → request_type_id + answers
//
// Creating issues needs a Personal Access Token (SeeClickFix account →
// Password & Security). Without SEECLICKFIX_API_KEY the API returns 401, so
// we fail fast and let dispatch fall through to email / web form.
//
// Answers are only given where a truthful one exists: summary/description
// and address from the report; a required choice only when an option names
// the report's own category, is an explicit "Unknown"/"Not sure"/"Other",
// or is the sole option (an acknowledgement gate). Anything else (a yes/no
// we can't know, a phone number) → skip that type.

const API = 'https://seeclickfix.com/api/v2';
const USER_AGENT = 'Fault-Line/1.0 (+https://fault-line.dev; reports@fault-line.dev)';

export interface ScfPayload {
  category: string;
  address: string | null;
  latitude: number;
  longitude: number;
  api_description: string;
  image_url?: string | null;
}

export interface RequestTypeRef { organization: string | null; title: string; url: string }
export interface Question {
  primary_key: string;
  question_type: string;
  response_required: boolean;
  question?: string;
  select_values?: { key: string; name: string }[] | null;
}

// Words that identify our category in a city's request-type title or option.
const CATEGORY_TERMS: Record<string, string[]> = {
  pothole: ['pothole'],
  road_debris: ['debris', 'obstruction', 'blocking'],
  guardrail: ['guardrail', 'guard rail'],
  bridge: ['bridge'],
  traffic_signal: ['signal'],
  needed_traffic_light: ['signal', 'traffic light'],
  signage: ['sign', 'signage'],
  crosswalk: ['crosswalk', 'pavement marking'],
  sidewalk: ['sidewalk'],
  bike_lane: ['bike lane'],
  streetlight: ['streetlight', 'street light'],
  water_main: ['water main', 'water'],
  sewer: ['sewer'],
  drainage: ['drain', 'drainage', 'flood', 'flooding', 'catch basin', 'storm drain'],
  fallen_tree: ['tree'],
  snow_ice: ['snow', 'ice', 'icy', 'plow', 'plowing', 'unshoveled'],
  graffiti: ['graffiti'],
  illegal_dumping: ['dumping', 'dumped'],
  abandoned_vehicle: ['abandoned vehicle', 'abandoned auto', 'abandoned car'],
  parking_meter: ['meter'],
  park_playground: ['park', 'playground'],
  missing_curb_cut: ['curb', 'ramp', 'sidewalk'],
  broken_curb_cut: ['curb', 'ramp', 'sidewalk'],
  broken_accessibility_ramp: ['ramp', 'curb', 'sidewalk'],
  ada_blocked_path: ['sidewalk obstruction', 'blocking', 'sidewalk'],
};
// Catch-all types run by the city itself (still routed to staff).
const GENERIC_TERMS = ['public works', 'road maintenance', 'highway', 'general', 'other'];
const SAFE_OPTION = /^(unknown|not sure|unsure|don'?t know|other)$/i;
const ADDRESS_QUESTION = /address|location|where|cross street|intersection/i;
const NUMERIC_TYPE_URL = /\/request_types\/\d+$/;

const terms = (category: string) =>
  CATEGORY_TERMS[category] ?? [category.replace(/_/g, ' ')];

// Whole-word match (plural allowed): "sign" must not match "Signal",
// "ice" must not match "Police".
const escapeRe = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const has = (text: string, words: string[]) =>
  words.some((w) => new RegExp(`\\b${escapeRe(w)}s?\\b`, 'i').test(text));

/**
 * Rank the city's request types for a category; community/internal types
 * excluded. 3 = names our category only ("Sidewalk Defect"), 2 = names it
 * alongside another category ("Icy or Unshoveled Sidewalk"), 1 = city
 * catch-all ("Public Works Issue", "Other").
 */
export function rankRequestTypes(types: RequestTypeRef[], category: string): RequestTypeRef[] {
  const own = terms(category);
  const others = Object.entries(CATEGORY_TERMS)
    .filter(([k]) => k !== category)
    .flatMap(([, w]) => w)
    .filter((w) => !own.some((o) => o.includes(w) || w.includes(o)));
  const score = (title: string) =>
    has(title, own) ? (has(title, others) ? 2 : 3) : has(title, GENERIC_TERMS) ? 1 : 0;
  return types
    .filter((t) => t.organization && !/internal/i.test(`${t.organization} ${t.title}`) && NUMERIC_TYPE_URL.test(t.url))
    .map((t) => ({ t, score: score(t.title) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.t);
}

/** Answers for a request type, or null if a required question can't be answered truthfully. */
export function buildAnswers(
  questions: Question[],
  category: string,
  summary: string,
  description: string,
  address: string,
): Record<string, unknown> | null {
  const own = terms(category);
  const answers: Record<string, unknown> = {};
  for (const q of questions) {
    if (q.primary_key === 'summary') { answers.summary = summary; continue; }
    if (q.primary_key === 'description') { answers.description = description; continue; }
    if (!q.response_required || q.question_type === 'note' || q.question_type === 'file') continue;

    if (q.question_type === 'select' || q.question_type === 'multivaluelist') {
      const opts = q.select_values ?? [];
      const pick = opts.find((o) => has(o.name, own)) ??
        opts.find((o) => SAFE_OPTION.test(o.name.trim())) ??
        (opts.length === 1 ? opts[0] : undefined);
      if (!pick) return null;
      answers[q.primary_key] = q.question_type === 'multivaluelist' ? [pick.key] : pick.key;
    } else if ((q.question_type === 'text' || q.question_type === 'textarea') && ADDRESS_QUESTION.test(q.question ?? '')) {
      answers[q.primary_key] = address;
    } else {
      return null; // yes/no, number, date, phone…: we don't know the answer
    }
  }
  return answers;
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

/** Steps 1–2: the request type + answers we'd submit, or why we can't. */
export async function planSeeClickFixIssue(p: ScfPayload): Promise<
  { ok: true; requestTypeId: number; title: string; organization: string; answers: Record<string, unknown> } |
  { ok: false; error: string }
> {
  const form = await getJson(`${API}/issues/new?lat=${p.latitude}&lng=${p.longitude}`);
  const ranked = rankRequestTypes(form?.request_types ?? [], p.category);
  if (ranked.length === 0) return { ok: false, error: 'SeeClickFix: no city request type matches this category here' };

  const label = p.category.replace(/_/g, ' ');
  const address = p.address || `${p.latitude.toFixed(6)}, ${p.longitude.toFixed(6)}`;
  const summary = `${label[0].toUpperCase()}${label.slice(1)} at ${address}`.slice(0, 120);
  const description = p.image_url ? `${p.api_description}\n\nPhoto: ${p.image_url}` : p.api_description;

  for (const ref of ranked.slice(0, 4)) {
    const rt = await getJson(ref.url);
    const answers = buildAnswers(rt?.questions ?? [], p.category, summary, description, address);
    if (answers) return { ok: true, requestTypeId: Number(rt.id), title: ref.title, organization: ref.organization ?? '', answers };
  }
  return { ok: false, error: 'SeeClickFix: matching request types have required questions we cannot answer truthfully' };
}

/** Full submission. Returns the SeeClickFix issue id as ticketId. */
export async function submitSeeClickFixIssue(
  p: ScfPayload,
  token: string,
): Promise<{ ok: boolean; error?: string; ticketId?: string }> {
  if (!token) return { ok: false, error: 'SeeClickFix: SEECLICKFIX_API_KEY not set (API requires a personal access token)' };
  try {
    const plan = await planSeeClickFixIssue(p);
    if (!plan.ok) return { ok: false, error: plan.error };
    const res = await fetch(`${API}/issues`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'User-Agent': USER_AGENT,
      },
      body: JSON.stringify({
        lat: p.latitude,
        lng: p.longitude,
        address: p.address || `${p.latitude.toFixed(6)}, ${p.longitude.toFixed(6)}`,
        request_type_id: plan.requestTypeId,
        answers: plan.answers,
      }),
    });
    if (!res.ok) return { ok: false, error: `SeeClickFix HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}` };
    const j = await res.json().catch(() => null);
    return { ok: true, ticketId: j?.id ? String(j.id) : undefined };
  } catch (err) {
    return { ok: false, error: `SeeClickFix: ${String(err)}` };
  }
}
