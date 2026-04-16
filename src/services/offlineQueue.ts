import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';
import { Report } from '../types';
import { createReport } from './reports';

const QUEUE_KEY = 'offline_report_queue';

export async function isOnline(): Promise<boolean> {
  const state = await Network.getNetworkStateAsync();
  return state.isConnected === true && state.isInternetReachable === true;
}

export async function addToQueue(report: Omit<Report, 'id' | 'createdAt' | 'updatedAt' | 'upvoteCount' | 'confirmCount'>): Promise<void> {
  const queue = await getQueue();
  queue.push({ ...report, offlineQueued: true, _queuedAt: new Date().toISOString() });
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function getQueue(): Promise<any[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  return raw ? JSON.parse(raw) : [];
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
    const result = await createReport(reportData);
    if (result) {
      success++;
    } else {
      failed++;
      remaining.push(item);
    }
  }

  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
  return { success, failed };
}

export async function clearQueue(): Promise<void> {
  await AsyncStorage.removeItem(QUEUE_KEY);
}
