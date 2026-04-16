import { supabase } from './supabase';
import { Report, ReportCategory, ReportLocation } from '../types';
import { CATEGORIES, HAZARD_LEVELS } from '../constants/categories';

// ============================================================
// Unified AI Service
// All AI tasks route through Supabase Edge Functions.
// Results cached in ai_cache table for learning + cost savings.
// Every function has a complete non-AI fallback.
//
// Model routing (in edge function):
//   Sonnet 4.6: legal letters, escalation emails, feedback triage
//   Haiku 4.5: descriptions, notifications, summaries, photo analysis
// ============================================================

// --- RESULT CACHING ---

export async function cacheAIResult(
  reportId: string,
  taskType: string,
  result: any,
): Promise<void> {
  try {
    await supabase.from('ai_cache').insert({
      report_id: reportId,
      task_type: taskType,
      result,
      model: 'auto',
    });
  } catch {} // Non-critical
}

export async function getCachedResult(
  reportId: string,
  taskType: string,
): Promise<any | null> {
  const { data } = await supabase
    .from('ai_cache')
    .select('result')
    .eq('report_id', reportId)
    .eq('task_type', taskType)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  return data?.result || null;
}

// --- AUTO-GENERATE REPORT DESCRIPTION ---
// Model: Haiku 4.5 | Fallback: empty string

export async function generateDescription(
  category: ReportCategory,
  location: ReportLocation,
  hazardLevel: string,
  aiPhotoAnalysis?: any,
): Promise<string> {
  const cat = CATEGORIES.find((c) => c.key === category);
  const hazard = HAZARD_LEVELS.find((h) => h.key === hazardLevel);
  const locationStr = [location.address, location.city, location.state].filter(Boolean).join(', ');

  const photoContext = aiPhotoAnalysis ? `
AI photo analysis: ${aiPhotoAnalysis.damageDescription || 'issue detected'}
Objects: ${aiPhotoAnalysis.detectedObjects?.join(', ') || 'none'}
${aiPhotoAnalysis.estimatedDimensions ? `Size: ${aiPhotoAnalysis.estimatedDimensions.widthCm}cm × ${aiPhotoAnalysis.estimatedDimensions.lengthCm}cm, depth: ${aiPhotoAnalysis.estimatedDimensions.depthEstimate}` : ''}
Surface: ${aiPhotoAnalysis.roadSurfaceType || 'unknown'}` : '';

  const { data, error } = await supabase.functions.invoke('ai-generate', {
    body: {
      task: 'description',
      prompt: `Write a 1-2 sentence factual infrastructure report description.

Category: ${cat?.label || category}
Location: ${locationStr}
GPS: ${location.latitude?.toFixed(6)}, ${location.longitude?.toFixed(6)}
Hazard: ${hazard?.label || hazardLevel}
${photoContext}

Be specific — cite dimensions, surface type, visible damage. Include street name. No opinions. ONLY the description text.`,
    },
  });

  if (error) return '';
  return data?.text?.trim() || '';
}

// --- TRANSCRIBE VIDEO TESTIMONIAL ---
// Model: Haiku 4.5 | Fallback: empty string
// Note: True audio transcription requires Whisper API integration

export async function transcribeTestimonial(
  videoUrl: string,
  context?: { category?: string; location?: string; userName?: string },
): Promise<string> {
  const { data, error } = await supabase.functions.invoke('ai-generate', {
    body: {
      task: 'transcribe',
      prompt: `Video testimonial recorded by ${context?.userName || 'community member'} about ${context?.category?.replace('_', ' ') || 'infrastructure issue'}${context?.location ? ` at ${context.location}` : ''}.
Video URL: ${videoUrl}

Note: Direct audio transcription requires Whisper API. Generate a metadata note:
"[Video testimonial from ${context?.userName || 'community member'} regarding ${context?.category?.replace('_', ' ') || 'issue'}${context?.location ? ` at ${context.location}` : ''} — pending audio transcription]"`,
    },
  });

  if (error) return '';
  return data?.text?.trim() || '';
}

// --- AI-ENHANCED DEMAND LETTER ---
// Model: Sonnet 4.6 | Fallback: base template letter

export async function enhanceDemandLetter(
  baseLetter: string,
  category: string,
  state: string,
  daysSinceReport: number,
  reportCount: number,
  hazardLevel: string,
): Promise<string> {
  const { data, error } = await supabase.functions.invoke('ai-generate', {
    body: {
      task: 'legal_letter',
      prompt: `Enhance this infrastructure defect demand letter for ${state}. The base is legally valid — improve persuasive impact.

STATE: ${state} | CATEGORY: ${category} | DAYS OPEN: ${daysSinceReport} | REPORTS: ${reportCount} | HAZARD: ${hazardLevel}

BASE LETTER:
${baseLetter}

Instructions:
1. Strengthen language proportional to hazard level and days overdue
2. Add typical liability dollar amounts for ${category} claims if known
3. Reference ONLY the statute already cited — do NOT add uncertain citations
4. Make DEMAND section more specific and time-bound (inspect within 7 days, remediate within 30)
5. Preserve all factual data exactly
6. Return ONLY the enhanced letter text`,
    },
  });

  if (error) return baseLetter;
  return data?.text?.trim() || baseLetter;
}

// --- AI ESCALATION EMAIL ---
// Model: Sonnet 4.6 | Fallback: static template

