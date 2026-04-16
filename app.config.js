require('dotenv').config();

module.exports = {
  expo: {
    name: 'Fault Line',
    slug: 'fault-line',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#1E88E5',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.faultline.app',
      infoPlist: {
        NSLocationWhenInUseUsageDescription:
          'Fault Line needs your location to pinpoint infrastructure issues.',
        NSCameraUsageDescription:
          'Fault Line needs camera access to photograph infrastructure issues.',
        NSPhotoLibraryUsageDescription:
          'Fault Line needs photo library access to attach images to reports.',
        NSMotionUsageDescription:
          'Fault Line uses motion sensors to detect potential road hazards.',
        NSSpeechRecognitionUsageDescription:
          'Fault Line uses voice commands for hands-free reporting.',
        NSMicrophoneUsageDescription:
          'Fault Line needs microphone access for voice commands.',
        NSUserTrackingUsageDescription:
          'This allows Fault Line to show relevant ads to keep the app free.',
        ...(process.env.ADMOB_APP_ID_IOS &&
          !process.env.ADMOB_APP_ID_IOS.includes('xxxx') && {
            GADApplicationIdentifier: process.env.ADMOB_APP_ID_IOS,
          }),
      },
    },
    android: {
      package: 'com.faultline.app',
      adaptiveIcon: {
        backgroundColor: '#1E88E5',
        foregroundImage: './assets/android-icon-foreground.png',
        backgroundImage: './assets/android-icon-background.png',
        monochromeImage: './assets/android-icon-monochrome.png',
      },
      permissions: [
        'ACCESS_FINE_LOCATION',
        'ACCESS_COARSE_LOCATION',
        'CAMERA',
        'READ_EXTERNAL_STORAGE',
        'VIBRATE',
        'RECORD_AUDIO',
        'com.google.android.gms.permission.AD_ID',
      ],
      ...(process.env.ADMOB_APP_ID_ANDROID &&
        !process.env.ADMOB_APP_ID_ANDROID.includes('xxxx') && {
          config: {
            googleMobileAdsAppId: process.env.ADMOB_APP_ID_ANDROID,
          },
        }),
      predictiveBackGestureEnabled: false,
    },
    plugins: [
      'expo-secure-store',
      'expo-location',
      'expo-camera',
      'expo-image-picker',
      'expo-sensors',
      'expo-speech-recognition',
      'expo-notifications',
      'expo-sharing',
      'expo-tracking-transparency',
      'react-native-google-mobile-ads',
      [
        '@sentry/react-native/expo',
        {
          organization: process.env.SENTRY_ORG || 'faultline',
          project: process.env.SENTRY_PROJECT || 'faultline-mobile',
        },
      ],
    ],
    extra: {
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
      sentryDsn: process.env.SENTRY_DSN || '',
      admobBannerIdAndroid: process.env.ADMOB_BANNER_ID_ANDROID || '',
      admobBannerIdIos: process.env.ADMOB_BANNER_ID_IOS || '',
      eas: {
        projectId: process.env.EAS_PROJECT_ID || '',
      },
    },
  },
};
