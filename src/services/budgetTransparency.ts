import { supabase } from './supabase';

// ============================================================
// Budget Transparency
// Connect to municipal open budget data.
// Show where tax dollars are going vs where problems are.
// ============================================================

export interface BudgetData {
  city: string;
  state: string;
  fiscalYear: string;
  totalBudget?: number;
  roadMaintenanceBudget?: number;
  roadMaintenanceSpent?: number;
  publicWorksBudget?: number;
  publicWorksSpent?: number;
  source: string;
  sourceUrl?: string;
  lastUpdated: string;
}

export interface BudgetVsReality {
  city: string;
  state: string;
  budget: BudgetData | null;
  unresolvedReports: number;
  estimatedRepairCost: number;
  budgetUtilization: number | null; // % of budget spent
  fundingGap: number | null; // estimated cost - remaining budget
  costPerCapita?: number;
  summaryText: string;
}

// Known open data portals for MA/RI/NH municipalities
const OPEN_DATA_SOURCES: Record<string, { name: string; budgetUrl?: string; dataPortal?: string }> = {
  'Boston,MA': { name: 'City of Boston', budgetUrl: 'https://data.boston.gov', dataPortal: 'https://data.boston.gov/dataset/budget' },
  'Cambridge,MA': { name: 'City of Cambridge', dataPortal: 'https://data.cambridgema.gov' },
  'Somerville,MA': { name: 'City of Somerville', dataPortal: 'https://data.somervillema.gov' },
  'Providence,RI': { name: 'City of Providence', dataPortal: 'https://data.providenceri.gov' },
};

export async function getBudgetData(city: string, state: string): Promise<BudgetData | null> {
  // Check if we have cached budget data in Supabase
  const { data } = await supabase
    .from('budget_data')
    .select('*')
    .eq('city', city)
    .eq('state', state)
    .order('fiscal_year', { ascending: false })
    .limit(1);

  if (data && data.length > 0) {
    return {
      city: data[0].city,
      state: data[0].state,
      fiscalYear: data[0].fiscal_year,
      totalBudget: data[0].total_budget,
      roadMaintenanceBudget: data[0].road_maintenance_budget,
      roadMaintenanceSpent: data[0].road_maintenance_spent,
      publicWorksBudget: data[0].public_works_budget,
      publicWorksSpent: data[0].public_works_spent,
      source: data[0].source,
      sourceUrl: data[0].source_url,
      lastUpdated: data[0].updated_at,
    };
  }

  // Return known data source info even without cached numbers
  const source = OPEN_DATA_SOURCES[`${city},${state}`];
  if (source) {
    return {
      city, state,
      fiscalYear: new Date().getFullYear().toString(),
      source: source.name,
      sourceUrl: source.dataPortal || source.budgetUrl,
      lastUpdated: new Date().toISOString(),
    };
  }

  return null;
}

export async function getBudgetVsReality(
  city: string,
  state: string,
  estimatedRepairCost: number,
): Promise<BudgetVsReality> {
  const budget = await getBudgetData(city, state);

  const { count: unresolvedCount } = await supabase
    .from('reports')
    .select('*', { count: 'exact', head: true })
    .eq('city', city)
    .eq('state', state)
    .neq('status', 'resolved')
    .neq('status', 'closed');

  const unresolved = unresolvedCount || 0;

  let budgetUtilization: number | null = null;
  let fundingGap: number | null = null;

  if (budget?.roadMaintenanceBudget && budget?.roadMaintenanceSpent) {
    budgetUtilization = Math.round((budget.roadMaintenanceSpent / budget.roadMaintenanceBudget) * 100);
    const remaining = budget.roadMaintenanceBudget - budget.roadMaintenanceSpent;
    fundingGap = estimatedRepairCost > remaining ? estimatedRepairCost - remaining : 0;
  }

  const summaryParts: string[] = [];
  summaryParts.push(`${city}, ${state} has ${unresolved} unresolved infrastructure issues.`);
  summaryParts.push(`Estimated repair cost: ${formatCurrency(estimatedRepairCost)}.`);

  if (budget?.roadMaintenanceBudget) {
    summaryParts.push(`Road maintenance budget: ${formatCurrency(budget.roadMaintenanceBudget)} (FY${budget.fiscalYear}).`);
    if (budgetUtilization !== null) {
      summaryParts.push(`${budgetUtilization}% of the maintenance budget has been spent.`);
    }
    if (fundingGap && fundingGap > 0) {
      summaryParts.push(`Estimated funding gap: ${formatCurrency(fundingGap)}.`);
    }
  } else {
    summaryParts.push('Budget data not yet available for this municipality.');
    if (budget?.sourceUrl) {
      summaryParts.push(`Open data portal: ${budget.sourceUrl}`);
    }
  }

  return {
    city, state,
    budget,
    unresolvedReports: unresolved,
    estimatedRepairCost,
    budgetUtilization,
    fundingGap,
    summaryText: summaryParts.join(' '),
  };
}

function formatCurrency(amount: number): string {
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
  return `$${amount.toLocaleString()}`;
}
