import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';
import { Report } from '../types';
import { submitReport } from './reports';
import { hasAnonymousVideo } from './mediaPolicy';
import { getEncryptedJSON, setEncryptedJSON } from './secureStorage';

// Queued reports (location, description, insider context, local media
// paths) are stored encrypted with the keystore-held key — see
// secureStorage.ts. If encryption isn't available nothing is queued: the
// queue is never written in plain text.
const QUEUE_KEY = 'offline_report_queue';

type QueuedReport = Omit<Report, 'id' | 'createdAt' | 'updatedAt' | 'upvoteCount' | 'confirmCount'>;

export async function isOnline(): Promise<boolean> {
  const state = await Network.getNetworkStateAsync();
  return state.isConnected === true && state.isInternetReachable === true;
}

export async function addToQueue(report: QueuedReport): Promise<void> {
  if (hasAnonymousVideo(report)) {
    throw new Error('Video cannot be attached to an anonymous report');
  }
  const queue = await getQueue();
  queue.push({ ...report, offlineQueued: true, _queuedAt: new Date().toISOString() });
  await setEncryptedJSON(QUEUE_KEY, queue);
}

export async function getQueue(): Promise<any[]> {
  const queue = await getEncryptedJSON<any[]>(QUEUE_KEY, []);
  return Array.isArray(queue) ? queue : [];
}

export async function getQueueSize(): Promise<number> {
  const queue = await getQueue();
  return queue.length;
}

export async function processQueue(): Promise<{ success: number; failed: number }> {
  const online = await isOnline();
  if (!online) return { success: 0, failed: 0 };

  const queue = await getQueue();
  if (queue.length === 0) return { success: 0, failed: 0 };

  let success = 0;
  let failed = 0;
  const remaining: any[] = [];

  for (const item of queue) {
    const { _queuedAt, ...reportData } = item;
    if (hasAnonymousVideo(reportData)) {
      // Can never be accepted; drop it rather than retry forever.
      failed++;
      continue;
    }
    const result = await submitReport(reportData);
    if (result) {
      success++;
    } else {
      failed++;
      remaining.push(item);
    }
  }

  if (remaining.length === 0) await clearQueue();
  else await setEncryptedJSON(QUEUE_KEY, remaining);
  return { success, failed };
}

export async function clearQueue(): Promise<void> {
  await AsyncStorage.removeItem(QUEUE_KEY);
}
