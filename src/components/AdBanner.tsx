import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';
import Constants from 'expo-constants';
import { COLORS } from '../constants/theme';

const extra = Constants.expoConfig?.extra || {};

const BANNER_ID_ANDROID = extra.admobBannerIdAndroid || '';
const BANNER_ID_IOS = extra.admobBannerIdIos || '';

function getAdUnitId(): string | null {
  const id = Platform.OS === 'ios' ? BANNER_ID_IOS : BANNER_ID_ANDROID;
  // Use test ads in dev, real ads in production
  if (__DEV__) return TestIds.ADAPTIVE_BANNER;
  // If no real ID configured, don't show ads
  if (!id || id.includes('xxxx')) return null;
  return id;
}

interface AdBannerProps {
  placement?: 'home' | 'map' | 'dashboard' | 'detail';
}

export default function AdBanner({ placement = 'home' }: AdBannerProps) {
  const adUnitId = getAdUnitId();
  if (!adUnitId) return null;

  return (
    <View style={styles.container}>
      <BannerAd
        unitId={adUnitId}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{ requestNonPersonalizedAdsOnly: true }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
});
