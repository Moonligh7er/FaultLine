import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearQueue } from './offlineQueue';
import { clearCommuteHistory } from './smartPush';
import { clearProximityCache } from './proximityAlerts';
import { clearPendingSignIn } from './authLinking';

// Personal data kept on the device, removed on sign-out and account
// deletion: unsent reports, commute history, cached nearby reports, the
// hazards the user passed, reporting streak and journalist alert emails.
// Preferences (language, theme, accessibility, onboarding) stay.
const ACTIVITY_KEYS = ['report_streak', 'last_report_date', 'media_alert_subscriptions'];

export async function clearLocalUserData(): Promise<void> {
  await Promise.allSettled([
    clearQueue(),
    clearCommuteHistory(),
    clearProximityCache(),
    clearPendingSignIn(),
    AsyncStorage.multiRemove(ACTIVITY_KEYS),
  ]);
}
