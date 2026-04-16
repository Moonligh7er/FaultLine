import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import * as ImagePicker from 'expo-image-picker';
import { useRoute, useNavigation } from '@react-navigation/native';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS, SHADOWS } from '../constants/theme';
import {
  CATEGORIES, QUICK_CATEGORIES, SIZE_RATINGS, HAZARD_LEVELS,
  URGENCY_LEVELS, CONDITION_LEVELS,
} from '../constants/categories';
import {
  ReportCategory, SizeRating, HazardLevel, UrgencyLevel,
  ConditionLevel, MediaAttachment, ReportLocation, ReportSeverity,
} from '../types';
import { getCurrentLocation } from '../services/location';
import { createReport, checkRateLimit, updateReportMedia } from '../services/reports';
import { findAuthorityByLocation } from '../services/authorities';
import { submitToAuthority } from '../services/authorityApi';
import { addToQueue, isOnline } from '../services/offlineQueue';
import { uploadAllMedia } from '../services/media';
import { analyzePhoto, getConfidenceLabel, getConfidenceColor } from '../services/aiAnalysis';
import { generateDescription, cacheAIResult } from '../services/ai';
import { recordReportForStreak, awardPoints, POINT_VALUES } from '../services/socialFeatures';
import { checkEscalationProgress } from '../services/smartPush';
import { supabase } from '../services/supabase';
import { t } from '../services/i18n';
import { announce } from '../services/accessibility';
import Icon from '../components/Icon';
import { HapticButton, FadeIn, StaggeredItem } from '../components/AnimatedComponents';
import { useHaptics } from '../hooks/useHaptics';

interface NearbyCluster {
  id: string;
  category: string;
  report_count: number;
  address: string;
  centroid_latitude: number;
  centroid_longitude: number;
}

interface AIResult {
  detectedCategory: ReportCategory | null;
  confidence: number;
  suggestedSize: SizeRating | null;
  suggestedHazard: HazardLevel;
  damageDescription: string;
}

