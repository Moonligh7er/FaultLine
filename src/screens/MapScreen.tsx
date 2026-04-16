import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import MapView, { Marker, Callout, Region } from 'react-native-maps';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS, SHADOWS } from '../constants/theme';
import { CATEGORIES, HAZARD_LEVELS } from '../constants/categories';
import { RootStackParamList, Report, ReportCategory } from '../types';
import { getNearbyReports } from '../services/reports';
import { getCurrentLocation } from '../services/location';
import { t } from '../services/i18n';
import Icon from '../components/Icon';
import { HapticButton, FadeIn } from '../components/AnimatedComponents';

type MapNavProp = NativeStackNavigationProp<RootStackParamList>;

const DEFAULT_REGION: Region = {
  latitude: 42.3601,
  longitude: -71.0589,
  latitudeDelta: 0.1,
  longitudeDelta: 0.1,
};

export default function MapScreen() {
  const navigation = useNavigation<MapNavProp>();
  const mapRef = useRef<MapView>(null);
  const [region, setRegion] = useState<Region>(DEFAULT_REGION);
  const [reports, setReports] = useState<Report[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<ReportCategory | 'all'>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => { initMap(); }, []);

  const initMap = async () => {
    const location = await getCurrentLocation();
    if (location) {
      const newRegion: Region = {
        latitude: location.latitude, longitude: location.longitude,
        latitudeDelta: 0.05, longitudeDelta: 0.05,
      };
      setRegion(newRegion);
      mapRef.current?.animateToRegion(newRegion, 500);
      await loadReports(location.latitude, location.longitude);
    }
    setLoading(false);
  };

  const loadReports = async (lat: number, lng: number) => {
    const nearby = await getNearbyReports(lat, lng, 10);
    setReports(nearby);
  };

  const onRegionChangeComplete = (newRegion: Region) => {
    setRegion(newRegion);
    loadReports(newRegion.latitude, newRegion.longitude);
  };

  const filteredReports = selectedFilter === 'all'
    ? reports
    : reports.filter((r) => r.category === selectedFilter);

  const quickFilters: { key: ReportCategory | 'all'; label: string; icon: string }[] = [
    { key: 'all', label: 'All', icon: 'map-marker-multiple' },
    { key: 'pothole', label: 'Potholes', icon: 'road-variant' },
    { key: 'streetlight', label: 'Lights', icon: 'lightbulb-outline' },
    { key: 'fallen_tree', label: 'Trees', icon: 'tree' },
    { key: 'snow_ice', label: 'Snow', icon: 'snowflake' },
  ];

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={DEFAULT_REGION}
        onRegionChangeComplete={onRegionChangeComplete}
        showsUserLocation
        showsMyLocationButton
      >
        {filteredReports.map((report) => {
          const cat = CATEGORIES.find((c) => c.key === report.category);
          const hazard = HAZARD_LEVELS.find((h) => h.key === report.severity.hazardLevel);
          return (
            <Marker
              key={report.id}
              coordinate={{
                latitude: report.location.latitude,
                longitude: report.location.longitude,
              }}
              pinColor={hazard?.color || COLORS.primary}
            >
              <Callout onPress={() => navigation.navigate('ReportDetail', { reportId: report.id })}>
                <View style={styles.callout}>
                  <Text style={styles.calloutTitle}>{cat?.label || report.category}</Text>
                  <Text style={styles.calloutDesc} numberOfLines={2}>
                    {report.description || 'No description'}
                  </Text>
                  <Text style={styles.calloutMeta}>
                    {hazard?.label} · {report.upvoteCount} upvotes · {report.status.replace('_', ' ')}
                  </Text>
                  <Text style={styles.calloutTap}>Tap for details</Text>
                </View>
              </Callout>
            </Marker>
          );
        })}
      </MapView>

      {/* Filter Bar */}
      <View style={styles.filterBar}>
        {quickFilters.map((filter) => (
          <HapticButton
            key={filter.key}
            style={[styles.filterChip, selectedFilter === filter.key && styles.filterChipActive]}
            onPress={() => setSelectedFilter(filter.key)}
          >
            <Icon
              name={filter.icon}
              size={16}
              color={selectedFilter === filter.key ? COLORS.textOnPrimary : COLORS.text}
            />
            <Text style={[styles.filterChipText, selectedFilter === filter.key && styles.filterChipTextActive]}>
              {filter.label}
            </Text>
          </HapticButton>
        ))}
      </View>

      {/* Refresh Button */}
      <HapticButton
        style={styles.refreshButton}
        onPress={() => loadReports(region.latitude, region.longitude)}
        hapticType="light"
      >
        <Icon name="refresh" size={22} color={COLORS.text} />
      </HapticButton>

      {/* AR Button */}
      <HapticButton
        style={styles.arButton}
        onPress={() => navigation.navigate('ARView')}
        hapticType="medium"
      >
        <Icon name="cube-scan" size={22} color={COLORS.textOnPrimary} />
        <Text style={styles.arButtonText} accessibilityLabel="Open augmented reality view">AR</Text>
      </HapticButton>

      {/* Count Badge */}
      <FadeIn style={styles.countBadge}>
        {loading ? (
          <ActivityIndicator size="small" color={COLORS.primary} />
        ) : (
          <Text style={styles.countText} accessibilityLabel={`${filteredReports.length} reports nearby`}>{filteredReports.length} reports nearby</Text>
        )}
      </FadeIn>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  filterBar: {
    position: 'absolute', top: SPACING.sm, left: SPACING.sm, right: SPACING.sm,
    flexDirection: 'row', gap: SPACING.xs,
  },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.surface, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.round, ...SHADOWS.sm, minHeight: 44,
  },
  filterChipActive: { backgroundColor: COLORS.primary },
  filterChipText: { fontSize: FONT_SIZES.sm, color: COLORS.text, fontWeight: '500' },
  filterChipTextActive: { color: COLORS.textOnPrimary },
  callout: { width: 200, padding: SPACING.xs },
  calloutTitle: { fontSize: FONT_SIZES.md, fontWeight: '700', color: COLORS.text },
  calloutDesc: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, marginTop: 2 },
  calloutMeta: { fontSize: FONT_SIZES.xs, color: COLORS.primary, fontWeight: '600', marginTop: 4, textTransform: 'capitalize' },
  calloutTap: { fontSize: FONT_SIZES.xs, color: COLORS.textLight, marginTop: 2 },
  refreshButton: {
    position: 'absolute', top: SPACING.sm, right: SPACING.sm,
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.surface, justifyContent: 'center', alignItems: 'center', ...SHADOWS.md,
  },
  arButton: {
    position: 'absolute', bottom: SPACING.md, right: SPACING.md,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.primary, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.round, ...SHADOWS.md,
  },
  arButtonText: { color: COLORS.textOnPrimary, fontSize: FONT_SIZES.sm, fontWeight: '700' },
  countBadge: {
    position: 'absolute', bottom: SPACING.md, alignSelf: 'center',
    backgroundColor: COLORS.surface, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.round, ...SHADOWS.md,
  },
  countText: { fontSize: FONT_SIZES.sm, color: COLORS.text, fontWeight: '600' },
});
