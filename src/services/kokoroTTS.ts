// ============================================================
// Kokoro TTS — Modal-hosted GPU TTS server (shared across projects).
// ============================================================
// Posts text → /tts → receives audio/wav → caches to a temp file →
// plays via expo-av. Falls back to native expo-speech on failure
// (network error, cold-start timeout, server unreachable).
//
// Server: https://moons7onr--kokoro-tts-server-kokorotts-tts.modal.run
// Cold start: ~10-15s. Warm: <1s. Cost: ~$0.001/request.
// ============================================================

import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import * as Speech from 'expo-speech';

const KOKORO_ENDPOINT =
  'https://moons7onr--kokoro-tts-server-kokorotts-tts.modal.run';
const KOKORO_HEALTH =
  'https://moons7onr--kokoro-tts-server-kokorotts-health.modal.run';

export type KokoroVoice =
  | 'af_bella'
  | 'af_sarah'
  | 'af_nicole'
  | 'am_adam'
  | 'am_michael'
  | 'bf_emma'
  | 'bf_isabella'
  | 'bm_george'
  | 'bm_lewis';

export interface KokoroSpeakOptions {
  voice?: KokoroVoice;
  speed?: number;
  /** Ignored on Kokoro path; passed through to expo-speech fallback. */
  language?: string;
  /** Called when audio actually starts playing. */
  onStart?: () => void;
  /** Called when audio finishes (or fails — both paths). */
  onDone?: () => void;
}

const DEFAULT_VOICE: KokoroVoice = 'bf_emma';
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_TEXT_LENGTH = 2000;

let activeSound: Audio.Sound | null = null;

/**
 * Speak `text` using Kokoro TTS. Returns a promise that resolves when
 * playback finishes (or after a fallback completes). Never throws.
 */
export async function kokoroSpeak(
  text: string,
  options: KokoroSpeakOptions = {},
): Promise<void> {
  const { voice = DEFAULT_VOICE, speed = 1.0, onStart, onDone } = options;

  if (!text || !text.trim()) {
    onDone?.();
    return;
  }

  // Kokoro can lag on very long inputs; chunk anything over the limit.
  const trimmed = text.length > MAX_TEXT_LENGTH ? text.slice(0, MAX_TEXT_LENGTH) : text;

  try {
    const wavUri = await fetchKokoroAudio(trimmed, voice, speed);
    await playWav(wavUri, onStart, onDone);
  } catch (err) {
    // Fall back to expo-speech so the conversation never silently dies.
    console.warn('[kokoro] falling back to expo-speech:', (err as Error)?.message);
    await new Promise<void>((resolve) => {
      Speech.speak(trimmed, {
        language: options.language ?? 'en-US',
        rate: speed * 0.9,
        onStart: () => onStart?.(),
        onDone: () => {
          onDone?.();
          resolve();
        },
        onError: () => {
          onDone?.();
          resolve();
        },
      });
    });
  }
}

/** Cancel any in-progress Kokoro playback (and stop expo-speech). */
export async function kokoroStop(): Promise<void> {
  try {
    if (activeSound) {
      await activeSound.stopAsync();
      await activeSound.unloadAsync();
      activeSound = null;
    }
  } catch {
    // ignore
  }
  try {
    await Speech.stop();
  } catch {
    // ignore
  }
}

/** Health-check the Kokoro server. Useful on app start to warm cold start. */
export async function kokoroHealthCheck(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(KOKORO_HEALTH, { signal: ctrl.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------

async function fetchKokoroAudio(
  text: string,
  voice: KokoroVoice,
  speed: number,
): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(KOKORO_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'audio/wav' },
      body: JSON.stringify({ text, voice, speed }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`Kokoro responded ${res.status}`);

    // Read response as base64 (Modal serves raw audio/wav)
    const buf = await res.arrayBuffer();
    const base64 = arrayBufferToBase64(buf);

    const filename = `${FileSystem.cacheDirectory}kokoro-${Date.now()}.wav`;
    await FileSystem.writeAsStringAsync(filename, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return filename;
  } finally {
    clearTimeout(timer);
  }
}

async function playWav(
  uri: string,
  onStart?: () => void,
  onDone?: () => void,
): Promise<void> {
  // Stop any previous playback first
  await kokoroStop();

  const { sound } = await Audio.Sound.createAsync(
    { uri },
    { shouldPlay: true },
    (status) => {
      if (!status.isLoaded) return;
      if (status.didJustFinish) {
        sound.unloadAsync().catch(() => {});
        if (activeSound === sound) activeSound = null;
        // best-effort cleanup of the temp file
        FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
        onDone?.();
      }
    },
  );
  activeSound = sound;
  onStart?.();
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  // React Native lacks Buffer; build base64 by hand from bytes.
  let binary = '';
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  // global.btoa is polyfilled by expo
  return globalThis.btoa(binary);
}
