import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

const DSN = Constants.expoConfig?.extra?.sentryDsn || '';

export function initCrashReporting() {
  if (!DSN) {
    console.log('Sentry DSN not configured — crash reporting disabled');
    return;
  }

  Sentry.init({
    dsn: DSN,
    tracesSampleRate: 0.2, // 20% of transactions for performance monitoring
    enableAutoSessionTracking: true,
    sessionTrackingIntervalMillis: 30000,
    environment: __DEV__ ? 'development' : 'production',
    beforeSend(event) {
      // Strip any PII from crash reports
      if (event.user) {
        delete event.user.email;
        delete event.user.ip_address;
      }
      return event;
    },
  });
}

export function captureError(error: Error, context?: Record<string, any>) {
  if (context) {
    Sentry.setContext('extra', context);
  }
  Sentry.captureException(error);
}

export function setUser(userId: string | null) {
  if (userId) {
    Sentry.setUser({ id: userId });
  } else {
    Sentry.setUser(null);
  }
}

export { Sentry };
