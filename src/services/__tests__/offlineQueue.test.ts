import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';
import { addToQueue, getQueue, getQueueSize, processQueue, clearQueue, isOnline } from '../offlineQueue';
import { submitReport } from '../reports';
import { makeReportInput, makeReport } from './fixtures';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-network', () => ({ getNetworkStateAsync: jest.fn() }));
jest.mock('../reports', () => ({ submitReport: jest.fn() }));

const mockNetwork = Network.getNetworkStateAsync as jest.Mock;
const mockSubmit = submitReport as jest.MockedFunction<typeof submitReport>;

function setOnline(online: boolean) {
  mockNetwork.mockResolvedValue({ isConnected: online, isInternetReachable: online });
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  setOnline(true);
});

describe('isOnline', () => {
  it('requires both connected and internet-reachable', async () => {
    mockNetwork.mockResolvedValue({ isConnected: true, isInternetReachable: null });
    expect(await isOnline()).toBe(false);
    setOnline(true);
    expect(await isOnline()).toBe(true);
  });
});

describe('queue storage', () => {
  it('adds items flagged offlineQueued with a timestamp', async () => {
    await addToQueue(makeReportInput({ description: 'a' }));
    await addToQueue(makeReportInput({ description: 'b' }));
    const q = await getQueue();
    expect(q).toHaveLength(2);
    expect(q[0]).toMatchObject({ description: 'a', offlineQueued: true });
    expect(typeof q[0]._queuedAt).toBe('string');
    expect(await getQueueSize()).toBe(2);
  });

  it('clearQueue empties it', async () => {
    await addToQueue(makeReportInput());
    await clearQueue();
    expect(await getQueue()).toEqual([]);
  });
});

describe('processQueue', () => {
  it('does nothing while offline', async () => {
    await addToQueue(makeReportInput());
    setOnline(false);
    expect(await processQueue()).toEqual({ success: 0, failed: 0 });
    expect(mockSubmit).not.toHaveBeenCalled();
    expect(await getQueueSize()).toBe(1);
  });

  it('submits each item through submitReport without the _queuedAt field', async () => {
    await addToQueue(makeReportInput({ description: 'a' }));
    mockSubmit.mockResolvedValue(makeReport());
    expect(await processQueue()).toEqual({ success: 1, failed: 0 });
    expect(mockSubmit).toHaveBeenCalledTimes(1);
    const arg = mockSubmit.mock.calls[0][0] as any;
    expect(arg.description).toBe('a');
    expect(arg.offlineQueued).toBe(true);
    expect('_queuedAt' in arg).toBe(false);
    expect(await getQueue()).toEqual([]);
  });

  it('keeps failed items queued (in order) and drops successes', async () => {
    await addToQueue(makeReportInput({ description: 'ok-1' }));
    await addToQueue(makeReportInput({ description: 'fail-1' }));
    await addToQueue(makeReportInput({ description: 'ok-2' }));
    await addToQueue(makeReportInput({ description: 'fail-2' }));
    mockSubmit.mockImplementation(async (r) => (r.description?.startsWith('ok') ? makeReport() : null));

    expect(await processQueue()).toEqual({ success: 2, failed: 2 });
    const remaining = await getQueue();
    expect(remaining.map((r) => r.description)).toEqual(['fail-1', 'fail-2']);
    expect(typeof remaining[0]._queuedAt).toBe('string');
  });

  it('retries remaining items on the next run', async () => {
    await addToQueue(makeReportInput({ description: 'x' }));
    mockSubmit.mockResolvedValueOnce(null).mockResolvedValueOnce(makeReport());
    expect(await processQueue()).toEqual({ success: 0, failed: 1 });
    expect(await processQueue()).toEqual({ success: 1, failed: 0 });
    expect(await getQueueSize()).toBe(0);
  });
});
