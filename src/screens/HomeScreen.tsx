import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, RefreshControl,
  Dimensions, Platform, ListRenderItem,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS, SHADOWS } from '../constants/theme';
import { QUICK_CATEGORIES } from '../constants/categories';
import { RootTabParamList, RootStackParamList, Report, ReportCategory } from '../types';
import { getReports, upvoteReport } from '../services/reports';
import { getQueueSize } from '../services/offlineQueue';
import { getStreak } from '../services/socialFeatures';
import { shareReport } from '../services/sharing';
import { t } from '../services/i18n';
import { supabase } from '../services/supabase';
import SwipeableReportCard from '../components/SwipeableReportCard';
import { ReportCardSkeleton } from '../components/SkeletonLoader';
import SmartAdBanner from '../components/SmartAdBanner';
import Icon from '../components/Icon';
import { useVoiceCommand } from '../hooks/useVoiceCommand';
import { HapticButton, FadeIn, StaggeredItem, Pulse } from '../components/AnimatedComponents';
import { AudioGuideSession } from '../services/audioGuide';

const { width: SCREEN_W } = Dimensions.get('window');
const IS_SMALL_SCREEN = SCREEN_W < 375;

type HomeNavProp = NativeStackNavigationProp<RootStackParamList & RootTabParamList>;

