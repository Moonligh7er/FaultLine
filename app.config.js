require('dotenv').config();

// The native Google Mobile Ads SDK crashes at launch without an app id, and the
// config plugin only reads it from its own options. Use the real AdMob ids
// when set; otherwise Google's published sample ids, so non-ad builds still run
// (AdBanner renders nothing until real ad-unit ids exist).
const ADMOB_TEST_ANDROID = 'ca-app-pub-3940256099942544~3347511713';
const ADMOB_TEST_IOS = 'ca-app-pub-3940256099942544~1458002511';
const realAdmobId = (v) => (v && !v.includes('xxxx') ? v : null);

// Kokoro TTS (Modal). Overridable per build; the client allow-list
// (src/services/security.ts) admits exactly these hosts.
const KOKORO_TTS_URL =
  process.env.KOKORO_TTS_URL || 'https://moons7onr--kokoro-tts-server-kokorotts-tts.modal.run';
const KOKORO_HEALTH_URL =
  process.env.KOKORO_HEALTH_URL || 'https://moons7onr--kokoro-tts-server-kokorotts-health.modal.run';

module.exports = {
  expo: {
    name: 'Fault Line',
    slug: 'fault-line',
    scheme: 'faultline',
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
        'VIBRATE',
        'RECORD_AUDIO',
        'com.google.android.gms.permission.AD_ID',
      ],
      // Added by libraries but not needed: photos come from the system photo
      // picker / camera, files stay in app storage, audio is playback only,
      // and the app never draws over other apps. READ_MEDIA_IMAGES is only
      // for expo-screen-capture's screenshot listener, which isn't used.
      blockedPermissions: [
        'android.permission.SYSTEM_ALERT_WINDOW',
        'android.permission.WRITE_EXTERNAL_STORAGE',
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.READ_MEDIA_IMAGES',
        'android.permission.MODIFY_AUDIO_SETTINGS',
      ],
      // Keep the encrypted session / offline queue out of device backups
      // (the decryption key never leaves the keystore anyway).
      allowBackup: false,
      // AdMob app id is set via the react-native-google-mobile-ads plugin below.
      ...(process.env.GOOGLE_MAPS_ANDROID_KEY && {
        config: { googleMaps: { apiKey: process.env.GOOGLE_MAPS_ANDROID_KEY } },
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
      [
        'react-native-google-mobile-ads',
        {
          androidAppId: realAdmobId(process.env.ADMOB_APP_ID_ANDROID) ?? ADMOB_TEST_ANDROID,
          iosAppId: realAdmobId(process.env.ADMOB_APP_ID_IOS) ?? ADMOB_TEST_IOS,
          // Don't start Google's app measurement at launch; the ad SDK only
          // spins up when a banner is actually shown (never in the report flow).
          delayAppMeasurementInit: true,
        },
      ],
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
      kokoroTtsUrl: KOKORO_TTS_URL,
      kokoroHealthUrl: KOKORO_HEALTH_URL,
      admobBannerIdAndroid: process.env.ADMOB_BANNER_ID_ANDROID || '',
      admobBannerIdIos: process.env.ADMOB_BANNER_ID_IOS || '',
      // Read by src/services/maps.ts — Android maps crash without a key.
      googleMapsAndroidKey: Boolean(process.env.GOOGLE_MAPS_ANDROID_KEY),
      eas: {
        projectId: process.env.EAS_PROJECT_ID || '',
      },
    },
  },
};
