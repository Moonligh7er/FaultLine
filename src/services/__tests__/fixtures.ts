import type { Report } from '../../types';

export type ReportInput = Omit<Report, 'id' | 'createdAt' | 'updatedAt' | 'upvoteCount' | 'confirmCount'>;

export function makeReportInput(overrides: Partial<ReportInput> = {}): ReportInput {
  return {
    userId: 'user-1',
    category: 'pothole',
    location: {
      latitude: 42.3601,
      longitude: -71.0589,
      address: '1 Beacon St',
      city: 'Boston',
      state: 'MA',
      zip: '02108',
    },
    description: 'Deep pothole in the right lane',
    severity: { hazardLevel: 'dangerous' },
    media: [],
    status: 'submitted',
    isAnonymous: false,
    sensorDetected: false,
    offlineQueued: false,
    isQuickReport: false,
    ...overrides,
  };
}

export function makeReport(overrides: Partial<Report> = {}): Report {
  return {
    ...makeReportInput(),
    id: 'report-1',
    upvoteCount: 0,
    confirmCount: 0,
    createdAt: new Date(Date.now() - 10 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}
