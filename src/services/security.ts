import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as FileSystem from 'expo-file-system/legacy';
import Constants from 'expo-constants';

// ============================================================
// Security Services
// Outbound request allow-list, root/jailbreak detection
// ============================================================

// --- ROOT / JAILBREAK DETECTION ---

export interface SecurityStatus {
  isRooted: boolean;
  isEmulator: boolean;
  riskLevel: 'safe' | 'warning' | 'dangerous';
  warnings: string[];
}

export async function checkDeviceSecurity(): Promise<SecurityStatus> {
  const warnings: string[] = [];
  let isRooted = false;
  let isEmulator = !Device.isDevice;

  if (isEmulator) {
    warnings.push('Running on emulator/simulator');
  }

  if (Platform.OS === 'android') {
    isRooted = await checkAndroidRoot();
    if (isRooted) warnings.push('Device appears to be rooted');
  }

  if (Platform.OS === 'ios') {
    isRooted = await checkIOSJailbreak();
    if (isRooted) warnings.push('Device appears to be jailbroken');
  }

  const riskLevel = isRooted ? 'dangerous' : isEmulator ? 'warning' : 'safe';

  return { isRooted, isEmulator, riskLevel, warnings };
}

async function checkAndroidRoot(): Promise<boolean> {
  // Check for common root indicators
  const rootPaths = [
    '/system/app/Superuser.apk',
    '/system/xbin/su',
    '/system/bin/su',
    '/sbin/su',
    '/data/local/xbin/su',
    '/data/local/bin/su',
    '/data/local/su',
    '/system/bin/failsafe/su',
  ];

  for (const path of rootPaths) {
    try {
      const info = await FileSystem.getInfoAsync(path);
      if (info.exists) return true;
    } catch {
      // Expected — path doesn't exist
    }
  }

  return false;
}

async function checkIOSJailbreak(): Promise<boolean> {
  // Check for common jailbreak indicators
  const jailbreakPaths = [
    '/Applications/Cydia.app',
    '/private/var/lib/apt',
    '/private/var/stash',
    '/usr/sbin/sshd',
    '/usr/bin/sshd',
    '/usr/libexec/sftp-server',
    '/etc/apt',
  ];

  for (const path of jailbreakPaths) {
    try {
      const info = await FileSystem.getInfoAsync(path);
      if (info.exists) return true;
    } catch {
      // Expected
    }
  }

  return false;
}

// --- OUTBOUND REQUEST ALLOW-LIST ---
// The JS fetch() used by the app is limited to the hosts below. This is an
// allow-list, not certificate pinning: TLS is validated by the OS as usual,
// and native SDKs (maps, ads, crash reporting) make their own connections.

const extra = Constants.expoConfig?.extra || {};

function hostOf(url: unknown): string | null {
  if (typeof url !== 'string' || !url) return null;
  try {
    return new URL(url).hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

// Exact hosts: only this host, no subdomains.
const EXACT_HOSTS = [
  hostOf(extra.supabaseUrl) || 'dzewklljiksyivsfpunt.supabase.co', // our Supabase project
  'exp.host', // Expo push token registration
  'formspree.io', // in-app feedback form
  'geocoding.geo.census.gov', // election district overlay (Census geocoder)
  'tile.openstreetmap.org',
  '311.boston.gov', // Open311 (Boston)
  // Kokoro TTS on Modal: the configured endpoints only, not all of modal.run.
  hostOf(extra.kokoroTtsUrl),
  hostOf(extra.kokoroHealthUrl),
  hostOf(extra.sentryDsn), // crash reports (JS transport)
].filter((h): h is string => !!h);

// Host plus its subdomains (matched on a dot boundary).
const DOMAIN_SUFFIXES = [
  'seeclickfix.com', // SeeClickFix API
];

export function isAllowedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (!host) return false;
  if (EXACT_HOSTS.includes(host)) return true;
  return DOMAIN_SUFFIXES.some((d) => host === d || host.endsWith('.' + d));
}

// Local, non-network URLs that React Native's fetch can read.
const LOCAL_SCHEMES = new Set(['file:', 'content:', 'data:', 'blob:', 'asset:', 'ph:', 'assets-library:']);
const DEV_LOOPBACK = new Set(['localhost', '127.0.0.1', '10.0.2.2', '[::1]']);

/** Throws if `url` may not be fetched. Fails closed on anything unparseable. */
export function assertRequestAllowed(url: string): void {
  let urlObj: URL;
  try {
    urlObj = new URL(url);
  } catch {
    throw new Error('Request blocked: not an absolute URL');
  }
  const protocol = urlObj.protocol.toLowerCase();
  if (LOCAL_SCHEMES.has(protocol)) return;

  const host = urlObj.hostname.toLowerCase();
  if (typeof __DEV__ !== 'undefined' && __DEV__ && DEV_LOOPBACK.has(host)) return;

  if (protocol !== 'https:') {
    throw new Error('HTTP requests are not allowed — use HTTPS');
  }
  if (!isAllowedHost(host)) {
    console.warn(`Blocked request to non-allow-listed host: ${host}`);
    throw new Error(`Request to ${host} blocked by domain allow-list`);
  }
}

// Wraps fetch so every request is checked against the allow-list.
export function createPinnedFetch(originalFetch: typeof fetch): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request)?.url;
    assertRequestAllowed(url);
    return originalFetch(input, init);
  };
}

// --- HONEYPOT FIELD ---
// Added to report submission to catch bots that fill all fields

export function generateHoneypotValue(): string {
  // Always return empty — real users never see this field
  // Bots that auto-fill all fields will put something here
  return '';
}

export function isHoneypotTriggered(value: string | undefined | null): boolean {
  return !!value && value.length > 0;
}
