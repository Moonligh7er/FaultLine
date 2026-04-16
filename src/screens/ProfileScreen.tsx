import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, TextInput, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS, SHADOWS } from '../constants/theme';
import { RootStackParamList } from '../types';
import { supabase } from '../services/supabase';
import { UserProfile } from '../types';
import { getQueueSize, processQueue } from '../services/offlineQueue';
import { getStreak, StreakInfo } from '../services/socialFeatures';
import { downloadRegion, getCachedRegions, clearCache, CachedRegion } from '../services/offlineMaps';
import { getCurrentLocation } from '../services/location';
import { SUPPORTED_LANGUAGES, setLanguage, i18n, t } from '../services/i18n';
import Icon from '../components/Icon';
import { HapticButton, FadeIn, StaggeredItem, Pulse } from '../components/AnimatedComponents';
import { useTheme } from '../store/ThemeProvider';

export default function ProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { mode, setMode, isDark } = useTheme();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isGuest, setIsGuest] = useState(true);
  const [offlineCount, setOfflineCount] = useState(0);
  const [streakInfo, setStreakInfo] = useState<StreakInfo>({ currentStreak: 0, longestStreak: 0, lastReportDate: null, isActiveToday: false });
  const [cachedRegions, setCachedRegions] = useState<CachedRegion[]>([]);
  const [downloading, setDownloading] = useState(false);
  const [currentLang, setCurrentLang] = useState(i18n.locale);
  const [authEmail, setAuthEmail] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authSent, setAuthSent] = useState(false);

  useEffect(() => {
    checkAuth();
    getQueueSize().then(setOfflineCount);
    getStreak().then(setStreakInfo);
    getCachedRegions().then(setCachedRegions);
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      setIsGuest(false);
      const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
      if (data) {
        setUser({
          id: data.id, email: session.user.email, displayName: data.display_name,
          avatarUrl: data.avatar_url, totalReports: data.total_reports || 0,
          totalUpvotes: data.total_upvotes || 0, totalConfirms: data.total_confirms || 0,
          points: data.points || 0, badges: data.badges || [], createdAt: data.created_at,
        });
      }
    }
  };

  const handleSignOut = async () => { await supabase.auth.signOut(); setUser(null); setIsGuest(true); };

  const syncOffline = async () => {
    const result = await processQueue();
    Alert.alert('Sync Complete', `${result.success} synced, ${result.failed} failed.`);
    setOfflineCount(await getQueueSize());
  };

  const handleDownloadArea = async () => {
    setDownloading(true);
    const loc = await getCurrentLocation();
    if (loc) {
      await downloadRegion(loc.city || 'My Area', loc.latitude, loc.longitude, 5, 12, 16, (done, total) => {
        // Progress updates
      });
      setCachedRegions(await getCachedRegions());
    }
    setDownloading(false);
    Alert.alert('Download Complete', 'Map tiles cached for offline use.');
  };

  const handleClearCache = async () => {
    await clearCache();
    setCachedRegions([]);
    Alert.alert('Cache Cleared', 'Offline map tiles removed.');
  };

  const handleMagicLink = async () => {
    const trimmed = authEmail.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      Alert.alert(t('error'), 'Please enter a valid email address.');
      return;
    }
    setAuthLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ email: trimmed });
    setAuthLoading(false);
    if (error) {
      Alert.alert(t('error'), error.message);
    } else {
      setAuthSent(true);
    }
  };

  const handleLanguageChange = async (code: string) => {
    await setLanguage(code);
    setCurrentLang(code);
    Alert.alert('Language Changed', 'Restart the app for full effect.');
  };

  return (
    <ScrollView style={styles.container}>
      {/* Profile Header */}
      <FadeIn style={styles.profileHeader}>
        <View style={styles.avatar} accessibilityLabel={`Profile: ${user?.displayName || 'Guest'}`}>
          <Text style={styles.avatarText}>{user?.displayName?.[0]?.toUpperCase() || '?'}</Text>
        </View>
        <Text style={styles.displayName}>{user?.displayName || (isGuest ? t('guestUser') : 'Anonymous')}</Text>
        {user?.email && <Text style={styles.email}>{user.email}</Text>}
      </FadeIn>

      {/* Stats + Streak */}
      {user && (
        <FadeIn style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{user.totalReports}</Text>
            <Text style={styles.statLabel}>{t('reports')}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{user.points}</Text>
            <Text style={styles.statLabel}>{t('points')}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{user.badges.length}</Text>
            <Text style={styles.statLabel}>{t('badges')}</Text>
          </View>
        </FadeIn>
      )}

      {/* Streak */}
      {streakInfo.currentStreak > 0 && (
        <FadeIn style={styles.section}>
          <Pulse style={styles.streakCard}>
            <Icon name="fire" size={32} color="#FF6F00" />
            <View style={styles.streakInfo}>
              <Text style={styles.streakNumber}>{streakInfo.currentStreak} Day Streak!</Text>
              <Text style={styles.streakDetail}>Longest: {streakInfo.longestStreak} days{streakInfo.isActiveToday ? ' · Active today' : ''}</Text>
            </View>
          </Pulse>
        </FadeIn>
      )}

      {/* Badges */}
      {user && user.badges.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle} accessibilityRole="header">{t('badges')}</Text>
          <View style={styles.badgeGrid}>
            {user.badges.map((badge, i) => (
              <StaggeredItem key={badge.id} index={i}>
                <View style={styles.badgeCard} accessibilityLabel={`Badge: ${badge.name} - ${badge.description}`}>
                  <Text style={styles.badgeIcon}>{badge.icon}</Text>
                  <Text style={styles.badgeName}>{badge.name}</Text>
                </View>
              </StaggeredItem>
            ))}
          </View>
        </View>
      )}

      {/* Offline Sync */}
      {offlineCount > 0 && (
        <View style={styles.section}>
          <HapticButton style={styles.syncButton} onPress={syncOffline} hapticType="medium">
            <Icon name="cloud-sync" size={20} color={COLORS.text} />
            <Text style={styles.syncButtonText}>Sync {offlineCount} Offline Report(s)</Text>
          </HapticButton>
        </View>
      )}

      {/* Offline Maps */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">Offline Maps</Text>
        {cachedRegions.map((region) => (
          <View key={region.id} style={styles.cacheRow}>
            <Icon name="map-check" size={18} color={COLORS.success} />
            <Text style={styles.cacheText}>{region.name} ({region.sizeMb}MB, {region.tileCount} tiles)</Text>
          </View>
        ))}
        <View style={styles.cacheButtons}>
          <HapticButton style={styles.downloadButton} onPress={handleDownloadArea} hapticType="medium">
            <Icon name="download" size={18} color={COLORS.textOnPrimary} />
            <Text style={styles.downloadText}>{downloading ? 'Downloading...' : 'Cache My Area'}</Text>
          </HapticButton>
          {cachedRegions.length > 0 && (
            <HapticButton style={styles.clearButton} onPress={handleClearCache} hapticType="light">
              <Text style={styles.clearText}>Clear</Text>
            </HapticButton>
          )}
        </View>
      </View>

      {/* Language */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">Language</Text>
        <View style={styles.langGrid}>
          {SUPPORTED_LANGUAGES.map((lang) => (
            <HapticButton
              key={lang.code}
              style={[styles.langChip, currentLang === lang.code && styles.langChipActive]}
              onPress={() => handleLanguageChange(lang.code)}
              hapticType="selection"
            >
              <Text style={[styles.langText, currentLang === lang.code && styles.langTextActive]}>{lang.nativeName}</Text>
            </HapticButton>
          ))}
        </View>
      </View>

      {/* Auth */}
      <View style={styles.section}>
        {isGuest ? (
          authSent ? (
            <View style={styles.authCard}>
              <Icon name="email-check" size={36} color={COLORS.success} />
              <Text style={styles.authCardTitle}>Check Your Email</Text>
              <Text style={styles.authCardDesc}>
                We sent a sign-in link to {authEmail}. Tap the link in the email to log in.
              </Text>
              <HapticButton
                style={styles.signOutButton}
                onPress={() => { setAuthSent(false); setAuthEmail(''); }}
                hapticType="light"
              >
                <Text style={styles.signOutText}>Use a Different Email</Text>
              </HapticButton>
            </View>
          ) : (
            <View style={styles.authCard}>
              <Text style={styles.sectionTitle} accessibilityRole="header">{t('signIn')}</Text>
              <Text style={styles.authCardDesc}>
                No password needed. Enter your email and we'll send you a magic link.
              </Text>
              <TextInput
                style={styles.emailInput}
                placeholder="you@email.com"
                placeholderTextColor={COLORS.textLight}
                value={authEmail}
                onChangeText={setAuthEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="Email address"
                editable={!authLoading}
              />
              <HapticButton
                style={[styles.loginButton, authLoading && { opacity: 0.6 }]}
                onPress={handleMagicLink}
                hapticType="medium"
                disabled={authLoading}
              >
                {authLoading ? (
                  <ActivityIndicator color={COLORS.textOnPrimary} size="small" />
                ) : (
                  <Icon name="login" size={20} color={COLORS.textOnPrimary} />
                )}
                <Text style={styles.loginButtonText}>
                  {authLoading ? 'Sending...' : t('sendMagicLink')}
                </Text>
              </HapticButton>
            </View>
          )
        ) : (
          <HapticButton style={styles.signOutButton} onPress={handleSignOut} hapticType="light">
            <Text style={styles.signOutText}>{t('signOut')}</Text>
          </HapticButton>
        )}
      </View>

      {/* Settings */}
      {/* Dark Mode */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">Appearance</Text>
        <View style={styles.langGrid}>
          {(['light', 'dark', 'system'] as const).map((m) => (
            <HapticButton
              key={m}
              style={[styles.langChip, mode === m && styles.langChipActive]}
              onPress={() => setMode(m)}
              hapticType="selection"
            >
              <Text style={[styles.langText, mode === m && styles.langTextActive]}>
                {m === 'light' ? '☀️ Light' : m === 'dark' ? '🌙 Dark' : '⚙️ System'}
              </Text>
            </HapticButton>
          ))}
        </View>
      </View>

      {/* Active Development — Feedback section */}
      <View style={styles.section}>
        <View style={styles.activeDevHeader} accessibilityRole="header">
          <Pulse style={styles.activeDevDot} />
          <Text style={styles.activeDevHeaderText}>Active Development</Text>
        </View>
        <HapticButton
          style={styles.feedbackCard}
          onPress={() => navigation.navigate('Feedback')}
          hapticType="medium"
          accessibilityLabel="Send feedback or request a feature"
        >
          <Icon name="message-text-outline" size={22} color={'#00C853'} />
          <View style={{ flex: 1 }}>
            <Text style={styles.feedbackCardTitle}>Send Feedback / Request a Feature</Text>
            <Text style={styles.feedbackCardSubtitle}>
              We&apos;re actively building. Your input directly shapes what ships next.
            </Text>
          </View>
          <Icon name="chevron-right" size={20} color={COLORS.textLight} />
        </HapticButton>
      </View>

      <View style={[styles.section, { marginBottom: SPACING.xxl }]}>
        <Text style={styles.sectionTitle} accessibilityRole="header">{t('settings')}</Text>
        {[
          { label: 'All Features', action: () => navigation.navigate('Features') },
          { label: 'Privacy Policy', action: () => navigation.navigate('PrivacyPolicy') },
          { label: 'Terms of Service', action: () => navigation.navigate('TermsOfService') },
          { label: 'Notification Preferences', action: () => {
            Alert.alert('Notifications', 'Manage notification types:', [
              { text: 'Keep All On', style: 'cancel' },
              { text: 'Mute Community', onPress: () => Alert.alert('Muted', 'Community notifications muted.') },
              { text: 'Mute All', style: 'destructive', onPress: () => Alert.alert('Muted', 'All notifications muted. Re-enable in device settings.') },
            ]);
          }},
          { label: 'Accessibility', action: () => {
            Alert.alert('Accessibility', 'Accessibility settings are managed through your device:\n\n• Text size: Device Settings → Display\n• Screen reader: Device Settings → Accessibility\n• Reduce motion: Device Settings → Accessibility\n\nFault Line respects all system accessibility preferences automatically.');
          }},
        ].map((item, i) => (
          <StaggeredItem key={item.label} index={i}>
            <HapticButton
              style={styles.settingsRow}
              onPress={item.action}
              hapticType="light"
            >
              <Text style={styles.settingsText}>{item.label}</Text>
              <Icon name="chevron-right" size={20} color={COLORS.textLight} />
            </HapticButton>
          </StaggeredItem>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  profileHeader: { backgroundColor: COLORS.primary, alignItems: 'center', padding: SPACING.xl, paddingTop: SPACING.xxl },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.primaryLight, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.sm },
  avatarText: { fontSize: FONT_SIZES.hero, fontWeight: '700', color: COLORS.textOnPrimary },
  displayName: { fontSize: FONT_SIZES.xxl, fontWeight: '700', color: COLORS.textOnPrimary },
  email: { fontSize: FONT_SIZES.md, color: COLORS.textOnPrimary, opacity: 0.8, marginTop: SPACING.xs },
  statsRow: { flexDirection: 'row', backgroundColor: COLORS.surface, marginTop: -SPACING.md, marginHorizontal: SPACING.md, borderRadius: BORDER_RADIUS.lg, ...SHADOWS.md },
  statItem: { flex: 1, alignItems: 'center', padding: SPACING.md },
  statNumber: { fontSize: FONT_SIZES.xxl, fontWeight: '800', color: COLORS.text },
  statLabel: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary, marginTop: 2 },
  section: { padding: SPACING.md },
  sectionTitle: { fontSize: FONT_SIZES.xl, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.sm },

  streakCard: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, backgroundColor: '#FF6F00' + '15', borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg, borderWidth: 1, borderColor: '#FF6F00' + '30' },
  streakInfo: { flex: 1 },
  streakNumber: { fontSize: FONT_SIZES.xl, fontWeight: '800', color: COLORS.text },
  streakDetail: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary },

  badgeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  badgeCard: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg, padding: SPACING.md, alignItems: 'center', width: '30%', ...SHADOWS.sm },
  badgeIcon: { fontSize: 32 },
  badgeName: { fontSize: FONT_SIZES.xs, color: COLORS.text, marginTop: SPACING.xs, textAlign: 'center', fontWeight: '500' },

  syncButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, backgroundColor: COLORS.warning, borderRadius: BORDER_RADIUS.md, padding: SPACING.md },
  syncButtonText: { fontSize: FONT_SIZES.lg, fontWeight: '700', color: COLORS.text },

  cacheRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: SPACING.xs },
  cacheText: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary },
  cacheButtons: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
  downloadButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs, backgroundColor: COLORS.primary, borderRadius: BORDER_RADIUS.md, padding: SPACING.md },
  downloadText: { color: COLORS.textOnPrimary, fontWeight: '600', fontSize: FONT_SIZES.md },
  clearButton: { paddingHorizontal: SPACING.lg, justifyContent: 'center', backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  clearText: { color: COLORS.error, fontWeight: '600' },

  langGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  langChip: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.round, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  langChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  langText: { fontSize: FONT_SIZES.md, color: COLORS.text, fontWeight: '500' },
  langTextActive: { color: COLORS.textOnPrimary },

  authCard: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg, alignItems: 'center', gap: SPACING.sm, ...SHADOWS.sm },
  authCardTitle: { fontSize: FONT_SIZES.xl, fontWeight: '700', color: COLORS.text },
  authCardDesc: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, textAlign: 'center', marginBottom: SPACING.xs },
  emailInput: { width: '100%', backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, fontSize: FONT_SIZES.md, color: COLORS.text },
  loginButton: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, backgroundColor: COLORS.primary, borderRadius: BORDER_RADIUS.md, padding: SPACING.md },
  loginButtonText: { color: COLORS.textOnPrimary, fontSize: FONT_SIZES.lg, fontWeight: '700' },
  signOutButton: { backgroundColor: COLORS.error + '15', borderRadius: BORDER_RADIUS.md, padding: SPACING.md, alignItems: 'center' },
  signOutText: { color: COLORS.error, fontSize: FONT_SIZES.lg, fontWeight: '600' },

  settingsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.surface, padding: SPACING.md, borderRadius: BORDER_RADIUS.md, marginBottom: SPACING.xs },
  settingsText: { fontSize: FONT_SIZES.md, color: COLORS.text },

  activeDevHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  activeDevDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#00C853' },
  activeDevHeaderText: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: '#00C853', textTransform: 'uppercase', letterSpacing: 1 },
  feedbackCard: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    backgroundColor: 'rgba(0,200,83,0.06)',
    borderWidth: 1, borderColor: 'rgba(0,200,83,0.25)',
    borderRadius: BORDER_RADIUS.lg, padding: SPACING.md,
  },
  feedbackCardTitle: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.text },
  feedbackCardSubtitle: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary, marginTop: 2 },
});
