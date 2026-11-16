import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

const DSN = Constants.expoConfig?.extra?.sentryDsn || '';

// ── Scrubbing ───────────────────────────────────────────────
// Nothing that identifies a user, a session or a report's private content
// leaves the device in a crash report: URL query strings (magic-link codes,
// API keys, coordinates), bearer tokens / JWTs, and the row values Postgres
// echoes back in "Failing row contains (...)" errors.

const FILTERED = '[Filtered]';

export function scrubString(value: string): string {
  return (
    value
      // PostgREST/Postgres check-violation detail echoes the whole row
      .replace(/Failing row contains[^\n]*/g, `Failing row contains ${FILTERED}`)
      // JWTs (Supabase access tokens, anon key)
      .replace(/eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, FILTERED)
      .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, `$1 ${FILTERED}`)
      // Query strings and fragments of any URL (https, faultline://, exp://)
      .replace(/([a-z][a-z0-9+.-]*:\/\/[^\s?#"'<>]*)[?#][^\s"'<>]*/gi, `$1?${FILTERED}`)
      // Loose key=value secrets outside URLs
      .replace(
        /\b(access_token|refresh_token|id_token|token|code|apikey|api_key|key|password|secret|code_verifier)=[^&\s#"']+/gi,
        `$1=${FILTERED}`,
      )
  );
}

const SKIP_KEYS = new Set(['stacktrace', 'frames', 'debug_meta', 'sdk']);

function scrubDeep<T>(value: T, depth = 0): T {
  if (depth > 8 || value == null) return value;
  if (typeof value === 'string') return scrubString(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => scrubDeep(v, depth + 1)) as unknown as T;
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SKIP_KEYS.has(k)) out[k] = v;
      else if (/^(authorization|cookie|apikey|access_token|refresh_token|password)$/i.test(k)) out[k] = FILTERED;
      else out[k] = scrubDeep(v, depth + 1);
    }
    return out as T;
  }
  return value;
}

export function scrubBreadcrumb(breadcrumb: Sentry.Breadcrumb): Sentry.Breadcrumb | null {
  return scrubDeep(breadcrumb);
}

export function scrubEvent<E extends Sentry.Event>(event: E): E {
  const scrubbed = scrubDeep(event);
  if (scrubbed.user) {
    delete scrubbed.user.email;
    delete scrubbed.user.ip_address;
    delete scrubbed.user.username;
  }
  if (scrubbed.request) {
    delete scrubbed.request.cookies;
    delete scrubbed.request.query_string;
    if (scrubbed.request.headers) scrubbed.request.headers = {};
  }
  return scrubbed;
}

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
    sendDefaultPii: false,
    beforeBreadcrumb(breadcrumb) {
      return scrubBreadcrumb(breadcrumb);
    },
    beforeSend(event) {
      return scrubEvent(event);
    },
    beforeSendTransaction(event) {
      return scrubEvent(event);
    },
  });
}

export function captureError(error: Error, context?: Record<string, any>) {
  if (context) {
    Sentry.setContext('extra', scrubDeep(context));
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
