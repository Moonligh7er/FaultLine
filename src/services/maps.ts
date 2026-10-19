import { Platform } from 'react-native';
import Constants from 'expo-constants';

// react-native-maps renders Google Maps on Android, which throws a fatal
// "API key not found" (taking the whole app down) when no key is configured.
// Screens check this flag and show a fallback instead of mounting MapView.
// Set GOOGLE_MAPS_ANDROID_KEY in .env (wired in app.config.js).
export const MAPS_AVAILABLE =
  Platform.OS !== 'android' || Constants.expoConfig?.extra?.googleMapsAndroidKey === true;

export const WEB_MAP_URL = 'https://app.fault-line.dev/map';
