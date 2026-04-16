import { useEffect } from 'react';
import { Platform } from 'react-native';
import { requestTrackingPermissionsAsync } from 'expo-tracking-transparency';

// Apple App Tracking Transparency — required for iOS 14.5+ if serving ads
// Must be called before loading any ads
export default function TrackingPrompt() {
  useEffect(() => {
    if (Platform.OS === 'ios') {
      requestTrackingPermissionsAsync().catch(() => {});
    }
  }, []);

  return null;
}
