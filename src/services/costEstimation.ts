import { supabase } from './supabase';
import { ReportCategory, SizeRating, HazardLevel } from '../types';

// ============================================================
// Cost Estimation Engine
// Estimates repair costs per report and aggregates
// total deferred maintenance for cities/states.
// ============================================================

// Average repair costs (USD) by category and size
// Sources: FHWA, ASCE, municipal budget reports
const REPAIR_COSTS: Record<string, { min: number; max: number; avgBySize: Record<string, number> }> = {
  pothole: { min: 30, max: 300, avgBySize: { small: 35, medium: 75, large: 150, massive: 250 } },
  streetlight: { min: 150, max: 800, avgBySize: { small: 200, medium: 350, large: 500, massive: 750 } },
  sidewalk: { min: 200, max: 3000, avgBySize: { small: 300, medium: 800, large: 1500, massive: 2500 } },
  signage: { min: 100, max: 500, avgBySize: { small: 100, medium: 200, large: 350, massive: 450 } },
  drainage: { min: 500, max: 5000, avgBySize: { small: 500, medium: 1500, large: 3000, massive: 5000 } },
  graffiti: { min: 50, max: 500, avgBySize: { small: 75, medium: 150, large: 300, massive: 450 } },
  road_debris: { min: 50, max: 300, avgBySize: { small: 50, medium: 100, large: 200, massive: 300 } },
  guardrail: { min: 500, max: 5000, avgBySize: { small: 500, medium: 1500, large: 3000, massive: 5000 } },
  crosswalk: { min: 200, max: 2000, avgBySize: { small: 300, medium: 700, large: 1200, massive: 1800 } },
  traffic_signal: { min: 500, max: 15000, avgBySize: { small: 500, medium: 2000, large: 8000, massive: 15000 } },
  needed_traffic_light: { min: 30000, max: 150000, avgBySize: { small: 30000, medium: 50000, large: 100000, massive: 150000 } },
  water_main: { min: 1000, max: 50000, avgBySize: { small: 1500, medium: 5000, large: 20000, massive: 50000 } },
  sewer: { min: 1000, max: 30000, avgBySize: { small: 1500, medium: 5000, large: 15000, massive: 30000 } },
  bridge: { min: 5000, max: 500000, avgBySize: { small: 5000, medium: 25000, large: 100000, massive: 500000 } },
  fallen_tree: { min: 200, max: 3000, avgBySize: { small: 200, medium: 500, large: 1500, massive: 3000 } },
  snow_ice: { min: 100, max: 1000, avgBySize: { small: 100, medium: 300, large: 600, massive: 1000 } },
  accessibility: { min: 500, max: 10000, avgBySize: { small: 500, medium: 2000, large: 5000, massive: 10000 } },
  bike_lane: { min: 200, max: 5000, avgBySize: { small: 300, medium: 1000, large: 3000, massive: 5000 } },
  abandoned_vehicle: { min: 200, max: 500, avgBySize: { small: 200, medium: 300, large: 400, massive: 500 } },
  illegal_dumping: { min: 300, max: 5000, avgBySize: { small: 300, medium: 1000, large: 3000, massive: 5000 } },
  parking_meter: { min: 200, max: 2000, avgBySize: { small: 200, medium: 500, large: 1000, massive: 2000 } },
  park_playground: { min: 500, max: 20000, avgBySize: { small: 500, medium: 3000, large: 10000, massive: 20000 } },
  utility_pole: { min: 2000, max: 15000, avgBySize: { small: 2000, medium: 5000, large: 10000, massive: 15000 } },
  other: { min: 100, max: 5000, avgBySize: { small: 200, medium: 500, large: 2000, massive: 5000 } },
};

// Hazard multiplier — more dangerous = more expensive to fix properly
const HAZARD_MULTIPLIERS: Record<string, number> = {
  minor: 0.8,
  moderate: 1.0,
  significant: 1.2,
  dangerous: 1.5,
  extremely_dangerous: 2.0,
};

export interface CostEstimate {
  reportId: string;
  category: string;
  estimatedCostLow: number;
  estimatedCostHigh: number;
  estimatedCostMid: number;
}

export interface AggregateCost {
  entityName: string; // city, state
  totalEstimatedCost: number;
  unresolvedCost: number;
  resolvedCost: number;
  costByCategory: { category: string; cost: number; count: number }[];
  totalReports: number;
  unresolvedReports: number;
  formattedTotal: string; // "$2.3M"
  formattedUnresolved: string;
}

export function estimateRepairCost(
  category: ReportCategory,
  size?: SizeRating | null,
  hazardLevel?: HazardLevel,
): CostEstimate {
  const costs = REPAIR_COSTS[category] || REPAIR_COSTS['other'];
  const hazardMult = HAZARD_MULTIPLIERS[hazardLevel || 'moderate'] || 1.0;

  const baseCost = size ? (costs.avgBySize[size] || costs.avgBySize['medium']) : ((costs.min + costs.max) / 2);

  return {
    reportId: '',
    category,
    estimatedCostLow: Math.round(costs.min * hazardMult),
    estimatedCostHigh: Math.round(costs.max * hazardMult),
    estimatedCostMid: Math.round(baseCost * hazardMult),
  };
}

export async function getAggregateCost(
  state: string,
  city?: string,
): Promise<AggregateCost> {
  let query = supabase
    .from('reports')
    .select('category, size_rating, hazard_level, status')
    .eq('state', state);

  if (city) query = query.eq('city', city);

  const { data: reports } = await query;

  if (!reports || reports.length === 0) {
    return {
      entityName: city ? `${city}, ${state}` : state,
      totalEstimatedCost: 0, unresolvedCost: 0, resolvedCost: 0,
      costByCategory: [], totalReports: 0, unresolvedReports: 0,
      formattedTotal: '$0', formattedUnresolved: '$0',
    };
  }

  let totalCost = 0;
  let unresolvedCost = 0;
  let resolvedCost = 0;
  const catCosts: Record<string, { cost: number; count: number }> = {};

  for (const report of reports) {
    const estimate = estimateRepairCost(report.category, report.size_rating, report.hazard_level);
    const cost = estimate.estimatedCostMid;

    totalCost += cost;
    if (report.status === 'resolved') resolvedCost += cost;
    else unresolvedCost += cost;

    if (!catCosts[report.category]) catCosts[report.category] = { cost: 0, count: 0 };
    catCosts[report.category].cost += cost;
    catCosts[report.category].count += 1;
  }

  const costByCategory = Object.entries(catCosts)
    .map(([category, data]) => ({ category, ...data }))
    .sort((a, b) => b.cost - a.cost);

  return {
    entityName: city ? `${city}, ${state}` : state,
    totalEstimatedCost: totalCost,
    unresolvedCost,
    resolvedCost,
    costByCategory,
    totalReports: reports.length,
    unresolvedReports: reports.filter((r) => r.status !== 'resolved').length,
    formattedTotal: formatCurrency(totalCost),
    formattedUnresolved: formatCurrency(unresolvedCost),
  };
}

function formatCurrency(amount: number): string {
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
  return `$${amount}`;
}
