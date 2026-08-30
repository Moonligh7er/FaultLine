import type { Report } from '../../types';
import { COMMERCIAL_PROPERTY_THRESHOLDS } from './thresholds';

// ============================================================
// Commercial-Property Aggregation Pipeline
//
// Individual commercial-property reports are NEVER publicly attributed
// on their own. Aggregation is the only public-attribution path — and
// only after the thresholds in ./thresholds.ts are met AND the right-
// of-reply window has closed without remediation.
//
// This module computes aggregation status. It does NOT publish; the
// publish step goes through the right-of-reply pipeline (DEFERRED #31
// reuses the #27 briefing-packet right-of-reply infra).
// ============================================================

export interface PropertyAggregation {
  businessAddressFull: string;
  reports: Report[];
  distinctReporterCount: number;
  earliestReportAt: string;
  latestReportAt: string;
  thresholdReached: boolean;
  status:
    | 'pending-single'
    | 'accumulating'
    | 'threshold-reached';
}

export interface ChainAggregation {
  chainIdentifier: string;
  reports: Report[];
  distinctLocationCount: number;
  distinctReporterCount: number;
  earliestReportAt: string;
  latestReportAt: string;
  thresholdReached: boolean;
  status:
    | 'accumulating'
    | 'threshold-reached';
}

// ── Property-level aggregation ────────────────────────────────────────────

export function aggregateByProperty(reports: Report[]): PropertyAggregation[] {
  const now = Date.now();
  const windowMs = COMMERCIAL_PROPERTY_THRESHOLDS.property.windowDays * 86400000;
  const relevant = reports.filter(
    (r) =>
      r.reportSubject === 'commercial_property' &&
      r.commercial &&
      now - Date.parse(r.createdAt) <= windowMs,
  );

  const grouped = new Map<string, Report[]>();
  for (const r of relevant) {
    const key = normalizeAddress(r.commercial!.businessAddressFull);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(r);
  }

  const aggregations: PropertyAggregation[] = [];
  for (const [key, group] of grouped) {
    const reporters = new Set(group.map((r) => r.userId || r.id));
    const reportCount = group.length;
    const thresholdReached =
      reportCount >= COMMERCIAL_PROPERTY_THRESHOLDS.property.minReports &&
      reporters.size >= COMMERCIAL_PROPERTY_THRESHOLDS.property.minDistinctReporters;

    let status: PropertyAggregation['status'];
    if (reportCount === 1) status = 'pending-single';
    else if (thresholdReached) status = 'threshold-reached';
    else status = 'accumulating';

    const timestamps = group.map((r) => Date.parse(r.createdAt)).sort((a, b) => a - b);
    aggregations.push({
      businessAddressFull: key,
      reports: group,
      distinctReporterCount: reporters.size,
      earliestReportAt: new Date(timestamps[0]).toISOString(),
      latestReportAt: new Date(timestamps[timestamps.length - 1]).toISOString(),
      thresholdReached,
      status,
    });
  }

  return aggregations;
}

// ── Chain-level aggregation ───────────────────────────────────────────────

export function aggregateByChain(reports: Report[]): ChainAggregation[] {
  const now = Date.now();
  const windowMs = COMMERCIAL_PROPERTY_THRESHOLDS.chain.windowDays * 86400000;
  const relevant = reports.filter(
    (r) =>
      r.reportSubject === 'commercial_property' &&
      r.commercial?.chainIdentifier &&
      now - Date.parse(r.createdAt) <= windowMs,
  );

  const grouped = new Map<string, Report[]>();
  for (const r of relevant) {
    const key = r.commercial!.chainIdentifier!;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(r);
  }

  const aggregations: ChainAggregation[] = [];
  for (const [chainIdentifier, group] of grouped) {
    const reporters = new Set(group.map((r) => r.userId || r.id));
    const locations = new Set(group.map((r) => normalizeAddress(r.commercial!.businessAddressFull)));
    const thresholdReached =
      group.length >= COMMERCIAL_PROPERTY_THRESHOLDS.chain.minReports &&
      locations.size >= COMMERCIAL_PROPERTY_THRESHOLDS.chain.minDistinctLocations &&
      reporters.size >= COMMERCIAL_PROPERTY_THRESHOLDS.chain.minDistinctReporters;

    const timestamps = group.map((r) => Date.parse(r.createdAt)).sort((a, b) => a - b);
    aggregations.push({
      chainIdentifier,
      reports: group,
      distinctLocationCount: locations.size,
      distinctReporterCount: reporters.size,
      earliestReportAt: new Date(timestamps[0]).toISOString(),
      latestReportAt: new Date(timestamps[timestamps.length - 1]).toISOString(),
      thresholdReached,
      status: thresholdReached ? 'threshold-reached' : 'accumulating',
    });
  }

  return aggregations;
}

// ── Internal helpers ──────────────────────────────────────────────────────

function normalizeAddress(address: string): string {
  return address
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/,\s*/g, ', ')
    .replace(/\bstreet\b/g, 'st')
    .replace(/\bavenue\b/g, 'ave')
    .replace(/\broad\b/g, 'rd')
    .replace(/\bboulevard\b/g, 'blvd')
    .trim();
}
