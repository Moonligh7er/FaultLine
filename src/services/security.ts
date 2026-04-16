import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as FileSystem from 'expo-file-system';

// ============================================================
// Security Services
// SSL pinning, root/jailbreak detection, device attestation
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

// --- SSL CERTIFICATE PINNING ---

// Supabase public key pins (SHA-256)
// These should be updated when Supabase rotates their TLS certificates
// For production: extract pins from your specific Supabase project's cert chain
const PINNED_DOMAINS: Record<string, { sha256: string[] }> = {
  'supabase.co': {
    sha256: [
      // Primary and backup pins
      // To get your pins, run:
      // openssl s_client -connect YOUR_PROJECT.supabase.co:443 | openssl x509 -pubkey -noout | openssl rsa -pubin -outform der | openssl dgst -sha256 -binary | openssl enc -base64
      // For now, we use fetch validation rather than native pinning
    ],
  },
};

// Validate API responses come from expected domains
export function createPinnedFetch(originalFetch: typeof fetch): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    // Enforce HTTPS for all API calls
    if (url.startsWith('http://') && !url.includes('localhost')) {
      throw new Error('HTTP requests are not allowed — use HTTPS');
    }

    // Validate domain whitelist
    const allowedDomains = [
      'supabase.co',
      'supabase.in',
      'api.resend.com',
      'api.anthropic.com',
      'geocoding.geo.census.gov',
      'tile.openstreetmap.org',
      'formspree.io',
      // Kokoro TTS server (shared Modal endpoint, see project memory)
      'modal.run',
    ];

    try {
      const urlObj = new URL(url);
      const isAllowed = allowedDomains.some((d) => urlObj.hostname.endsWith(d));
      if (!isAllowed && !urlObj.hostname.includes('localhost')) {
        console.warn(`Blocked request to non-whitelisted domain: ${urlObj.hostname}`);
        throw new Error(`Request to ${urlObj.hostname} blocked by domain whitelist`);
      }
    } catch (e) {
      if ((e as Error).message.includes('blocked')) throw e;
      // URL parsing failed — allow (might be relative URL)
    }

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
