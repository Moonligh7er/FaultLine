import { supabase } from './supabase';
import { Report, MediaAttachment } from '../types';
import { uploadMedia } from './media';
import * as ImagePicker from 'expo-image-picker';

// ============================================================
// Repair Quality Verification
// After a report is marked "resolved," prompt nearby users
// to photograph the fix. AI compares before/after to grade
// the repair quality.
// ============================================================

export type RepairGrade = 'excellent' | 'good' | 'adequate' | 'poor' | 'failed';

export interface RepairVerification {
  reportId: string;
  verifiedByUserId: string;
  grade: RepairGrade;
  afterPhotoUrl: string;
  notes?: string;
  aiAssessment?: string;
  verifiedAt: string;
}

export interface RepairStats {
  totalVerified: number;
  gradeDistribution: Record<RepairGrade, number>;
  avgGradeScore: number; // 1-5
  poorRepairRate: number; // % rated poor or failed
}

export function gradeToScore(grade: RepairGrade): number {
  const map: Record<RepairGrade, number> = { excellent: 5, good: 4, adequate: 3, poor: 2, failed: 1 };
  return map[grade];
}

export function gradeColor(grade: RepairGrade): string {
  const map: Record<RepairGrade, string> = {
    excellent: '#4CAF50', good: '#8BC34A', adequate: '#FFC107', poor: '#FF9800', failed: '#F44336',
  };
  return map[grade];
}

export function gradeLabel(grade: RepairGrade): string {
  const map: Record<RepairGrade, string> = {
    excellent: 'Excellent — Proper professional repair',
    good: 'Good — Solid fix, should last',
    adequate: 'Adequate — Functional but not ideal',
    poor: 'Poor — Already showing signs of failure',
    failed: 'Failed — Not actually fixed or worse than before',
  };
  return map[grade];
}

// Submit a repair verification with photo
export async function submitRepairVerification(
  reportId: string,
  userId: string,
  grade: RepairGrade,
  photoUri: string,
  notes?: string,
): Promise<boolean> {
  // Upload the after photo
  const attachment: MediaAttachment = {
    id: `verify-${Date.now()}`,
    uri: photoUri,
    type: 'photo',
  };

  const uploaded = await uploadMedia(attachment, reportId);

  // Store verification
  const { error } = await supabase.from('repair_verifications').insert({
    report_id: reportId,
    user_id: userId,
    grade,
    after_photo_url: uploaded.uploadedUrl,
    notes,
    verified_at: new Date().toISOString(),
  });

  if (error) {
    // Table might not exist yet — store in report's resolved_media instead
    const { data: report } = await supabase
      .from('reports')
      .select('resolved_media')
      .eq('id', reportId)
      .single();

    const existing = report?.resolved_media || [];
    await supabase
      .from('reports')
      .update({
        resolved_media: [...existing, { ...uploaded, grade, notes, verifiedAt: new Date().toISOString() }],
      })
      .eq('id', reportId);
  }

  // If repair was graded poor/failed, bump the report status back
  if (grade === 'poor' || grade === 'failed') {
    await supabase
      .from('reports')
      .update({ status: 'in_progress', resolved_at: null })
      .eq('id', reportId);
  }

  return true;
}

// Request AI comparison of before/after photos
export async function aiVerifyRepair(
  beforePhotoUrl: string,
  afterPhotoUrl: string,
): Promise<{ grade: RepairGrade; assessment: string } | null> {
  const { data, error } = await supabase.functions.invoke('verify-repair', {
    body: { beforePhotoUrl, afterPhotoUrl },
  });

  if (error) return null;
  return data;
}

// Prompt user to verify a nearby resolved report
export async function captureVerificationPhoto(): Promise<string | null> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') return null;

  const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
  if (result.canceled) return null;

  return result.assets[0].uri;
}

// Get repair stats for an authority
export async function getRepairStatsForAuthority(authorityId: string): Promise<RepairStats> {
  const { data } = await supabase
    .from('reports')
    .select('resolved_media')
    .eq('authority_id', authorityId)
    .eq('status', 'resolved')
    .not('resolved_media', 'is', null);

  const grades: RepairGrade[] = [];
  for (const report of (data || [])) {
    const media = report.resolved_media || [];
    for (const m of media) {
      if (m.grade) grades.push(m.grade as RepairGrade);
    }
  }

  const distribution: Record<RepairGrade, number> = { excellent: 0, good: 0, adequate: 0, poor: 0, failed: 0 };
  for (const g of grades) distribution[g] = (distribution[g] || 0) + 1;

  const totalVerified = grades.length;
  const avgScore = totalVerified > 0 ? grades.reduce((sum, g) => sum + gradeToScore(g), 0) / totalVerified : 0;
  const poorRate = totalVerified > 0 ? ((distribution.poor + distribution.failed) / totalVerified) * 100 : 0;

  return { totalVerified, gradeDistribution: distribution, avgGradeScore: avgScore, poorRepairRate: poorRate };
}
