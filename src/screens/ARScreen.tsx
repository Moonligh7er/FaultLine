import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS, SHADOWS } from '../constants/theme';
import { CATEGORIES, HAZARD_LEVELS } from '../constants/categories';
import { RootStackParamList, Report } from '../types';
import { getNearbyReports } from '../services/reports';
import Icon from '../components/Icon';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

type ARNavProp = NativeStackNavigationProp<RootStackParamList>;

interface ARMarker {
  report: Report;
  screenX: number;
  screenY: number;
  distance: number;
  bearing: number;
}

export default function ARScreen() {
  const navigation = useNavigation<ARNavProp>();
  const [permission, requestPermission] = useCameraPermissions();
  const [reports, setReports] = useState<Report[]>([]);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [heading, setHeading] = useState(0);
  const [markers, setMarkers] = useState<ARMarker[]>([]);
  const headingSubRef = useRef<{ remove: () => void } | null>(null);

  useEffect(() => {
    init();
    return () => {
      headingSubRef.current?.remove();
    };
  }, []);

  useEffect(() => {
    if (userLocation && reports.length > 0) {
      updateMarkers();
    }
  }, [heading, userLocation, reports]);

  const init = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;

    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    setUserLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });

    const nearby = await getNearbyReports(loc.coords.latitude, loc.coords.longitude, 1);
    setReports(nearby);

    // Subscribe to heading changes (with cleanup)
    headingSubRef.current = await Location.watchHeadingAsync((h) => {
      setHeading(h.trueHeading || h.magHeading || 0);
    });
  };

  const updateMarkers = () => {
    if (!userLocation) return;

    const fov = 60; // Camera FOV in degrees
    const halfFov = fov / 2;

    const newMarkers: ARMarker[] = reports
      .map((report) => {
        const bearing = getBearing(
          userLocation.lat, userLocation.lng,
          report.location.latitude, report.location.longitude
        );
        const distance = haversineM(
          userLocation.lat, userLocation.lng,
          report.location.latitude, report.location.longitude
        );

        // Calculate angle difference from current heading
        let angleDiff = bearing - heading;
        if (angleDiff > 180) angleDiff -= 360;
        if (angleDiff < -180) angleDiff += 360;

        // Only show markers within FOV
        if (Math.abs(angleDiff) > halfFov) return null;

        // Map angle to screen position
        const screenX = (angleDiff / halfFov) * (SCREEN_W / 2) + SCREEN_W / 2;
        // Vertical position based on distance (closer = lower on screen)
        const screenY = Math.max(100, SCREEN_H * 0.3 + (distance / 500) * SCREEN_H * 0.3);

        return { report, screenX, screenY, distance, bearing };
      })
      .filter(Boolean) as ARMarker[];

    setMarkers(newMarkers);
  };

  if (!permission?.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Icon name="camera-off" size={48} color={COLORS.textLight} />
        <Text style={styles.permissionText}>Camera access needed for AR view</Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Grant Access</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView style={styles.camera} facing="back">
        {/* AR Markers */}
        {markers.map((marker) => {
          const cat = CATEGORIES.find((c) => c.key === marker.report.category);
          const hazard = HAZARD_LEVELS.find((h) => h.key === marker.report.severity.hazardLevel);
          const distLabel = marker.distance < 100
            ? `${Math.round(marker.distance)}m`
            : `${(marker.distance / 1000).toFixed(1)}km`;

          return (
            <TouchableOpacity
              key={marker.report.id}
              style={[
                styles.arMarker,
                {
                  left: marker.screenX - 40,
                  top: marker.screenY - 30,
                  opacity: Math.max(0.4, 1 - marker.distance / 1000),
                },
              ]}
              onPress={() => navigation.navigate('ReportDetail', { reportId: marker.report.id })}
            >
              <View style={[styles.arBubble, { borderColor: hazard?.color || COLORS.primary }]}>
                <Icon name={cat?.icon || 'alert'} size={18} color={COLORS.textOnPrimary} />
                <Text style={styles.arLabel}>{cat?.label}</Text>
                <Text style={styles.arDistance}>{distLabel}</Text>
              </View>
              <View style={[styles.arPulse, { backgroundColor: hazard?.color || COLORS.primary }]} />
            </TouchableOpacity>
          );
        })}

        {/* HUD */}
        <View style={styles.hud}>
          <View style={styles.hudCompass}>
            <Icon name="compass" size={20} color={COLORS.textOnPrimary} />
            <Text style={styles.hudText}>{Math.round(heading)}°</Text>
          </View>
          <Text style={styles.hudCount}>{markers.length} issues nearby</Text>
        </View>

        {/* Back button */}
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Icon name="arrow-left" size={24} color={COLORS.textOnPrimary} />
        </TouchableOpacity>
      </CameraView>
    </View>
  );
}

function getBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const lat1R = (lat1 * Math.PI) / 180;
  const lat2R = (lat2 * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2R);
  const x = Math.cos(lat1R) * Math.sin(lat2R) - Math.sin(lat1R) * Math.cos(lat2R) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  camera: { flex: 1 },
  permissionContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background, padding: SPACING.xl },
  permissionText: { fontSize: FONT_SIZES.lg, color: COLORS.textSecondary, marginTop: SPACING.md, textAlign: 'center' },
  permissionButton: { marginTop: SPACING.lg, backgroundColor: COLORS.primary, paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.round },
  permissionButtonText: { color: COLORS.textOnPrimary, fontSize: FONT_SIZES.lg, fontWeight: '700' },

  arMarker: { position: 'absolute', alignItems: 'center' },
  arBubble: {
    backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: BORDER_RADIUS.lg, borderWidth: 2,
    paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs, alignItems: 'center', minWidth: 80,
  },
  arLabel: { color: COLORS.textOnPrimary, fontSize: FONT_SIZES.xs, fontWeight: '700', marginTop: 2 },
  arDistance: { color: 'rgba(255,255,255,0.7)', fontSize: FONT_SIZES.xs },
  arPulse: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },

  hud: { position: 'absolute', top: 60, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: SPACING.md },
  hudCompass: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs, borderRadius: BORDER_RADIUS.round },
  hudText: { color: COLORS.textOnPrimary, fontSize: FONT_SIZES.sm, fontWeight: '600' },
  hudCount: { color: COLORS.textOnPrimary, fontSize: FONT_SIZES.sm, fontWeight: '600', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs, borderRadius: BORDER_RADIUS.round },

  backButton: { position: 'absolute', top: 60, left: SPACING.md, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
});
