import { supabase } from './supabase';

// ============================================================
// Contractor Accountability Tracker
// Track who repaired what, flag recurring failures,
// build a quality database for taxpayer transparency.
// ============================================================

export interface ContractorRecord {
  name: string;
  totalJobs: number;
  reReportedJobs: number; // Jobs where the fix failed (re-reported within 6 months)
  failureRate: number; // %
  avgRepairLifespan: number; // days before re-report
  categories: { category: string; count: number }[];
  qualityGrade: string; // A-F
}

export interface RepairJob {
  reportId: string;
  clusterId?: string;
  contractor?: string;
  repairedDate?: string;
  reReported: boolean;
  reReportedDate?: string;
  daysTillFailure?: number;
  category: string;
  location: string;
}

// Get contractor performance from resolved reports that were re-reported
export async function getContractorPerformance(
  city?: string,
  state?: string,
): Promise<ContractorRecord[]> {
  // In production, contractor data would come from FOIA'd work orders
  // stored in a contractors table. For now, we analyze repair patterns.

  // Get resolved reports that have been re-reported at the same location
  const { data: resolved } = await supabase
    .from('reports')
    .select('id, category, latitude, longitude, address, city, state, resolved_at, resolved_media')
    .eq('status', 'resolved')
    .not('resolved_at', 'is', null);

  if (!resolved) return [];

  // Check for re-reports at same location after resolution
  const { data: allReports } = await supabase
    .from('reports')
    .select('latitude, longitude, category, created_at, status')
    .neq('status', 'resolved');

  if (!allReports) return [];

  const gridSize = 0.0005; // ~50m cells
  const repairJobs: RepairJob[] = [];

  for (const repair of resolved) {
    const gridKey = `${Math.round(repair.latitude / gridSize)},${Math.round(repair.longitude / gridSize)},${repair.category}`;
    const resolvedDate = new Date(repair.resolved_at);

    // Check if same spot was re-reported within 6 months after resolution
    const reReport = allReports.find((r: any) => {
      const rKey = `${Math.round(r.latitude / gridSize)},${Math.round(r.longitude / gridSize)},${r.category}`;
      if (rKey !== gridKey) return false;
      const rDate = new Date(r.created_at);
      const daysDiff = (rDate.getTime() - resolvedDate.getTime()) / 86400000;
      return daysDiff > 0 && daysDiff < 180; // Re-reported within 6 months
    });

    // Extract contractor from resolved_media metadata if available
    const contractorName = repair.resolved_media?.find((m: any) => m.contractor)?.contractor;

    repairJobs.push({
      reportId: repair.id,
      contractor: contractorName || 'Unknown',
      repairedDate: repair.resolved_at,
      reReported: !!reReport,
      reReportedDate: reReport ? (reReport as any).created_at : undefined,
      daysTillFailure: reReport
        ? Math.round((new Date((reReport as any).created_at).getTime() - resolvedDate.getTime()) / 86400000)
        : undefined,
      category: repair.category,
      location: repair.address || `${repair.city}, ${repair.state}`,
    });
  }

  // Aggregate by contractor
  const contractors: Map<string, RepairJob[]> = new Map();
  for (const job of repairJobs) {
    const name = job.contractor || 'Unknown';
    if (!contractors.has(name)) contractors.set(name, []);
    contractors.get(name)!.push(job);
  }

  return Array.from(contractors.entries()).map(([name, jobs]) => {
    const totalJobs = jobs.length;
    const reReported = jobs.filter((j) => j.reReported).length;
    const failureRate = totalJobs > 0 ? Math.round((reReported / totalJobs) * 100) : 0;

    const lifespans = jobs.filter((j) => j.daysTillFailure).map((j) => j.daysTillFailure!);
    const avgLifespan = lifespans.length > 0
      ? Math.round(lifespans.reduce((a, b) => a + b, 0) / lifespans.length)
      : 0;

    const catCounts: Record<string, number> = {};
    jobs.forEach((j) => { catCounts[j.category] = (catCounts[j.category] || 0) + 1; });

    let grade = 'A';
    if (failureRate > 40) grade = 'F';
    else if (failureRate > 30) grade = 'D';
    else if (failureRate > 20) grade = 'C';
    else if (failureRate > 10) grade = 'B';

    return {
      name,
      totalJobs,
      reReportedJobs: reReported,
      failureRate,
      avgRepairLifespan: avgLifespan,
      categories: Object.entries(catCounts).map(([category, count]) => ({ category, count })),
      qualityGrade: grade,
    };
  }).sort((a, b) => b.failureRate - a.failureRate);
}