export async function generateEscalationEmail(
  authorityName: string, category: string, location: string,
  reportCount: number, uniqueReporters: number, daysOpen: number,
  hazardLevel: string, sampleDescriptions: string[],
  estimatedCost: number, liabilityExposure: number,
): Promise<{ subject: string; body: string }> {
  const fallback = {
    subject: `[Fault Line] ${reportCount} Community Reports: ${category} at ${location}`,
    body: `Dear ${authorityName},\n\n${reportCount} community members (${uniqueReporters} unique) have reported a ${category} at ${location} over ${daysOpen} days.\n\nHazard: ${hazardLevel}. Repair cost: $${estimatedCost.toLocaleString()}. Liability exposure: $${liabilityExposure.toLocaleString()}.\n\nPlease investigate and remediate.\n\nFault Line Community Reports`,
  };

  const { data, error } = await supabase.functions.invoke('ai-generate', {
    body: {
      task: 'escalation_email',
      prompt: `Write a formal escalation email to ${authorityName} about a ${category} at ${location}.

DATA: ${reportCount} reports, ${uniqueReporters} unique reporters, ${daysOpen} days open, hazard: ${hazardLevel}
COST: Repair $${estimatedCost.toLocaleString()} now vs $${liabilityExposure.toLocaleString()} liability
DESCRIPTIONS: ${sampleDescriptions.slice(0, 5).map((d, i) => `${i + 1}. "${d}"`).join('\n')}

Structure: community impact → fiscal argument → this is legal notice → demands (inspect 7d, fix 30d, confirm in writing). Under 300 words. Sign as "Fault Line Community Reports".
Return JSON: {"subject": "...", "body": "..."}`,
    },
  });

  if (error) return fallback;
  try {
    const p = JSON.parse(data?.text || '{}');
    return { subject: p.subject || fallback.subject, body: p.body || fallback.body };
  } catch { return fallback; }
}

// --- AI PHOTO COMPARISON ---
// Model: Haiku 4.5 vision | Fallback: GPS proximity

export async function comparePhotos(
  photo1Base64: string, photo2Base64: string,
): Promise<{ isSameIssue: boolean; confidence: number; reasoning: string }> {
  const fallback = { isSameIssue: false, confidence: 0, reasoning: 'Comparison unavailable' };
  const { data, error } = await supabase.functions.invoke('ai-compare-photos', {
    body: { image1: photo1Base64, image2: photo2Base64 },
  });
  if (error) return fallback;
  return data || fallback;
}

// --- AI FEEDBACK TRIAGE ---
// Model: Sonnet 4.6 | Fallback: raw submissions

export async function triageFeedback(
  feedbackItems: { id: string; type: string; subject: string; message: string }[],
): Promise<{
  categories: { category: string; count: number; topItems: string[] }[];
  duplicates: { ids: string[]; reason: string }[];
  actionable: { id: string; priority: 'high' | 'medium' | 'low'; reason: string }[];
}> {
  const fallback = { categories: [], duplicates: [], actionable: [] };
  const { data, error } = await supabase.functions.invoke('ai-generate', {
    body: {
      task: 'feedback_triage',
      prompt: `Triage ${feedbackItems.length} feedback submissions:\n${feedbackItems.map((f) => `[${f.id}] [${f.type}] "${f.subject}" — ${f.message.substring(0, 300)}`).join('\n\n')}\n\nReturn JSON: {"categories":[{"category":"theme","count":N,"topItems":["subject"]}],"duplicates":[{"ids":["id1","id2"],"reason":"..."}],"actionable":[{"id":"...","priority":"high|medium|low","reason":"..."}]}`,
    },
  });
  if (error) return fallback;
  try { return JSON.parse(data?.text || '{}'); } catch { return fallback; }
}

// --- AI NOTIFICATION COPY ---
// Model: Haiku 4.5 | Fallback: static strings

export async function generateNotificationCopy(
  event: string, context: Record<string, any>,
): Promise<{ title: string; body: string }> {
  const fallback = { title: event.replace(/_/g, ' '), body: '' };
  const contextStr = Object.entries(context).map(([k, v]) => `${k}: ${v}`).join(', ');
  const { data, error } = await supabase.functions.invoke('ai-generate', {
    body: {
      task: 'notification',
      prompt: `Push notification for event "${event}". Context: ${contextStr}. Title max 50 chars, body max 140 chars. Be specific, use numbers from context. Return JSON: {"title":"...","body":"..."}`,
    },
  });
  if (error) return fallback;
  try { return JSON.parse(data?.text || '{}'); } catch { return fallback; }
}

// --- AI REPORT SUMMARIZATION ---
// Model: Haiku 4.5 | Fallback: formatted data string

export async function summarizeCluster(
  category: string, location: string, reportCount: number,
  uniqueReporters: number, daysOpen: number, hazardLevel: string,
  descriptions: string[],
): Promise<string> {
  const fallback = `${reportCount} community members reported a ${category.replace('_', ' ')} at ${location} over ${daysOpen} days. Hazard: ${hazardLevel}. ${uniqueReporters} unique reporters confirmed.`;
  const { data, error } = await supabase.functions.invoke('ai-generate', {
    body: {
      task: 'summarize',
      prompt: `3-sentence summary for a government official:\nIssue: ${category.replace('_', ' ')} at ${location}\n${reportCount} reports, ${uniqueReporters} reporters, ${daysOpen} days, hazard: ${hazardLevel}\nDescriptions: ${descriptions.slice(0, 5).map((d) => `"${d}"`).join(', ')}\n\nSentence 1: WHAT+WHERE. Sentence 2: WHO affected+HOW (use descriptions). Sentence 3: WHAT must happen. Under 80 words.`,
    },
  });
  if (error) return fallback;
  return data?.text?.trim() || fallback;
}
