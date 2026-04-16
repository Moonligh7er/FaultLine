import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS, SHADOWS } from '../constants/theme';
import { supabase } from '../services/supabase';
import { getCurrentLocation } from '../services/location';
import { getPredictionZones, PredictionZone } from '../services/predictiveAnalytics';
import { getLeaderboard, getNeighborhoodFeed, LeaderboardEntry, NeighborhoodActivity } from '../services/socialFeatures';
import { t } from '../services/i18n';
import SmartAdBanner from '../components/SmartAdBanner';
import Icon from '../components/Icon';
import { FadeIn, StaggeredItem } from '../components/AnimatedComponents';
import { HapticButton } from '../components/AnimatedComponents';
import { ReportCardSkeleton } from '../components/SkeletonLoader';

export default function DashboardScreen() {
  const [totalReports, setTotalReports] = useState(0);
  const [resolvedReports, setResolvedReports] = useState(0);
  const [pendingReports, setPendingReports] = useState(0);
  const [categoryBreakdown, setCategoryBreakdown] = useState<{ category: string; count: number }[]>([]);
  const [predictions, setPredictions] = useState<PredictionZone[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [feed, setFeed] = useState<NeighborhoodActivity[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'stats' | 'predictions' | 'leaderboard' | 'feed'>('stats');

  const loadData = async () => {
    const [totalResult, resolvedResult, pendingResult] = await Promise.all([
      supabase.from('reports').select('*', { count: 'exact', head: true }),
      supabase.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'resolved'),
      supabase.from('reports').select('*', { count: 'exact', head: true }).in('status', ['submitted', 'acknowledged', 'in_progress']),
    ]);

    setTotalReports(totalResult.count || 0);
    setResolvedReports(resolvedResult.count || 0);
    setPendingReports(pendingResult.count || 0);

    const { data: catData } = await supabase.from('reports').select('category');
    const catCounts: Record<string, number> = {};
    (catData || []).forEach((r: any) => { catCounts[r.category] = (catCounts[r.category] || 0) + 1; });
    setCategoryBreakdown(Object.entries(catCounts).map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count).slice(0, 5));

    // Load predictions, leaderboard, feed
    const loc = await getCurrentLocation();
    if (loc) {
      const [preds, lb, nf] = await Promise.all([
        getPredictionZones(loc.latitude, loc.longitude),
        getLeaderboard('global'),
        getNeighborhoodFeed(loc.latitude, loc.longitude),
      ]);
      setPredictions(preds);
      setLeaderboard(lb);
      setFeed(nf);
    } else {
      setLeaderboard(await getLeaderboard('global'));
    }

    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);
  const onRefresh = async () => { setRefreshing(true); await loadData(); setRefreshing(false); };

  const fixRate = totalReports > 0 ? Math.round((resolvedReports / totalReports) * 100) : 0;

  const tabs = [
    { key: 'stats' as const, icon: 'chart-bar', label: 'Stats' },
    { key: 'predictions' as const, icon: 'crystal-ball', label: t('predictions') },
    { key: 'leaderboard' as const, icon: 'trophy', label: t('leaderboard') },
    { key: 'feed' as const, icon: 'newspaper', label: t('neighborhood') },
  ];

  return (
    <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <FadeIn>
        <Text style={styles.title} accessibilityRole="header">{t('communityDashboard')}</Text>
      </FadeIn>

      {/* Tab Bar */}
      <View style={styles.tabBar}>
        {tabs.map((tab) => (
          <HapticButton
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
            hapticType="selection"
          >
            <Icon name={tab.icon} size={18} color={activeTab === tab.key ? COLORS.textOnPrimary : COLORS.textSecondary} />
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
          </HapticButton>
        ))}
      </View>

      {/* Stats Tab */}
      {activeTab === 'stats' && (
        <FadeIn>
          <View style={styles.statGrid}>
            <View style={[styles.statCard, { backgroundColor: COLORS.info + '15' }]} accessibilityLabel={`${totalReports} total reports`}>
              <Text style={styles.statNumber}>{totalReports}</Text>
              <Text style={styles.statLabel}>{t('totalReports')}</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: COLORS.success + '15' }]} accessibilityLabel={`${resolvedReports} resolved`}>
              <Text style={styles.statNumber}>{resolvedReports}</Text>
              <Text style={styles.statLabel}>{t('resolved')}</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: COLORS.warning + '15' }]} accessibilityLabel={`${pendingReports} pending`}>
              <Text style={styles.statNumber}>{pendingReports}</Text>
              <Text style={styles.statLabel}>{t('pending')}</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: COLORS.accent + '15' }]} accessibilityLabel={`${fixRate}% fix rate`}>
              <Text style={styles.statNumber}>{fixRate}%</Text>
              <Text style={styles.statLabel}>{t('fixRate')}</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('topCategories')}</Text>
            {categoryBreakdown.length > 0 ? categoryBreakdown.map((cat, i) => (
              <StaggeredItem key={cat.category} index={i} style={styles.barRow}>
                <Text style={styles.barLabel}>{i + 1}. {cat.category.replace('_', ' ')}</Text>
                <View style={styles.barContainer}>
                  <View style={[styles.bar, { width: `${Math.max((cat.count / (categoryBreakdown[0]?.count || 1)) * 100, 10)}%` }]} />
                </View>
                <Text style={styles.barValue}>{cat.count}</Text>
              </StaggeredItem>
            )) : <Text style={styles.emptyText}>No data yet</Text>}
          </View>
        </FadeIn>
      )}

      {/* Predictions Tab */}
      {activeTab === 'predictions' && (
        <FadeIn style={styles.section}>
          <Text style={styles.sectionTitle}>Risk Predictions</Text>
          {loading ? <ReportCardSkeleton /> : predictions.length > 0 ? predictions.map((pred, i) => (
            <StaggeredItem key={pred.id} index={i}>
              <View style={styles.predictionCard}>
                <View style={styles.predictionHeader}>
                  <View style={[styles.riskBadge, { backgroundColor: pred.risk_score >= 60 ? COLORS.error + '20' : COLORS.warning + '20' }]}>
                    <Text style={[styles.riskScore, { color: pred.risk_score >= 60 ? COLORS.error : COLORS.warning }]}>{pred.risk_score}</Text>
                  </View>
                  <View style={styles.predictionInfo}>
                    <Text style={styles.predictionCategory}>{pred.predicted_category.replace('_', ' ')}</Text>
                    <Text style={styles.predictionTimeframe}>{pred.predicted_timeframe}</Text>
                  </View>
                </View>
                {pred.contributing_factors.map((f, j) => (
                  <View key={j} style={styles.factorRow}>
                    <Icon name="alert-circle-outline" size={14} color={COLORS.textSecondary} />
                    <Text style={styles.factorText}>{f}</Text>
                  </View>
                ))}
              </View>
            </StaggeredItem>
          )) : (
            <View style={styles.emptyCard}>
              <Icon name="shield-check" size={32} color={COLORS.accent} />
              <Text style={styles.emptyCardText}>No high-risk areas detected nearby</Text>
            </View>
          )}
        </FadeIn>
      )}

      {/* Leaderboard Tab */}
      {activeTab === 'leaderboard' && (
        <FadeIn style={styles.section}>
          <Text style={styles.sectionTitle}>Top Contributors</Text>
          {leaderboard.length > 0 ? leaderboard.slice(0, 10).map((entry, i) => (
            <StaggeredItem key={entry.userId} index={i}>
              <View style={styles.leaderRow}>
                <View style={[styles.rankBadge, i < 3 && styles.rankTop3]}>
                  <Text style={[styles.rankText, i < 3 && styles.rankTextTop3]}>
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${entry.rank}`}
                  </Text>
                </View>
                <View style={styles.leaderInfo}>
                  <Text style={styles.leaderName}>{entry.displayName}</Text>
                  <Text style={styles.leaderStats}>{entry.totalReports} reports · {entry.badges} badges</Text>
                </View>
                <Text style={styles.leaderPoints}>{entry.totalPoints} pts</Text>
              </View>
            </StaggeredItem>
          )) : <Text style={styles.emptyText}>No contributors yet — be the first!</Text>}
        </FadeIn>
      )}

      {/* Neighborhood Feed Tab */}
      {activeTab === 'feed' && (
        <FadeIn style={styles.section}>
          <Text style={styles.sectionTitle}>Neighborhood Activity</Text>
          {feed.length > 0 ? feed.slice(0, 15).map((item, i) => (
            <StaggeredItem key={`${item.type}-${i}`} index={i}>
              <View style={styles.feedItem}>
                <Icon
                  name={item.type === 'resolved' ? 'check-circle' : item.type === 'milestone' ? 'flag' : 'map-marker-plus'}
                  size={20}
                  color={item.type === 'resolved' ? COLORS.success : item.type === 'milestone' ? COLORS.secondary : COLORS.primary}
                />
                <View style={styles.feedContent}>
                  <Text style={styles.feedMessage}>{item.message}</Text>
                  <Text style={styles.feedTime}>{getTimeAgo(item.timestamp)}</Text>
                </View>
              </View>
            </StaggeredItem>
          )) : <Text style={styles.emptyText}>No recent activity nearby</Text>}
        </FadeIn>
      )}

      <SmartAdBanner placement="dashboard" />
      <View style={{ height: SPACING.xxl }} />
    </ScrollView>
  );
}

function getTimeAgo(dateString: string): string {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  title: { fontSize: FONT_SIZES.title, fontWeight: '700', color: COLORS.text, padding: SPACING.md, paddingBottom: 0 },

  tabBar: { flexDirection: 'row', padding: SPACING.sm, gap: SPACING.xs },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.round, backgroundColor: COLORS.surface },
  tabActive: { backgroundColor: COLORS.primary },
  tabText: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary, fontWeight: '600' },
  tabTextActive: { color: COLORS.textOnPrimary },

  statGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: SPACING.sm, gap: SPACING.sm },
  statCard: { width: '47%', borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg, alignItems: 'center', ...SHADOWS.sm },
  statNumber: { fontSize: FONT_SIZES.hero, fontWeight: '800', color: COLORS.text },
  statLabel: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, marginTop: SPACING.xs, fontWeight: '500' },

  section: { padding: SPACING.md },
  sectionTitle: { fontSize: FONT_SIZES.xl, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.md },

  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.sm },
  barLabel: { width: 100, fontSize: FONT_SIZES.sm, color: COLORS.text, fontWeight: '500', textTransform: 'capitalize' },
  barContainer: { flex: 1, height: 20, backgroundColor: COLORS.divider, borderRadius: BORDER_RADIUS.round, overflow: 'hidden', marginHorizontal: SPACING.sm },
  bar: { height: '100%', borderRadius: BORDER_RADIUS.round, backgroundColor: COLORS.primary },
  barValue: { width: 30, fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, textAlign: 'right', fontWeight: '600' },

  predictionCard: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.sm, ...SHADOWS.sm },
  predictionHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  riskBadge: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  riskScore: { fontSize: FONT_SIZES.xl, fontWeight: '800' },
  predictionInfo: { flex: 1 },
  predictionCategory: { fontSize: FONT_SIZES.lg, fontWeight: '600', color: COLORS.text, textTransform: 'capitalize' },
  predictionTimeframe: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary },
  factorRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginTop: SPACING.xs },
  factorText: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, flex: 1 },

  leaderRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, marginBottom: SPACING.xs, ...SHADOWS.sm },
  rankBadge: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.divider, justifyContent: 'center', alignItems: 'center', marginRight: SPACING.sm },
  rankTop3: { backgroundColor: COLORS.secondary + '20' },
  rankText: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.textSecondary },
  rankTextTop3: { fontSize: FONT_SIZES.lg },
  leaderInfo: { flex: 1 },
  leaderName: { fontSize: FONT_SIZES.md, fontWeight: '600', color: COLORS.text },
  leaderStats: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary },
  leaderPoints: { fontSize: FONT_SIZES.lg, fontWeight: '800', color: COLORS.primary },

  feedItem: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.divider },
  feedContent: { flex: 1 },
  feedMessage: { fontSize: FONT_SIZES.md, color: COLORS.text, lineHeight: 20 },
  feedTime: { fontSize: FONT_SIZES.xs, color: COLORS.textLight, marginTop: 2 },

  emptyText: { fontSize: FONT_SIZES.md, color: COLORS.textSecondary, textAlign: 'center', padding: SPACING.lg },
  emptyCard: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg, padding: SPACING.xl, alignItems: 'center', ...SHADOWS.sm },
  emptyCardText: { fontSize: FONT_SIZES.md, color: COLORS.textSecondary, marginTop: SPACING.sm, textAlign: 'center' },
});