export default function ReportScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const haptics = useHaptics();
  const params = route.params as {
    prefillCategory?: ReportCategory; sensorTriggered?: boolean;
    quickMode?: boolean; existingClusterId?: string;
  } | undefined;

  const [category, setCategory] = useState<ReportCategory>(params?.prefillCategory || 'pothole');
  const [location, setLocation] = useState<ReportLocation | null>(null);
  const [description, setDescription] = useState('');
  const [sizeRating, setSizeRating] = useState<SizeRating>('medium');
  const [hazardLevel, setHazardLevel] = useState<HazardLevel>('moderate');
  const [urgency, setUrgency] = useState<UrgencyLevel>('medium');
  const [condition, setCondition] = useState<ConditionLevel>('broken');
  const [media, setMedia] = useState<MediaAttachment[]>([]);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [step, setStep] = useState(params?.quickMode ? -1 : 0);
  const [isQuickMode, setIsQuickMode] = useState(params?.quickMode || false);
  const [existingClusterId, setExistingClusterId] = useState(params?.existingClusterId);
  const [nearbyClusters, setNearbyClusters] = useState<NearbyCluster[]>([]);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  const [mapRegion, setMapRegion] = useState<Region | null>(null);
  const [aiResult, setAiResult] = useState<AIResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const sensorTriggered = params?.sensorTriggered || false;
  const categoryInfo = CATEGORIES.find((c) => c.key === category);

  useEffect(() => { loadLocation(); }, []);

  const loadLocation = async () => {
    const loc = await getCurrentLocation();
    if (loc) {
      setLocation(loc);
      setMapRegion({ latitude: loc.latitude, longitude: loc.longitude, latitudeDelta: 0.005, longitudeDelta: 0.005 });
      checkForDuplicates(loc.latitude, loc.longitude);
    }
  };

  const checkForDuplicates = async (lat: number, lng: number) => {
    const { data: fallback } = await supabase
      .from('report_clusters')
      .select('id, category, report_count, address, centroid_latitude, centroid_longitude')
      .eq('category', category)
      .neq('status', 'resolved').neq('status', 'closed').limit(5);
    if (fallback && fallback.length > 0) {
      const nearby = fallback.filter((c: any) => {
        const d = haversineKm(lat, lng, c.centroid_latitude, c.centroid_longitude);
        return d < 0.1;
      });
      setNearbyClusters(nearby);
      if (nearby.length > 0) setShowDuplicateWarning(true);
    }
  };

  // --- AI PHOTO ANALYSIS ---
  const runAIAnalysis = async (photoUri: string) => {
    setAnalyzing(true);
    announce('Analyzing photo with AI...');
    const result = await analyzePhoto(photoUri);
    setAnalyzing(false);
    if (result) {
      setAiResult(result as AIResult);
      if (result.detectedCategory) setCategory(result.detectedCategory);
      if (result.suggestedSize) setSizeRating(result.suggestedSize);
      if (result.suggestedHazard) setHazardLevel(result.suggestedHazard);
      haptics.success();
      announce(`AI detected: ${result.damageDescription}. Confidence: ${getConfidenceLabel(result.confidence)}`);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert(t('permissionNeeded'), 'Camera access is required.'); return; }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!result.canceled) {
      const newMedia: MediaAttachment = { id: `${Date.now()}`, uri: result.assets[0].uri, type: 'photo' };
      setMedia([...media, newMedia]);
      haptics.light();
      // Trigger AI analysis on first photo
      if (media.length === 0) runAIAnalysis(result.assets[0].uri);
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], allowsMultipleSelection: true, quality: 0.8 });
    if (!result.canceled) {
      const newMedia: MediaAttachment[] = result.assets.map((asset, i) => ({ id: `${Date.now()}-${i}`, uri: asset.uri, type: asset.type === 'video' ? 'video' as const : 'photo' as const }));
      setMedia([...media, ...newMedia]);
      haptics.light();
      if (media.length === 0 && newMedia[0].type === 'photo') runAIAnalysis(newMedia[0].uri);
    }
  };

  const removeMedia = (id: string) => { setMedia(media.filter((m) => m.id !== id)); haptics.selection(); };

  const handleMapPinDrag = (e: any) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setLocation((prev) => prev ? { ...prev, latitude, longitude } : { latitude, longitude });
    haptics.light();
  };

  const joinExistingCluster = (cluster: NearbyCluster) => {
    setExistingClusterId(cluster.id);
    setShowDuplicateWarning(false);
    haptics.medium();
    Alert.alert('Adding to existing report', `Your report joins ${cluster.report_count} others. This helps escalate faster!`);
  };

  const buildSeverity = (): ReportSeverity => {
    const dims = categoryInfo?.severityDimensions || ['hazard'];
    return {
      sizeRating: dims.includes('size') ? sizeRating : undefined,
      hazardLevel,
      urgency: dims.includes('urgency') ? urgency : undefined,
      condition: dims.includes('condition') ? condition : undefined,
    };
  };

  const isEmergencyFastTrack = () => hazardLevel === 'extremely_dangerous' || urgency === 'critical';

  const handleSubmit = async () => {
    if (!location) { Alert.alert(t('locationRequired')); return; }

    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const ok = await checkRateLimit(session.user.id);
      if (!ok) { Alert.alert(t('error'), t('rateLimit')); return; }
    }

    setSubmitting(true);
    haptics.medium();

    const authority = await findAuthorityByLocation(location.latitude, location.longitude, location.state, location.city);
    const severity = buildSeverity();
    const reportData = {
      userId: session?.user?.id,
      category, location, description, severity, media,
      status: 'submitted' as const,
      authorityId: authority?.id,
      clusterId: existingClusterId,
      isAnonymous, sensorDetected: sensorTriggered,
      offlineQueued: false, isQuickReport: isQuickMode,
    };

    const online = await isOnline();
    if (online) {
      setUploadProgress(t('submitting'));
      const result = await createReport(reportData);

      if (result && media.length > 0) {
        setUploadProgress(`Uploading media (0/${media.length})...`);
        try {
          const uploaded = await uploadAllMedia(media, result.id, (done, total) => {
            setUploadProgress(`Uploading media (${done}/${total})...`);
          });
          await updateReportMedia(result.id, uploaded);
        } catch (err) { console.error('Media upload failed:', err); }
      }

      if (result) {
        // Cache AI analysis if available
        if (aiResult) cacheAIResult(result.id, 'photo_analysis', aiResult).catch(() => {});

        // AI-generate description if user left it blank
        if (!description && location) {
          generateDescription(category, location, hazardLevel, aiResult)
            .then((aiDesc) => {
              if (aiDesc) {
                const { updateReportMedia: _unused, ...rest } = require('../services/reports');
                // Update report with AI description (non-blocking)
                supabase.from('reports').update({ description: aiDesc }).eq('id', result.id).then(() => {});
              }
            })
            .catch(() => {}); // Fallback: report works fine without AI description
        }

        // Award points
        if (session?.user) {
          const pts = media.length > 0 ? POINT_VALUES.submitWithPhoto : (isQuickMode ? POINT_VALUES.submitQuickReport : POINT_VALUES.submitReport);
          await awardPoints(session.user.id, pts, 'report_submitted');
          await recordReportForStreak();
        }

        // Try direct 311/API submission if authority supports it
        if (authority && authority.submissionMethods?.some((m) => m.method === 'api')) {
          submitToAuthority(result, authority).catch((err) => console.warn('[311 submit]', err?.message));
        }

        // Check escalation milestones
        if (result.clusterId) checkEscalationProgress(result.clusterId).catch((err) => console.warn('[escalation]', err?.message));

        haptics.success();
        announce(t('reportSubmitted'));

        Alert.alert(
          isEmergencyFastTrack() ? 'URGENT Report Submitted' : t('reportSubmitted'),
          isEmergencyFastTrack() ? 'Flagged as critical safety issue — fast-tracked for review.' : t('thankYou'),
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
      } else {
        haptics.error();
        await addToQueue(reportData);
        Alert.alert(t('error'), 'Saved for later.');
        navigation.goBack();
      }
    } else {
      await addToQueue(reportData);
      haptics.warning();
      Alert.alert(t('savedOffline'), t('willSubmitLater'), [{ text: 'OK', onPress: () => navigation.goBack() }]);
    }

    setSubmitting(false);
    setUploadProgress('');
  };

  // ========== AI RESULT BANNER ==========
  const AIBanner = () => {
    if (!aiResult) return null;
    return (
      <FadeIn style={styles.aiBanner}>
        <View style={styles.aiHeader}>
          <Icon name="robot" size={20} color={getConfidenceColor(aiResult.confidence)} />
          <Text style={styles.aiTitle}>AI Analysis</Text>
          <View style={[styles.aiConfBadge, { backgroundColor: getConfidenceColor(aiResult.confidence) + '20' }]}>
            <Text style={[styles.aiConfText, { color: getConfidenceColor(aiResult.confidence) }]}>
              {getConfidenceLabel(aiResult.confidence)}
            </Text>
          </View>
        </View>
        <Text style={styles.aiDesc}>{aiResult.damageDescription}</Text>
        {aiResult.detectedCategory && (
          <Text style={styles.aiSuggestion}>
            Suggested: {CATEGORIES.find((c) => c.key === aiResult.detectedCategory)?.label} · {HAZARD_LEVELS.find((h) => h.key === aiResult.suggestedHazard)?.label}
          </Text>
        )}
      </FadeIn>
    );
  };

  // ========== QUICK MODE ==========
  if (isQuickMode) {
    return (
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView style={styles.container}>
        <FadeIn style={styles.quickHeader}>
          <Icon name="lightning-bolt" size={28} color={COLORS.secondary} />
          <Text style={styles.quickTitle}>{t('quickReport')}</Text>
        </FadeIn>

        <View style={styles.quickSection}>
          <Text style={styles.fieldLabel} accessibilityRole="header">{t('whatsTheIssue')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {QUICK_CATEGORIES.map((cat, i) => (
              <StaggeredItem key={cat.key} index={i}>
                <HapticButton
                  style={[styles.quickCatChip, category === cat.key && styles.quickCatChipActive]}
                  onPress={() => setCategory(cat.key)}
                  hapticType="selection"
                >
                  <Icon name={cat.icon} size={20} color={category === cat.key ? COLORS.textOnPrimary : COLORS.text} />
                  <Text style={[styles.quickCatText, category === cat.key && styles.quickCatTextActive]}>{cat.label}</Text>
                </HapticButton>
              </StaggeredItem>
            ))}
          </ScrollView>
        </View>

        <View style={styles.quickSection}>
          {location ? (
            <View style={styles.quickLocationRow} accessibilityLabel={`Location: ${location.address || location.city}`}>
              <Icon name="map-marker" size={20} color={COLORS.primary} />
              <Text style={styles.quickLocationText}>{location.address || location.city || `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`}</Text>
            </View>
          ) : <ActivityIndicator color={COLORS.primary} />}
        </View>

        <View style={styles.quickSection}>
          <View style={styles.mediaButtons}>
            <HapticButton style={styles.mediaButton} onPress={takePhoto} hapticType="light">
              <Icon name="camera" size={22} color={COLORS.primary} />
              <Text style={styles.mediaButtonText} accessibilityLabel="Take a photo of the issue">{t('camera')}</Text>
            </HapticButton>
            <HapticButton style={styles.mediaButton} onPress={pickImage} hapticType="light">
              <Icon name="image-multiple" size={22} color={COLORS.primary} />
              <Text style={styles.mediaButtonText} accessibilityLabel="Choose from gallery">{t('gallery')}</Text>
            </HapticButton>
          </View>
          {media.length > 0 && <Text style={styles.mediaCount}>{media.length} file(s) attached</Text>}
          {analyzing && (
            <FadeIn style={styles.analyzingRow}>
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text style={styles.analyzingText}>AI analyzing photo...</Text>
            </FadeIn>
          )}
          <AIBanner />
        </View>

        <View style={styles.quickSection}>
          <Text style={styles.fieldLabel} accessibilityRole="header">{t('howBad')}</Text>
          {HAZARD_LEVELS.map((h, i) => (
            <StaggeredItem key={h.key} index={i}>
              <HapticButton
                style={[styles.hazardCard, { borderColor: h.color }, hazardLevel === h.key && { backgroundColor: h.color + '25' }]}
                onPress={() => setHazardLevel(h.key)}
                hapticType="selection"
              >
                <View style={[styles.hazardDot, { backgroundColor: h.color }]} />
                <Text style={styles.hazardLabel}>{h.label}</Text>
              </HapticButton>
            </StaggeredItem>
          ))}
        </View>

        {showDuplicateWarning && nearbyClusters.length > 0 && (
          <FadeIn style={styles.duplicateWarning}>
            <Icon name="alert-circle" size={20} color={COLORS.warning} />
            <Text style={styles.duplicateText}>Similar issue nearby ({nearbyClusters[0].report_count} reports)</Text>
            <HapticButton onPress={() => joinExistingCluster(nearbyClusters[0])} hapticType="medium">
              <Text style={styles.duplicateAction}>Add to it</Text>
            </HapticButton>
          </FadeIn>
        )}

        <View style={{ padding: SPACING.md }}>
          <HapticButton
            style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            hapticType="heavy"
          >
            {submitting ? (
              <View style={styles.submittingRow}>
                <ActivityIndicator color={COLORS.textOnPrimary} size="small" />
                <Text style={styles.submitButtonText}>{uploadProgress || t('submitting')}</Text>
              </View>
            ) : (
              <Text style={styles.submitButtonText} accessibilityRole="button">{t('submitReport')}</Text>
            )}
          </HapticButton>
          <HapticButton style={styles.switchModeButton} onPress={() => { setIsQuickMode(false); setStep(0); }} hapticType="light">
            <Text style={styles.switchModeText}>{t('switchToDetailed')}</Text>
          </HapticButton>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ========== FULL MODE ==========
  const steps = [t('whatsTheIssue'), t('whereIsIt'), t('addDetails'), t('howBad'), t('reviewSubmit')];

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView style={styles.container}>
      {/* Step Indicator */}
      <View style={styles.stepIndicator} accessibilityRole="progressbar" accessibilityValue={{ now: step + 1, min: 1, max: 5 }}>
        {['Category', 'Location', 'Details', 'Severity', 'Review'].map((s, i) => (
          <HapticButton key={s} style={styles.stepItem} onPress={() => i < step ? setStep(i) : undefined} hapticType="selection">
            <View style={[styles.stepDot, i <= step && styles.stepDotActive]}>
              {i < step ? <Icon name="check" size={14} color={COLORS.textOnPrimary} /> : <Text style={[styles.stepDotText, i <= step && styles.stepDotTextActive]}>{i + 1}</Text>}
            </View>
            <Text style={[styles.stepLabel, i <= step && styles.stepLabelActive]}>{s}</Text>
          </HapticButton>
        ))}
      </View>

      {/* Step 0: Category */}
      {step === 0 && (
        <FadeIn style={styles.stepContent}>
          <Text style={styles.stepTitle} accessibilityRole="header">{t('whatsTheIssue')}</Text>
          <HapticButton style={styles.switchModeButton} onPress={() => setIsQuickMode(true)} hapticType="light">
            <Icon name="lightning-bolt" size={16} color={COLORS.secondary} />
            <Text style={styles.switchModeText}>{t('switchToQuick')}</Text>
          </HapticButton>
          <View style={styles.categoryGrid}>
            {CATEGORIES.map((cat, i) => (
              <StaggeredItem key={cat.key} index={i}>
                <HapticButton
                  style={[styles.categoryCard, category === cat.key && styles.categoryCardSelected]}
                  onPress={() => setCategory(cat.key)}
                  hapticType="selection"
                >
                  <Icon name={cat.icon} size={28} color={category === cat.key ? COLORS.primary : COLORS.textSecondary} />
                  <Text style={[styles.categoryLabel, category === cat.key && styles.categoryLabelSelected]}>{cat.label}</Text>
                </HapticButton>
              </StaggeredItem>
            ))}
          </View>
        </FadeIn>
      )}

      {/* Step 1: Location */}
      {step === 1 && (
        <FadeIn style={styles.stepContent}>
          <Text style={styles.stepTitle} accessibilityRole="header">{t('whereIsIt')}</Text>
          {showDuplicateWarning && nearbyClusters.length > 0 && (
            <FadeIn style={styles.duplicateWarning}>
              <View style={styles.duplicateHeader}>
                <Icon name="alert-circle" size={20} color={COLORS.warning} />
                <Text style={styles.duplicateTitle}>Similar reports nearby</Text>
              </View>
              {nearbyClusters.map((cluster) => (
                <HapticButton key={cluster.id} style={styles.duplicateCluster} onPress={() => joinExistingCluster(cluster)} hapticType="medium">
                  <Text style={styles.duplicateClusterText}>{cluster.report_count} reports at {cluster.address || 'nearby'}</Text>
                  <Text style={styles.duplicateAction}>Add yours</Text>
                </HapticButton>
              ))}
              <HapticButton onPress={() => setShowDuplicateWarning(false)} hapticType="light">
                <Text style={styles.duplicateNewText}>This is a different issue</Text>
              </HapticButton>
            </FadeIn>
          )}
          {mapRegion && location ? (
            <View style={styles.mapContainer}>
              <MapView style={styles.map} initialRegion={mapRegion} showsUserLocation>
                <Marker coordinate={{ latitude: location.latitude, longitude: location.longitude }} draggable onDragEnd={handleMapPinDrag} pinColor={COLORS.primary} />
              </MapView>
              <Text style={styles.mapHint} accessibilityLabel="Drag the map pin to adjust location">Drag the pin to adjust</Text>
            </View>
          ) : (
            <View style={styles.locationLoading}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.locationLoadingText}>Detecting location...</Text>
              <HapticButton style={styles.retryButton} onPress={loadLocation} hapticType="light">
                <Text style={styles.retryButtonText}>{t('tryAgain')}</Text>
              </HapticButton>
            </View>
          )}
          {location && (
            <FadeIn style={styles.locationCard}>
              <Icon name="map-marker" size={24} color={COLORS.primary} />
              <View style={styles.locationInfo}>
                <Text style={styles.locationAddress}>{location.address || 'Location detected'}</Text>
                <Text style={styles.locationCoords}>{location.city}{location.state ? `, ${location.state}` : ''}</Text>
              </View>
            </FadeIn>
          )}
        </FadeIn>
      )}

      {/* Step 2: Details */}
      {step === 2 && (
        <FadeIn style={styles.stepContent}>
          <Text style={styles.stepTitle} accessibilityRole="header">{t('addDetails')}</Text>
          <Text style={styles.fieldLabel}>{t('descriptionOptional')}</Text>
          <TextInput style={styles.textArea} multiline numberOfLines={4} placeholder={t('descriptionPlaceholder')} placeholderTextColor={COLORS.textLight} value={description} onChangeText={setDescription} accessibilityLabel="Issue description" />
          <Text style={styles.fieldLabel}>{t('photosVideos')}</Text>
          <View style={styles.mediaButtons}>
            <HapticButton style={styles.mediaButton} onPress={takePhoto} hapticType="light">
              <Icon name="camera" size={22} color={COLORS.primary} />
              <Text style={styles.mediaButtonText}>{t('camera')}</Text>
            </HapticButton>
            <HapticButton style={styles.mediaButton} onPress={pickImage} hapticType="light">
              <Icon name="image-multiple" size={22} color={COLORS.primary} />
              <Text style={styles.mediaButtonText}>{t('gallery')}</Text>
            </HapticButton>
          </View>
          {analyzing && (
            <FadeIn style={styles.analyzingRow}>
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text style={styles.analyzingText}>AI analyzing photo...</Text>
            </FadeIn>
          )}
          <AIBanner />
          {media.length > 0 && (
            <View style={styles.mediaList}>
              {media.map((m) => (
                <View key={m.id} style={styles.mediaItem}>
                  <Icon name={m.type === 'video' ? 'video-outline' : 'image-outline'} size={18} color={COLORS.textSecondary} />
                  <Text style={styles.mediaName} numberOfLines={1}>{m.uri.split('/').pop() || 'File'}</Text>
                  <HapticButton onPress={() => removeMedia(m.id)} hapticType="light">
                    <Icon name="close-circle" size={20} color={COLORS.error} />
                  </HapticButton>
                </View>
              ))}
            </View>
          )}
          <HapticButton style={styles.anonymousToggle} onPress={() => setIsAnonymous(!isAnonymous)} hapticType="selection">
            <Icon name={isAnonymous ? 'checkbox-marked' : 'checkbox-blank-outline'} size={24} color={isAnonymous ? COLORS.primary : COLORS.border} />
            <Text style={styles.anonymousText}>{t('submitAnonymously')}</Text>
          </HapticButton>
        </FadeIn>
      )}

      {/* Step 3: Severity */}
      {step === 3 && (
        <FadeIn style={styles.stepContent}>
          <Text style={styles.stepTitle} accessibilityRole="header">{t('howBad')}</Text>
          {categoryInfo?.severityDimensions.includes('size') && (
            <>
              <Text style={styles.fieldLabel}>{t('size')}</Text>
              {SIZE_RATINGS.map((size, i) => (
                <StaggeredItem key={size.key} index={i}>
                  <HapticButton style={[styles.ratingCard, sizeRating === size.key && styles.ratingCardSelected]} onPress={() => setSizeRating(size.key)} hapticType="selection">
                    <Text style={[styles.ratingLabel, sizeRating === size.key && styles.ratingLabelSelected]}>{size.label}</Text>
                    <Text style={styles.ratingDesc}>{size.description}</Text>
                  </HapticButton>
                </StaggeredItem>
              ))}
            </>
          )}
          <Text style={[styles.fieldLabel, { marginTop: SPACING.lg }]}>{t('hazardLevel')}</Text>
          {HAZARD_LEVELS.map((level, i) => (
            <StaggeredItem key={level.key} index={i}>
              <HapticButton style={[styles.hazardCard, { borderColor: level.color }, hazardLevel === level.key && { backgroundColor: level.color + '20' }]} onPress={() => setHazardLevel(level.key)} hapticType="selection">
                <View style={[styles.hazardDot, { backgroundColor: level.color }]} />
                <Text style={styles.hazardLabel}>{level.label}</Text>
              </HapticButton>
            </StaggeredItem>
          ))}
          {categoryInfo?.severityDimensions.includes('urgency') && (
            <>
              <Text style={[styles.fieldLabel, { marginTop: SPACING.lg }]}>{t('urgency')}</Text>
              {URGENCY_LEVELS.map((level, i) => (
                <StaggeredItem key={level.key} index={i}>
                  <HapticButton style={[styles.hazardCard, { borderColor: level.color }, urgency === level.key && { backgroundColor: level.color + '20' }]} onPress={() => setUrgency(level.key)} hapticType="selection">
                    <View style={[styles.hazardDot, { backgroundColor: level.color }]} />
                    <Text style={styles.hazardLabel}>{level.label}</Text>
                  </HapticButton>
                </StaggeredItem>
              ))}
            </>
          )}
          {categoryInfo?.severityDimensions.includes('condition') && (
            <>
              <Text style={[styles.fieldLabel, { marginTop: SPACING.lg }]}>{t('condition')}</Text>
              {CONDITION_LEVELS.map((level, i) => (
                <StaggeredItem key={level.key} index={i}>
                  <HapticButton style={[styles.hazardCard, { borderColor: level.color }, condition === level.key && { backgroundColor: level.color + '20' }]} onPress={() => setCondition(level.key)} hapticType="selection">
                    <View style={[styles.hazardDot, { backgroundColor: level.color }]} />
                    <Text style={styles.hazardLabel}>{level.label}</Text>
                  </HapticButton>
                </StaggeredItem>
              ))}
            </>
          )}
          {isEmergencyFastTrack() && (
            <FadeIn style={styles.emergencyBanner}>
              <Icon name="alert" size={20} color={COLORS.error} />
              <Text style={styles.emergencyText}>This will be fast-tracked as critical</Text>
            </FadeIn>
          )}
        </FadeIn>
      )}

      {/* Step 4: Review */}
      {step === 4 && (
        <FadeIn style={styles.stepContent}>
          <Text style={styles.stepTitle} accessibilityRole="header">{t('reviewSubmit')}</Text>
          <View style={styles.reviewCard} accessibilityRole="summary">
            <ReviewRow label="Category" value={categoryInfo?.label || category} icon={categoryInfo?.icon} />
            <ReviewRow label="Location" value={location?.address || location?.city || 'Detected'} />
            {categoryInfo?.severityDimensions.includes('size') && <ReviewRow label={t('size')} value={SIZE_RATINGS.find((s) => s.key === sizeRating)?.label || ''} />}
            <ReviewRow label={t('hazardLevel')} value={HAZARD_LEVELS.find((h) => h.key === hazardLevel)?.label || ''} />
            {categoryInfo?.severityDimensions.includes('urgency') && <ReviewRow label={t('urgency')} value={URGENCY_LEVELS.find((u) => u.key === urgency)?.label || ''} />}
            {categoryInfo?.severityDimensions.includes('condition') && <ReviewRow label={t('condition')} value={CONDITION_LEVELS.find((c) => c.key === condition)?.label || ''} />}
            <ReviewRow label="Media" value={`${media.length} file(s)`} />
            {description ? <ReviewRow label="Description" value={description} /> : null}
            {existingClusterId && <ReviewRow label="Cluster" value="Adding to existing" />}
            {aiResult && <ReviewRow label="AI Confidence" value={getConfidenceLabel(aiResult.confidence)} />}
            {isEmergencyFastTrack() && <ReviewRow label="Priority" value="EMERGENCY" />}
          </View>
        </FadeIn>
      )}

      {/* Nav Buttons */}
      <View style={styles.navButtons}>
        {step > 0 && (
          <HapticButton style={styles.backButton} onPress={() => setStep(step - 1)} hapticType="light">
            <Text style={styles.backButtonText}>{t('back')}</Text>
          </HapticButton>
        )}
        {step < 4 ? (
          <HapticButton style={[styles.nextButton, step === 0 && { flex: 1 }]} onPress={() => { setStep(step + 1); haptics.light(); }} hapticType="medium">
            <Text style={styles.nextButtonText}>{t('next')}</Text>
          </HapticButton>
        ) : (
          <HapticButton style={[styles.submitButton, submitting && styles.submitButtonDisabled]} onPress={handleSubmit} hapticType="heavy">
            {submitting ? (
              <View style={styles.submittingRow}>
                <ActivityIndicator color={COLORS.textOnPrimary} size="small" />
                <Text style={styles.submitButtonText}>{uploadProgress || t('submitting')}</Text>
              </View>
            ) : (
              <Text style={styles.submitButtonText}>{isEmergencyFastTrack() ? 'Submit URGENT' : t('submitReport')}</Text>
            )}
          </HapticButton>
        )}
      </View>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ReviewRow({ label, value, icon }: { label: string; value: string; icon?: string }) {
  return (
    <View style={reviewStyles.row} accessibilityLabel={`${label}: ${value}`}>
      <Text style={reviewStyles.label}>{label}:</Text>
      <View style={reviewStyles.valueRow}>
        {icon && <Icon name={icon} size={16} color={COLORS.primary} />}
        <Text style={reviewStyles.value}>{value}</Text>
      </View>
    </View>
  );
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const reviewStyles = StyleSheet.create({
  row: { flexDirection: 'row', paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.divider },
  label: { width: 100, fontSize: FONT_SIZES.md, color: COLORS.textSecondary, fontWeight: '500' },
  valueRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  value: { fontSize: FONT_SIZES.md, color: COLORS.text, fontWeight: '600' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  quickHeader: { flexDirection: 'row', alignItems: 'center', padding: SPACING.md, gap: SPACING.sm },
  quickTitle: { fontSize: FONT_SIZES.xxl, fontWeight: '700', color: COLORS.text },
  quickSection: { paddingHorizontal: SPACING.md, marginBottom: SPACING.md },
  quickCatChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.surface, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.round, marginRight: SPACING.sm, ...SHADOWS.sm },
  quickCatChipActive: { backgroundColor: COLORS.primary },
  quickCatText: { fontSize: FONT_SIZES.md, color: COLORS.text, fontWeight: '500' },
  quickCatTextActive: { color: COLORS.textOnPrimary },
  quickLocationRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  quickLocationText: { fontSize: FONT_SIZES.md, color: COLORS.text },
  mediaCount: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, marginTop: SPACING.xs },
  switchModeButton: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: SPACING.sm, alignSelf: 'center', marginBottom: SPACING.md },
  switchModeText: { fontSize: FONT_SIZES.md, color: COLORS.secondary, fontWeight: '600' },
  analyzingRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, padding: SPACING.sm },
  analyzingText: { fontSize: FONT_SIZES.sm, color: COLORS.primary, fontWeight: '500' },
  aiBanner: { backgroundColor: COLORS.primary + '10', borderRadius: BORDER_RADIUS.lg, padding: SPACING.md, marginTop: SPACING.sm, borderWidth: 1, borderColor: COLORS.primary + '30' },
  aiHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.xs },
  aiTitle: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.text, flex: 1 },
  aiConfBadge: { paddingHorizontal: SPACING.sm, paddingVertical: 2, borderRadius: BORDER_RADIUS.round },
  aiConfText: { fontSize: FONT_SIZES.xs, fontWeight: '700' },
  aiDesc: { fontSize: FONT_SIZES.sm, color: COLORS.text, lineHeight: 20 },
  aiSuggestion: { fontSize: FONT_SIZES.xs, color: COLORS.primary, fontWeight: '600', marginTop: SPACING.xs },
  duplicateWarning: { backgroundColor: COLORS.warning + '15', borderRadius: BORDER_RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.warning + '40' },
  duplicateHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  duplicateTitle: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.text },
  duplicateText: { flex: 1, fontSize: FONT_SIZES.sm, color: COLORS.text, marginLeft: SPACING.sm },
  duplicateCluster: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.warning + '30' },
  duplicateClusterText: { fontSize: FONT_SIZES.sm, color: COLORS.text, flex: 1 },
  duplicateAction: { fontSize: FONT_SIZES.sm, color: COLORS.primary, fontWeight: '700' },
  duplicateNewText: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, textAlign: 'center', marginTop: SPACING.sm, fontWeight: '500' },
  emergencyBanner: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: COLORS.error + '15', borderRadius: BORDER_RADIUS.md, padding: SPACING.md, marginTop: SPACING.lg, borderWidth: 1, borderColor: COLORS.error + '40' },
  emergencyText: { fontSize: FONT_SIZES.md, color: COLORS.error, fontWeight: '600', flex: 1 },
  stepIndicator: { flexDirection: 'row', justifyContent: 'space-between', padding: SPACING.md, backgroundColor: COLORS.surface, ...SHADOWS.sm },
  stepItem: { alignItems: 'center', flex: 1 },
  stepDot: { width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.border, justifyContent: 'center', alignItems: 'center' },
  stepDotActive: { backgroundColor: COLORS.primary },
  stepDotText: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary, fontWeight: '600' },
  stepDotTextActive: { color: COLORS.textOnPrimary },
  stepLabel: { fontSize: FONT_SIZES.xs, color: COLORS.textLight, marginTop: 2 },
  stepLabelActive: { color: COLORS.primary, fontWeight: '600' },
  stepContent: { padding: SPACING.md },
  stepTitle: { fontSize: FONT_SIZES.xxl, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.lg },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  categoryCard: { width: '31%', backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg, padding: SPACING.md, alignItems: 'center', borderWidth: 2, borderColor: 'transparent', ...SHADOWS.sm },
  categoryCardSelected: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '10' },
  categoryLabel: { fontSize: FONT_SIZES.xs, color: COLORS.text, textAlign: 'center', fontWeight: '500', marginTop: SPACING.xs },
  categoryLabelSelected: { color: COLORS.primary, fontWeight: '700' },
  mapContainer: { borderRadius: BORDER_RADIUS.lg, overflow: 'hidden', marginBottom: SPACING.md, ...SHADOWS.sm },
  map: { height: 250, width: '100%' },
  mapHint: { fontSize: FONT_SIZES.sm, color: COLORS.textLight, textAlign: 'center', padding: SPACING.xs, fontStyle: 'italic', backgroundColor: COLORS.surface },
  locationCard: { flexDirection: 'row', backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg, padding: SPACING.md, ...SHADOWS.sm, alignItems: 'center', gap: SPACING.sm },
  locationInfo: { flex: 1 },
  locationAddress: { fontSize: FONT_SIZES.lg, fontWeight: '600', color: COLORS.text },
  locationCoords: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, marginTop: 2 },
  locationLoading: { alignItems: 'center', padding: SPACING.xl },
  locationLoadingText: { fontSize: FONT_SIZES.lg, color: COLORS.textSecondary, marginTop: SPACING.sm },
  retryButton: { marginTop: SPACING.sm, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, backgroundColor: COLORS.primary, borderRadius: BORDER_RADIUS.round },
  retryButtonText: { color: COLORS.textOnPrimary, fontWeight: '600' },
  fieldLabel: { fontSize: FONT_SIZES.lg, fontWeight: '600', color: COLORS.text, marginBottom: SPACING.sm },
  textArea: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, fontSize: FONT_SIZES.md, color: COLORS.text, minHeight: 100, textAlignVertical: 'top', borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.md },
  mediaButtons: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.sm },
  mediaButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, gap: SPACING.sm },
  mediaButtonText: { fontSize: FONT_SIZES.md, color: COLORS.text, fontWeight: '500' },
  mediaList: { gap: SPACING.xs },
  mediaItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.sm, padding: SPACING.sm, gap: SPACING.sm },
  mediaName: { flex: 1, fontSize: FONT_SIZES.sm, color: COLORS.textSecondary },
  anonymousToggle: { flexDirection: 'row', alignItems: 'center', marginTop: SPACING.lg, gap: SPACING.sm },
  anonymousText: { fontSize: FONT_SIZES.md, color: COLORS.text },
  ratingCard: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, borderWidth: 2, borderColor: 'transparent', ...SHADOWS.sm, marginBottom: SPACING.xs },
  ratingCardSelected: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '10' },
  ratingLabel: { fontSize: FONT_SIZES.lg, fontWeight: '600', color: COLORS.text },
  ratingLabelSelected: { color: COLORS.primary },
  ratingDesc: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, marginTop: 2 },
  hazardCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, borderWidth: 2, gap: SPACING.sm, marginBottom: SPACING.xs },
  hazardDot: { width: 12, height: 12, borderRadius: 6 },
  hazardLabel: { fontSize: FONT_SIZES.md, fontWeight: '500', color: COLORS.text },
  reviewCard: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg, padding: SPACING.md, ...SHADOWS.sm },
  navButtons: { flexDirection: 'row', padding: SPACING.md, gap: SPACING.sm, paddingBottom: SPACING.xxl },
  backButton: { flex: 1, backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  backButtonText: { fontSize: FONT_SIZES.lg, color: COLORS.text, fontWeight: '600' },
  nextButton: { flex: 2, backgroundColor: COLORS.primary, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, alignItems: 'center' },
  nextButtonText: { fontSize: FONT_SIZES.lg, color: COLORS.textOnPrimary, fontWeight: '700' },
  submitButton: { backgroundColor: COLORS.accent, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, alignItems: 'center', flex: 2 },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: { fontSize: FONT_SIZES.lg, color: COLORS.textOnPrimary, fontWeight: '700' },
  submittingRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
});
