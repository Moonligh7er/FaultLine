import { ReportCategory, SizeRating, HazardLevel } from '../types';
import { estimateRepairCost } from './costEstimation';

// ============================================================
// Fiscal Impact Projections
// Project what happens if the issue ISN'T fixed.
// Show authorities: "Fixing now = $X. Ignoring = $Y liability."
// ============================================================

export interface FiscalProjection {
  currentRepairCost: number;
  projectedCost6Months: number;
  projectedCost12Months: number;
  liabilityExposure: number;
  averageClaimCost: number;
  probabilityOfClaim: number; // 0-1
  costOfInaction: number; // Total projected cost if ignored
  savingsIfFixedNow: number;
  summary: string;
}

// Deterioration multipliers — how much worse it gets over time
const DETERIORATION_RATES: Record<string, { sixMonth: number; twelveMonth: number }> = {
  pothole: { sixMonth: 4.0, twelveMonth: 12.0 }, // Potholes grow exponentially
  sidewalk: { sixMonth: 1.5, twelveMonth: 2.5 },
  streetlight: { sixMonth: 1.0, twelveMonth: 1.0 }, // Doesn't get more expensive, but liability grows
  bridge: { sixMonth: 2.0, twelveMonth: 5.0 },
  guardrail: { sixMonth: 1.2, twelveMonth: 1.5 },
  drainage: { sixMonth: 3.0, twelveMonth: 8.0 }, // Water damage compounds fast
  water_main: { sixMonth: 5.0, twelveMonth: 20.0 }, // Leaks cause massive secondary damage
  sewer: { sixMonth: 3.0, twelveMonth: 10.0 },
  fallen_tree: { sixMonth: 1.5, twelveMonth: 2.0 },
  utility_pole: { sixMonth: 1.5, twelveMonth: 3.0 },
};

// Average liability claim costs by category
const LIABILITY_CLAIMS: Record<string, { avgClaim: number; probability: number }> = {
  pothole: { avgClaim: 3500, probability: 0.15 }, // 15% chance of damage claim per pothole per year
  sidewalk: { avgClaim: 12000, probability: 0.08 }, // Trip and fall claims are expensive
  streetlight: { avgClaim: 25000, probability: 0.05 }, // Assault/accident in dark area
  guardrail: { avgClaim: 75000, probability: 0.03 }, // Vehicle crash without guardrail
  bridge: { avgClaim: 150000, probability: 0.01 },
  crosswalk: { avgClaim: 50000, probability: 0.04 }, // Pedestrian hit
  traffic_signal: { avgClaim: 100000, probability: 0.06 }, // Intersection collision
  drainage: { avgClaim: 15000, probability: 0.10 }, // Property flooding
  road_debris: { avgClaim: 5000, probability: 0.12 },
  snow_ice: { avgClaim: 8000, probability: 0.20 }, // Slip and fall very common
  accessibility: { avgClaim: 25000, probability: 0.05 }, // ADA violation suits
  bike_lane: { avgClaim: 20000, probability: 0.07 },
};

const DEFAULT_LIABILITY = { avgClaim: 5000, probability: 0.05 };
const DEFAULT_DETERIORATION = { sixMonth: 1.5, twelveMonth: 3.0 };

export function projectFiscalImpact(
  category: ReportCategory,
  size?: SizeRating | null,
  hazardLevel?: HazardLevel,
  daysSinceReport: number = 0,
  communityReports: number = 1,
): FiscalProjection {
  const currentCost = estimateRepairCost(category, size, hazardLevel);
  const deterioration = DETERIORATION_RATES[category] || DEFAULT_DETERIORATION;
  const liability = LIABILITY_CLAIMS[category] || DEFAULT_LIABILITY;

  // Hazard multiplier for liability probability
  const hazardMult: Record<string, number> = {
    minor: 0.5, moderate: 1.0, significant: 1.5, dangerous: 2.5, extremely_dangerous: 4.0,
  };
  const hMult = hazardMult[hazardLevel || 'moderate'] || 1.0;

  // More reports = higher traffic area = higher liability probability
  const trafficMult = Math.min(1 + (communityReports * 0.1), 3.0);

  const projectedCost6 = Math.round(currentCost.estimatedCostMid * deterioration.sixMonth);
  const projectedCost12 = Math.round(currentCost.estimatedCostMid * deterioration.twelveMonth);

  const claimProb = Math.min(liability.probability * hMult * trafficMult, 0.95);
  const avgClaim = liability.avgClaim * hMult;
  const liabilityExposure = Math.round(avgClaim * claimProb);

  const costOfInaction = projectedCost12 + liabilityExposure;
  const savingsIfFixedNow = costOfInaction - currentCost.estimatedCostMid;

  const summary = [
    `Fixing this ${category.replace('_', ' ')} now costs approximately $${currentCost.estimatedCostMid.toLocaleString()}.`,
    `If ignored for 6 months, repair cost rises to ~$${projectedCost6.toLocaleString()}.`,
    `If ignored for 12 months, repair cost rises to ~$${projectedCost12.toLocaleString()}.`,
    '',
    `Liability exposure: ${Math.round(claimProb * 100)}% probability of a damage claim averaging $${Math.round(avgClaim).toLocaleString()}.`,
    `Expected liability cost: $${liabilityExposure.toLocaleString()}.`,
    '',
    `Total cost of inaction (12 months): $${costOfInaction.toLocaleString()}.`,
    `Savings if fixed now: $${savingsIfFixedNow.toLocaleString()}.`,
    '',
    communityReports > 1
      ? `${communityReports} community members have reported this issue, indicating a high-traffic area with elevated liability risk.`
      : '',
  ].filter(Boolean).join('\n');

  return {
    currentRepairCost: currentCost.estimatedCostMid,
    projectedCost6Months: projectedCost6,
    projectedCost12Months: projectedCost12,
    liabilityExposure,
    averageClaimCost: Math.round(avgClaim),
    probabilityOfClaim: claimProb,
    costOfInaction,
    savingsIfFixedNow,
    summary,
  };
}
