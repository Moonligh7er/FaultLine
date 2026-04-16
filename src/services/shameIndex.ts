import { getCityHealthScore, HealthScore, gradeColor } from './healthScore';
import { getAggregateCost } from './costEstimation';
import { Share } from 'react-native';

// ============================================================
// Cross-Municipal Shame Index
// Public comparative rankings between neighboring cities.
// "Your city: D+. Neighboring town: B+."
// Competitive pressure drives improvement.
// ============================================================

export interface ShameIndexEntry {
  city: string;
  state: string;
  healthScore: HealthScore;
  estimatedDeferredCost: string;
  unresolvedReports: number;
  rank: number;
  comparisonText: string;
}

export interface ShameIndex {
  state: string;
  entries: ShameIndexEntry[];
  bestCity: ShameIndexEntry | null;
  worstCity: ShameIndexEntry | null;
  stateAvgScore: number;
  generatedAt: string;
  shareText: string;
}

export async function generateShameIndex(
  state: string,
  cities: string[],
): Promise<ShameIndex> {
  const entries: ShameIndexEntry[] = [];

  for (const city of cities) {
    const healthScore = await getCityHealthScore(city, state);
    if (!healthScore) continue;

    const costData = await getAggregateCost(state, city);

    entries.push({
      city,
      state,
      healthScore,
      estimatedDeferredCost: costData.formattedUnresolved,
      unresolvedReports: costData.unresolvedReports,
      rank: 0,
      comparisonText: '',
    });
  }

  // Sort by score (highest = best)
  entries.sort((a, b) => b.healthScore.numericScore - a.healthScore.numericScore);

  // Assign ranks and comparison text
  entries.forEach((entry, i) => {
    entry.rank = i + 1;
    if (i === 0) {
      entry.comparisonText = `Best in ${state} — setting the standard`;
    } else {
      const best = entries[0];
      const scoreDiff = best.healthScore.numericScore - entry.healthScore.numericScore;
      entry.comparisonText = `${scoreDiff} points behind ${best.city}`;
    }
  });

  const avgScore = entries.length > 0
    ? Math.round(entries.reduce((sum, e) => sum + e.healthScore.numericScore, 0) / entries.length)
    : 0;

  const bestCity = entries[0] || null;
  const worstCity = entries[entries.length - 1] || null;

  const shareText = generateShareText(state, entries, avgScore);

  return {
    state,
    entries,
    bestCity,
    worstCity,
    stateAvgScore: avgScore,
    generatedAt: new Date().toISOString(),
    shareText,
  };
}

function generateShareText(state: string, entries: ShameIndexEntry[], avgScore: number): string {
  if (entries.length === 0) return 'No data available yet.';

  const best = entries[0];
  const worst = entries[entries.length - 1];

  const lines = [
    `🏆 ${state} Infrastructure Report Card`,
    '',
    `State Average: ${avgScore}/100`,
    '',
    '📊 Rankings:',
    ...entries.slice(0, 10).map((e) =>
      `${e.rank}. ${e.city}: ${e.healthScore.grade} (${e.healthScore.numericScore}/100) — ${e.estimatedDeferredCost} in deferred repairs`
    ),
    '',
    `🥇 Best: ${best.city} (${best.healthScore.grade})`,
    `😬 Worst: ${worst.city} (${worst.healthScore.grade})`,
    '',
    `${worst.city} has ${worst.unresolvedReports} unresolved issues and ${worst.estimatedDeferredCost} in deferred maintenance.`,
    `${best.city} has a ${best.healthScore.breakdown.fixRate}% fix rate.`,
    '',
    'Data from Fault Line — Community Infrastructure Accountability Platform',
  ];

  return lines.join('\n');
}

export async function shareShameIndex(index: ShameIndex): Promise<void> {
  await Share.share({
    message: index.shareText,
    title: `${index.state} Infrastructure Report Card`,
  });
}

// Get comparison between two specific cities
export async function compareCities(
  city1: string,
  city2: string,
  state: string,
): Promise<string> {
  const score1 = await getCityHealthScore(city1, state);
  const score2 = await getCityHealthScore(city2, state);
  const cost1 = await getAggregateCost(state, city1);
  const cost2 = await getAggregateCost(state, city2);

  if (!score1 || !score2) return 'Insufficient data for comparison.';

  return [
    `${city1} vs ${city2} — Infrastructure Comparison`,
    '',
    `${city1}: Grade ${score1.grade} (${score1.numericScore}/100)`,
    `  Fix rate: ${score1.breakdown.fixRate}%`,
    `  Avg response: ${score1.avgResponseDays} days`,
    `  Deferred costs: ${cost1.formattedUnresolved}`,
    '',
    `${city2}: Grade ${score2.grade} (${score2.numericScore}/100)`,
    `  Fix rate: ${score2.breakdown.fixRate}%`,
    `  Avg response: ${score2.avgResponseDays} days`,
    `  Deferred costs: ${cost2.formattedUnresolved}`,
    '',
    score1.numericScore > score2.numericScore
      ? `${city1} outperforms ${city2} by ${score1.numericScore - score2.numericScore} points.`
      : `${city2} outperforms ${city1} by ${score2.numericScore - score1.numericScore} points.`,
  ].join('\n');
}
