import 'react-native-get-random-values';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as aesjs from 'aes-js';

// ============================================================
// Encrypted local storage (Supabase's "LargeSecureStore" pattern)
// ============================================================
// A random 256-bit AES key lives in the OS keystore (expo-secure-store,
// this device only, never backed up). Values are AES-256-CTR encrypted with
// a fresh random IV per write and kept in AsyncStorage, which has no size
// limit. Used for the auth session, the offline report queue and commute
// history. Web has no keystore, so nothing here is available there.
// ============================================================

const KEY_NAME = 'fl_local_data_key_v1';
const PREFIX = 'enc1:';
// Prepended to the plaintext so a value encrypted under a different key
// (e.g. after the keystore was wiped) decrypts to "unreadable", not garbage.
const MARKER = 'FL1|';

let keyPromise: Promise<Uint8Array> | null = null;

export function isEncryptionAvailable(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

function randomBytes(length: number): Uint8Array {
  return (globalThis as any).crypto.getRandomValues(new Uint8Array(length));
}

async function getKey(): Promise<Uint8Array> {
  if (!isEncryptionAvailable()) throw new Error('Encrypted storage is not available on this platform');
  if (!keyPromise) {
    keyPromise = (async () => {
      const existing = await SecureStore.getItemAsync(KEY_NAME);
      if (existing && /^[0-9a-f]{64}$/.test(existing)) return aesjs.utils.hex.toBytes(existing);
      const key = randomBytes(32);
      await SecureStore.setItemAsync(KEY_NAME, aesjs.utils.hex.fromBytes(key), {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      });
      return key;
    })().catch((err) => {
      keyPromise = null;
      throw err;
    });
  }
  return keyPromise;
}

export function isEncryptedValue(stored: string | null | undefined): boolean {
  return typeof stored === 'string' && stored.startsWith(PREFIX);
}

export async function encryptString(plain: string): Promise<string> {
  const key = await getKey();
  const iv = randomBytes(16);
  const ctr = new aesjs.ModeOfOperation.ctr(key, new aesjs.Counter(iv));
  const cipher = ctr.encrypt(aesjs.utils.utf8.toBytes(MARKER + plain));
  return PREFIX + aesjs.utils.hex.fromBytes(iv) + aesjs.utils.hex.fromBytes(cipher);
}

/** Returns null when the value can't be decrypted with this device's key. */
export async function decryptString(stored: string): Promise<string | null> {
  if (!isEncryptedValue(stored)) return null;
  const hex = stored.slice(PREFIX.length);
  if (hex.length < 32 || hex.length % 2 !== 0 || !/^[0-9a-f]*$/.test(hex)) return null;
  const key = await getKey();
  const iv = aesjs.utils.hex.toBytes(hex.slice(0, 32));
  const ctr = new aesjs.ModeOfOperation.ctr(key, new aesjs.Counter(iv));
  let plain: string;
  try {
    plain = aesjs.utils.utf8.fromBytes(ctr.decrypt(aesjs.utils.hex.toBytes(hex.slice(32))));
  } catch {
    return null;
  }
  return plain.startsWith(MARKER) ? plain.slice(MARKER.length) : null;
}

// ── JSON values in AsyncStorage ─────────────────────────────

/**
 * Reads an encrypted JSON value. A plaintext value written by an older app
 * version is returned once and immediately re-written encrypted.
 */
export async function getEncryptedJSON<T>(key: string, fallback: T): Promise<T> {
  const raw = await AsyncStorage.getItem(key);
  if (raw == null) return fallback;
  if (!isEncryptedValue(raw)) {
    try {
      const legacy = JSON.parse(raw) as T;
      await setEncryptedJSON(key, legacy).catch(() => AsyncStorage.removeItem(key));
      return legacy;
    } catch {
      return fallback;
    }
  }
  const plain = await decryptString(raw);
  if (plain == null) return fallback;
  try {
    return JSON.parse(plain) as T;
  } catch {
    return fallback;
  }
}

/** Throws when encryption is unavailable — callers must not fall back to plaintext. */
export async function setEncryptedJSON(key: string, value: unknown): Promise<void> {
  await AsyncStorage.setItem(key, await encryptString(JSON.stringify(value)));
}

// ── Supabase auth storage adapter ───────────────────────────

export const LargeSecureStore = {
  async getItem(key: string): Promise<string | null> {
    const raw = await AsyncStorage.getItem(key);
    if (raw == null) return null;
    if (!isEncryptedValue(raw)) {
      // Session saved in plaintext by an older app version: keep the user
      // signed in and re-save it encrypted.
      await LargeSecureStore.setItem(key, raw).catch(() => {});
      return raw;
    }
    return decryptString(raw);
  },
  async setItem(key: string, value: string): Promise<void> {
    await AsyncStorage.setItem(key, await encryptString(value));
  },
  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
  },
};