export default function HomeScreen() {
  const navigation = useNavigation<HomeNavProp>();
  const insets = useSafeAreaInsets();
  const [recentReports, setRecentReports] = useState<Report[]>([]);
  const [offlineCount, setOfflineCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [streak, setStreak] = useState(0);

  const { isListening, startListening, isAvailable } = useVoiceCommand({
    onCommand: (command) => {
      if (command.includes('pothole')) startReport('pothole');
      else startReport();
    },
  });

  const loadData = useCallback(async () => {
    const [reports, queueSize, streakInfo] = await Promise.all([
      getReports({ limit: 20 }),
      getQueueSize(),
      getStreak(),
    ]);
    setRecentReports(reports);
    setOfflineCount(queueSize);
    setStreak(streakInfo.currentStreak);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const startReport = (category?: ReportCategory) => navigation.navigate('Report', category ? { prefillCategory: category } : undefined);

  const handleUpvote = async (reportId: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) await upvoteReport(reportId, session.user.id);
  };

  const handleShare = async (report: Report) => {
    await shareReport(report);
  };

  // FlatList header = hero + categories + ad
  const ListHeader = () => (
    <>
      {/* Hero — responsive height */}
      <FadeIn style={[styles.hero, { paddingTop: Math.max(insets.top, SPACING.lg) + SPACING.md }]}>
        <Text style={[styles.heroTitle, IS_SMALL_SCREEN && { fontSize: 28 }]} accessibilityRole="header">
          Fault Line
        </Text>
        <Text style={styles.heroSubtitle}>{t('heroSubtitle')}</Text>

        {streak > 0 && (
          <Pulse style={styles.streakBadge}>
            <Icon name="fire" size={16} color="#FF6F00" />
            <Text style={styles.streakText}>{streak} day streak!</Text>
          </Pulse>
        )}

        <View style={styles.heroButtons}>
          <HapticButton
            style={[styles.reportButton, { minHeight: 48, minWidth: 48 }]}
            onPress={() => startReport()}
            hapticType="medium"
          >
            <Icon name="plus" size={20} color={COLORS.textOnPrimary} />
            <Text style={styles.reportButtonText} accessibilityLabel={t('newReport')}>{IS_SMALL_SCREEN ? 'New' : t('newReport')}</Text>
          </HapticButton>
          <HapticButton
            style={[styles.quickButton, { minHeight: 48, minWidth: 48 }]}
            onPress={() => navigation.navigate('Report', { quickMode: true })}
            hapticType="medium"
          >
            <Icon name="lightning-bolt" size={20} color={COLORS.textOnPrimary} />
            <Text style={styles.quickButtonText}>{t('quickReportLabel')}</Text>
          </HapticButton>
          {isAvailable && (
            <HapticButton
              style={[styles.iconButton, isListening && styles.iconButtonActive]}
              onPress={startListening}
              hapticType="heavy"
            >
              <Icon name={isListening ? 'microphone' : 'microphone-outline'} size={22} color={COLORS.textOnPrimary} />
            </HapticButton>
          )}
          <HapticButton style={styles.iconButton} onPress={() => navigation.navigate('ARView')} hapticType="medium">
            <Icon name="cube-scan" size={22} color={COLORS.textOnPrimary} />
          </HapticButton>
          <HapticButton
            style={styles.iconButton}
            onPress={() => { const s = new AudioGuideSession(undefined, () => loadData()); s.start(); }}
            hapticType="heavy"
          >
            <Icon name="account-voice" size={22} color={COLORS.textOnPrimary} />
          </HapticButton>
        </View>
      </FadeIn>

      {/* Offline Banner */}
      {offlineCount > 0 && (
        <FadeIn style={styles.offlineBanner}>
          <Icon name="cloud-off-outline" size={16} color={COLORS.text} />
          <Text style={styles.offlineBannerText}>{offlineCount} report(s) queued offline</Text>
        </FadeIn>
      )}

      {/* Quick Categories */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">{t('quickReport')}</Text>
        <View style={styles.categoryGrid}>
          {QUICK_CATEGORIES.map((cat, i) => (
            <StaggeredItem key={cat.key} index={i}>
              <HapticButton
                style={[styles.categoryCard, { minHeight: 72, minWidth: 72 }]}
                onPress={() => startReport(cat.key)}
                hapticType="light"
              >
                <Icon name={cat.icon} size={IS_SMALL_SCREEN ? 22 : 26} color={COLORS.primary} />
                <Text style={styles.categoryLabel} accessibilityLabel={`Report ${cat.label}`}>{cat.label}</Text>
              </HapticButton>
            </StaggeredItem>
          ))}
        </View>
      </View>

      <SmartAdBanner placement="home" />

      {/* Section header for reports list */}
      <View style={[styles.section, { paddingBottom: 0 }]}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle} accessibilityRole="header">{t('recentReports')}</Text>
          <HapticButton onPress={() => navigation.navigate('Map')} hapticType="light">
            <Text style={styles.seeAllText}>{t('seeMap')}</Text>
          </HapticButton>
        </View>
        {Platform.OS === 'ios' && (
          <Text style={styles.swipeHint}>Swipe right to upvote, left to share</Text>
        )}
      </View>
    </>
  );

  const ListEmpty = () => (
    <FadeIn style={styles.emptyState}>
      <Icon name="clipboard-text-outline" size={48} color={COLORS.textLight} />
      <Text style={styles.emptyText}>{t('noReportsYet')}</Text>
      <Text style={styles.emptySubtext}>{t('beFirst')}</Text>
    </FadeIn>
  );

  const renderReport: ListRenderItem<Report> = ({ item, index }) => (
    <StaggeredItem index={index} style={{ paddingHorizontal: SPACING.md }}>
      <SwipeableReportCard
        report={item}
        onPress={() => navigation.navigate('ReportDetail', { reportId: item.id })}
        onUpvote={() => handleUpvote(item.id)}
        onShare={() => handleShare(item)}
      />
    </StaggeredItem>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <ListHeader />
        <View style={{ paddingHorizontal: SPACING.md }}>
          <ReportCardSkeleton />
          <ReportCardSkeleton />
          <ReportCardSkeleton />
        </View>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      data={recentReports}
      renderItem={renderReport}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={ListHeader}
      ListEmptyComponent={ListEmpty}
      contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      showsVerticalScrollIndicator={false}
      initialNumToRender={5}
      maxToRenderPerBatch={10}
      windowSize={5}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  hero: { backgroundColor: COLORS.primary, padding: SPACING.lg, alignItems: 'center' },
  heroTitle: { fontSize: FONT_SIZES.hero, fontWeight: '800', color: COLORS.textOnPrimary, marginBottom: SPACING.xs },
  heroSubtitle: { fontSize: FONT_SIZES.md, color: COLORS.textOnPrimary, opacity: 0.9, marginBottom: SPACING.sm, textAlign: 'center' },
  streakBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs, borderRadius: BORDER_RADIUS.round, marginBottom: SPACING.md },
  streakText: { color: COLORS.textOnPrimary, fontSize: FONT_SIZES.sm, fontWeight: '700' },
  heroButtons: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, flexWrap: 'wrap', justifyContent: 'center' },
  reportButton: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.secondary, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.round, ...SHADOWS.md },
  reportButtonText: { color: COLORS.textOnPrimary, fontSize: FONT_SIZES.lg, fontWeight: '700' },
  quickButton: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.accent, paddingHorizontal: SPACING.md, paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.round, ...SHADOWS.md },
  quickButtonText: { color: COLORS.textOnPrimary, fontSize: FONT_SIZES.md, fontWeight: '700' },
  iconButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.25)', justifyContent: 'center', alignItems: 'center' },
  iconButtonActive: { backgroundColor: COLORS.error },
  offlineBanner: { backgroundColor: COLORS.warning, padding: SPACING.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs },
  offlineBannerText: { color: COLORS.text, fontSize: FONT_SIZES.sm, fontWeight: '600' },
  section: { padding: SPACING.md },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  sectionTitle: { fontSize: FONT_SIZES.xl, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.sm },
  seeAllText: { color: COLORS.primary, fontSize: FONT_SIZES.md, fontWeight: '600' },
  swipeHint: { fontSize: FONT_SIZES.xs, color: COLORS.textLight, fontStyle: 'italic', marginBottom: SPACING.sm },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  categoryCard: { width: '23%', backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg, padding: SPACING.sm, alignItems: 'center', ...SHADOWS.sm },
  categoryLabel: { fontSize: FONT_SIZES.xs, color: COLORS.text, textAlign: 'center', fontWeight: '500', marginTop: SPACING.xs },
  emptyState: { alignItems: 'center', padding: SPACING.xxl },
  emptyText: { fontSize: FONT_SIZES.lg, fontWeight: '600', color: COLORS.text, marginTop: SPACING.sm },
  emptySubtext: { fontSize: FONT_SIZES.md, color: COLORS.textSecondary, marginTop: SPACING.xs },
});
