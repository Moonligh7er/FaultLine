import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRoute } from '@react-navigation/native';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS, SHADOWS } from '../constants/theme';
import { CATEGORIES, HAZARD_LEVELS, SIZE_RATINGS, URGENCY_LEVELS, CONDITION_LEVELS } from '../constants/categories';
import { Share } from 'react-native';
import { Report, MediaAttachment } from '../types';
import { generateDemandLetter, generateAIEnhancedLetter } from '../services/legalGenerator';
import { generateClaimEvidence, shareClaimEvidence } from '../services/insuranceClaim';
import { getDeterioriationTimelapse, shareTimelapse } from '../services/deteriorationTimelapse';
import { captureVerificationPhoto, submitRepairVerification, RepairGrade } from '../services/repairVerification';
import { estimateRepairCost } from '../services/costEstimation';
import { projectFiscalImpact } from '../services/fiscalImpact';
import { recordTestimonial } from '../services/videoTestimonials';
import { HapticButton, FadeIn } from '../components/AnimatedComponents';
import { getReportById, upvoteReport, confirmReport, addResolvedPhoto } from '../services/reports';
import { getAuthorityById } from '../services/authorities';
import { shareReport } from '../services/sharing';
import { uploadMedia } from '../services/media';
import { supabase } from '../services/supabase';
import Icon from '../components/Icon';
import SkeletonLoader from '../components/SkeletonLoader';

export default function ReportDetailScreen() {
  const route = useRoute();
  const { reportId } = route.params as { reportId: string };
  const [report, setReport] = useState<Report | null>(null);
  const [authorityName, setAuthorityName] = useState('');
  const [loading, setLoading] = useState(true);

  // Validate UUID format to prevent deep link injection
  const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reportId || '');

  useEffect(() => {
    if (isValidUUID) loadReport();
    else setLoading(false);
  }, [reportId]);

  const loadReport = async () => {
    if (!isValidUUID) return;
    const r = await getReportById(reportId);
    setReport(r);
    if (r?.authorityId) {
      const auth = await getAuthorityById(r.authorityId);
      if (auth) setAuthorityName(auth.name);
    }
    setLoading(false);
  };

  const handleUpvote = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { Alert.alert('Sign in required', 'Please sign in to upvote.'); return; }
    const success = await upvoteReport(reportId, session.user.id);
    if (success) setReport((p) => p ? { ...p, upvoteCount: p.upvoteCount + 1 } : p);
  };

  const handleConfirm = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { Alert.alert('Sign in required', 'Please sign in to confirm.'); return; }
    const success = await confirmReport(reportId, session.user.id);
    if (success) setReport((p) => p ? { ...p, confirmCount: p.confirmCount + 1 } : p);
  };

  const handleShare = async () => {
    if (report) await shareReport(report);
  };

  const doVerify = async (grade: RepairGrade, photoUri: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { Alert.alert('Sign in required'); return; }
    await submitRepairVerification(reportId, session.user.id, grade, photoUri);
    Alert.alert('Verification submitted!', `You graded this repair as "${grade}".`);
    loadReport();
  };

  const handleAddResolvedPhoto = async () => {
    if (!report) return;
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (result.canceled) return;

    const attachment: MediaAttachment = {
      id: `resolved-${Date.now()}`,
      uri: result.assets[0].uri,
      type: 'photo',
    };

    try {
      const uploaded = await uploadMedia(attachment, report.id);
      const existing = report.resolvedMedia || [];
      await addResolvedPhoto(report.id, [...existing, uploaded]);
      setReport({ ...report, resolvedMedia: [...existing, uploaded] });
      Alert.alert('Photo added!', 'Thank you for confirming this fix.');
    } catch {
      Alert.alert('Upload failed', 'Could not upload the photo.');
    }
  };

  if (loading) {
    return (
      <ScrollView style={styles.container}>
        <View style={{ padding: SPACING.md }}>
          <SkeletonLoader height={60} />
          <SkeletonLoader height={40} style={{ marginTop: SPACING.md }} />
          <SkeletonLoader height={200} style={{ marginTop: SPACING.md }} />
        </View>
      </ScrollView>
    );
  }

  if (!report) {
    return (
      <View style={styles.emptyContainer}>
        <Icon name="alert-circle-outline" size={48} color={COLORS.textLight} />
        <Text style={styles.emptyText}>Report not found</Text>
      </View>
    );
  }

  const category = CATEGORIES.find((c) => c.key === report.category);
  const hazard = HAZARD_LEVELS.find((h) => h.key === report.severity.hazardLevel);
  const size = SIZE_RATINGS.find((s) => s.key === report.severity.sizeRating);
  const urgencyInfo = URGENCY_LEVELS.find((u) => u.key === report.severity.urgency);
  const conditionInfo = CONDITION_LEVELS.find((c) => c.key === report.severity.condition);

  const statusColors: Record<string, string> = {
    draft: COLORS.statusDraft, submitted: COLORS.statusSubmitted,
    acknowledged: COLORS.statusAcknowledged, in_progress: COLORS.statusInProgress,
    resolved: COLORS.statusResolved, closed: COLORS.statusClosed, rejected: COLORS.statusRejected,
  };

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <Icon name={category?.icon || 'clipboard-text'} size={32} color={COLORS.primary} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.categoryLabel}>{category?.label || report.category}</Text>
          <Text style={styles.location}>
            {report.location.address || report.location.city || 'Unknown'}
            {report.location.state ? `, ${report.location.state}` : ''}
          </Text>
        </View>
        <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
          <Icon name="share-variant" size={22} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      {/* Status */}
      <View style={[styles.statusBanner, { backgroundColor: statusColors[report.status] || COLORS.textSecondary }]}>
        <Text style={styles.statusText}>Status: {report.status.replace('_', ' ').toUpperCase()}</Text>
        {report.resolvedAt && (
          <Text style={styles.resolvedText}>Resolved: {new Date(report.resolvedAt).toLocaleDateString()}</Text>
        )}
      </View>

      {/* Photos */}
      {report.media.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Photos ({report.media.length})</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoScroll}>
            {report.media.map((m) => (
              <View key={m.id} style={styles.photoContainer}>
                {(m.uploadedUrl || m.thumbnailUrl) ? (
                  <Image source={{ uri: m.uploadedUrl || m.thumbnailUrl }} style={styles.photo} />
                ) : (
                  <View style={styles.photoPlaceholder}>
                    <Icon name={m.type === 'video' ? 'video' : 'image'} size={32} color={COLORS.textLight} />
                  </View>
                )}
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Before/After */}
      {report.status === 'resolved' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Before & After</Text>
          {report.resolvedMedia && report.resolvedMedia.length > 0 ? (
            <View style={styles.beforeAfter}>
              <View style={styles.baColumn}>
                <Text style={styles.baLabel}>Before</Text>
                {report.media[0]?.uploadedUrl ? (
                  <Image source={{ uri: report.media[0].uploadedUrl }} style={styles.baPhoto} />
                ) : (
                  <View style={styles.baPlaceholder}><Text style={styles.baPlaceholderText}>No photo</Text></View>
                )}
              </View>
              <Icon name="arrow-right" size={24} color={COLORS.textLight} />
              <View style={styles.baColumn}>
                <Text style={styles.baLabel}>After</Text>
                <Image source={{ uri: report.resolvedMedia[0].uploadedUrl }} style={styles.baPhoto} />
              </View>
            </View>
          ) : (
            <TouchableOpacity style={styles.addAfterButton} onPress={handleAddResolvedPhoto}>
              <Icon name="camera-plus" size={24} color={COLORS.primary} />
              <Text style={styles.addAfterText}>Add "after" photo to confirm fix</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Details */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Details</Text>
        <View style={styles.detailCard}>
          {size && <DetailRow icon="ruler" label="Size" value={size.label} />}
          <DetailRow icon="alert-circle" label="Hazard" value={hazard?.label || ''} valueColor={hazard?.color} />
          {urgencyInfo && <DetailRow icon="clock-fast" label="Urgency" value={urgencyInfo.label} valueColor={urgencyInfo.color} />}
          {conditionInfo && <DetailRow icon="wrench" label="Condition" value={conditionInfo.label} valueColor={conditionInfo.color} />}
          <DetailRow icon="calendar" label="Reported" value={new Date(report.createdAt).toLocaleString()} />
          {authorityName && <DetailRow icon="domain" label="Authority" value={authorityName} />}
          {report.sensorDetected && <DetailRow icon="vibrate" label="Detection" value="Sensor-triggered" />}
          <DetailRow icon="incognito" label="Anonymous" value={report.isAnonymous ? 'Yes' : 'No'} />
          {report.isQuickReport && <DetailRow icon="lightning-bolt" label="Type" value="Quick Report" />}
        </View>
      </View>

      {/* Description */}
      {report.description ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Description</Text>
          <Text style={styles.description}>{report.description}</Text>
        </View>
      ) : null}

      {/* Vote Buttons */}
      <View style={styles.voteSection}>
        <TouchableOpacity style={styles.voteButton} onPress={handleUpvote}>
          <Icon name="thumb-up" size={24} color={COLORS.primary} />
          <Text style={styles.voteCount}>{report.upvoteCount}</Text>
          <Text style={styles.voteLabel}>Upvote</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.voteButton} onPress={handleConfirm}>
          <Icon name="check-circle" size={24} color={COLORS.accent} />
          <Text style={styles.voteCount}>{report.confirmCount}</Text>
          <Text style={styles.voteLabel}>Confirm</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.voteButton} onPress={handleShare}>
          <Icon name="share-variant" size={24} color={COLORS.secondary} />
          <Text style={styles.voteCount}> </Text>
          <Text style={styles.voteLabel}>Share</Text>
        </TouchableOpacity>
      </View>

      {/* Accountability Tools */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">Accountability Tools</Text>

        {/* Cost Estimate */}
        {(() => {
          const cost = estimateRepairCost(report.category, report.severity.sizeRating, report.severity.hazardLevel);
          return (
            <View style={styles.costCard} accessibilityLabel={`Estimated repair cost: $${cost.estimatedCostLow} to $${cost.estimatedCostHigh}`}>
              <Icon name="currency-usd" size={20} color={COLORS.accent} />
              <Text style={styles.costText}>
                Estimated repair: ${cost.estimatedCostLow.toLocaleString()} – ${cost.estimatedCostHigh.toLocaleString()}
              </Text>
            </View>
          );
        })()}

        {/* Fiscal Impact */}
        <HapticButton
          style={styles.toolButton}
          hapticType="medium"
          onPress={() => {
            const daysSince = Math.floor((Date.now() - new Date(report.createdAt).getTime()) / 86400000);
            const fiscal = projectFiscalImpact(report.category, report.severity.sizeRating, report.severity.hazardLevel, daysSince, report.confirmCount + 1);
            Alert.alert('Fiscal Impact of Inaction', fiscal.summary, [
              { text: 'Share', onPress: () => Share.share({ message: fiscal.summary, title: 'Cost of Inaction' }) },
              { text: 'Close' },
            ]);
          }}
        >
          <Icon name="chart-timeline-variant" size={20} color={COLORS.warning} />
          <Text style={styles.toolButtonText}>Cost of Inaction Projection</Text>
          <Icon name="chevron-right" size={18} color={COLORS.textLight} />
        </HapticButton>

        {/* Video Testimonial */}
        {report.clusterId && (
          <HapticButton
            style={styles.toolButton}
            hapticType="medium"
            onPress={async () => {
              const { data: { session } } = await supabase.auth.getSession();
              if (!session?.user) { Alert.alert('Sign in required'); return; }
              const testimonial = await recordTestimonial(report.clusterId!, session.user.id, 'Community Member');
              if (testimonial) Alert.alert('Testimonial recorded!', 'Your voice will be included in escalation reports.');
            }}
          >
            <Icon name="video-account" size={20} color={COLORS.primary} />
            <Text style={styles.toolButtonText}>Record Video Testimonial (15s)</Text>
            <Icon name="chevron-right" size={18} color={COLORS.textLight} />
          </HapticButton>
        )}

        {/* Legal Demand Letter */}
        <HapticButton
          style={styles.toolButton}
          hapticType="medium"
          onPress={async () => {
            const letter = await generateAIEnhancedLetter(report, authorityName || 'Public Works', report.confirmCount + 1);
            Alert.alert(
              letter.isOverdue ? 'OVERDUE — Statutory Period Expired' : 'Demand Letter Generated',
              `${letter.daysSinceReport} days since report. ${letter.isOverdue ? `${letter.daysSinceReport - letter.noticePeriodDays} days past the ${letter.noticePeriodDays}-day statutory deadline.` : `${letter.noticePeriodDays - letter.daysSinceReport} days remain.`}\n\nStatute: ${letter.statute}`,
              [
                { text: 'Share Letter', onPress: () => Share.share({ message: letter.letterText, title: 'Demand Letter' }) },
                { text: 'Close' },
              ]
            );
          }}
        >
          <Icon name="gavel" size={20} color={COLORS.error} />
          <Text style={styles.toolButtonText}>Generate Legal Demand Letter</Text>
          <Icon name="chevron-right" size={18} color={COLORS.textLight} />
        </HapticButton>

        {/* Insurance Claim Package */}
        <HapticButton
          style={styles.toolButton}
          hapticType="medium"
          onPress={async () => {
            const evidence = await generateClaimEvidence(report);
            Alert.alert(
              'Insurance Claim Evidence',
              evidence.summary,
              [
                { text: 'Share Package', onPress: () => shareClaimEvidence(evidence) },
                { text: 'Close' },
              ]
            );
          }}
        >
          <Icon name="shield-car" size={20} color={COLORS.info} />
          <Text style={styles.toolButtonText}>Generate Insurance Claim Package</Text>
          <Icon name="chevron-right" size={18} color={COLORS.textLight} />
        </HapticButton>

        {/* Deterioration Timelapse */}
        {report.clusterId && (
          <HapticButton
            style={styles.toolButton}
            hapticType="medium"
            onPress={async () => {
              const timelapse = await getDeterioriationTimelapse(report.clusterId!);
              if (timelapse && timelapse.frames.length > 0) {
                Alert.alert(
                  `${timelapse.totalDays} Days of Neglect`,
                  `${timelapse.totalFrames} photos over ${timelapse.totalDays} days`,
                  [
                    { text: 'Share Timeline', onPress: () => shareTimelapse(timelapse) },
                    { text: 'Close' },
                  ]
                );
              } else {
                Alert.alert('No timeline yet', 'More photos from different dates needed to build a timelapse.');
              }
            }}
          >
            <Icon name="timelapse" size={20} color={COLORS.secondary} />
            <Text style={styles.toolButtonText}>View Deterioration Timeline</Text>
            <Icon name="chevron-right" size={18} color={COLORS.textLight} />
          </HapticButton>
        )}

        {/* Repair Verification (only for resolved reports) */}
        {report.status === 'resolved' && (
          <HapticButton
            style={styles.toolButton}
            hapticType="medium"
            onPress={async () => {
              const photoUri = await captureVerificationPhoto();
              if (!photoUri) return;
              Alert.alert('Grade the repair', 'How well was this fixed?', [
                { text: 'Excellent', onPress: () => doVerify('excellent', photoUri) },
                { text: 'Good', onPress: () => doVerify('good', photoUri) },
                { text: 'Poor', onPress: () => doVerify('poor', photoUri) },
                { text: 'Failed', onPress: () => doVerify('failed', photoUri) },
              ]);
            }}
          >
            <Icon name="check-decagram" size={20} color={COLORS.success} />
            <Text style={styles.toolButtonText}>Verify Repair Quality</Text>
            <Icon name="chevron-right" size={18} color={COLORS.textLight} />
          </HapticButton>
        )}
      </View>

      {/* Coordinates */}
      <View style={[styles.section, { marginBottom: SPACING.xxl }]}>
        <Text style={styles.coordsText}>
          {report.location.latitude.toFixed(6)}, {report.location.longitude.toFixed(6)}
        </Text>
      </View>
    </ScrollView>
  );
}

function DetailRow({ icon, label, value, valueColor }: { icon: string; label: string; value: string; valueColor?: string }) {
  return (
    <View style={detailStyles.row}>
      <Icon name={icon} size={18} color={COLORS.textSecondary} />
      <Text style={detailStyles.label}>{label}</Text>
      <Text style={[detailStyles.value, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </View>
  );
}

const detailStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.divider, gap: SPACING.sm },
  label: { fontSize: FONT_SIZES.md, color: COLORS.textSecondary, width: 80 },
  value: { flex: 1, fontSize: FONT_SIZES.md, fontWeight: '600', color: COLORS.text, textTransform: 'capitalize', textAlign: 'right' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  emptyText: { fontSize: FONT_SIZES.lg, color: COLORS.textSecondary, marginTop: SPACING.sm },

  header: { flexDirection: 'row', alignItems: 'center', padding: SPACING.md, backgroundColor: COLORS.surface },
  iconWrap: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.primary + '15',
    justifyContent: 'center', alignItems: 'center', marginRight: SPACING.md,
  },
  headerText: { flex: 1 },
  categoryLabel: { fontSize: FONT_SIZES.xxl, fontWeight: '700', color: COLORS.text },
  location: { fontSize: FONT_SIZES.md, color: COLORS.textSecondary, marginTop: 2 },
  shareButton: { padding: SPACING.sm },

  statusBanner: { padding: SPACING.md, alignItems: 'center' },
  statusText: { color: COLORS.textOnPrimary, fontSize: FONT_SIZES.lg, fontWeight: '700' },
  resolvedText: { color: COLORS.textOnPrimary, fontSize: FONT_SIZES.sm, marginTop: 2, opacity: 0.9 },

  section: { padding: SPACING.md },
  sectionTitle: { fontSize: FONT_SIZES.lg, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.sm },

  photoScroll: { marginHorizontal: -SPACING.md, paddingHorizontal: SPACING.md },
  photoContainer: { marginRight: SPACING.sm },
  photo: { width: 160, height: 160, borderRadius: BORDER_RADIUS.md, backgroundColor: COLORS.divider },
  photoPlaceholder: {
    width: 160, height: 160, borderRadius: BORDER_RADIUS.md, backgroundColor: COLORS.divider,
    justifyContent: 'center', alignItems: 'center',
  },

  beforeAfter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.md },
  baColumn: { alignItems: 'center', flex: 1 },
  baLabel: { fontSize: FONT_SIZES.sm, fontWeight: '700', color: COLORS.textSecondary, marginBottom: SPACING.xs },
  baPhoto: { width: '100%', height: 140, borderRadius: BORDER_RADIUS.md, backgroundColor: COLORS.divider },
  baPlaceholder: {
    width: '100%', height: 140, borderRadius: BORDER_RADIUS.md, backgroundColor: COLORS.divider,
    justifyContent: 'center', alignItems: 'center',
  },
  baPlaceholderText: { fontSize: FONT_SIZES.sm, color: COLORS.textLight },
  addAfterButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg,
    borderWidth: 2, borderColor: COLORS.primary + '40', borderStyle: 'dashed',
  },
  addAfterText: { fontSize: FONT_SIZES.md, color: COLORS.primary, fontWeight: '600' },

  detailCard: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg, padding: SPACING.md, ...SHADOWS.sm },
  description: {
    fontSize: FONT_SIZES.md, color: COLORS.text, lineHeight: 22,
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg, padding: SPACING.md, ...SHADOWS.sm,
  },

  voteSection: { flexDirection: 'row', padding: SPACING.md, gap: SPACING.md },
  voteButton: { flex: 1, backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg, padding: SPACING.md, alignItems: 'center', ...SHADOWS.sm },
  voteCount: { fontSize: FONT_SIZES.xxl, fontWeight: '800', color: COLORS.text, marginTop: SPACING.xs },
  voteLabel: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, marginTop: 2 },
  coordsText: { fontSize: FONT_SIZES.sm, color: COLORS.textLight, textAlign: 'center' },

  costCard: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: COLORS.accent + '10', borderRadius: BORDER_RADIUS.md, padding: SPACING.md, marginBottom: SPACING.sm },
  costText: { fontSize: FONT_SIZES.md, color: COLORS.text, fontWeight: '600' },
  toolButton: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, marginBottom: SPACING.xs, ...SHADOWS.sm },
  toolButtonText: { flex: 1, fontSize: FONT_SIZES.md, color: COLORS.text, fontWeight: '500' },
});
