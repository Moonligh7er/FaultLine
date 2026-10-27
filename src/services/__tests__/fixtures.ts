import type {
  Report,
  DigitalReportContext,
  InsiderReportContext,
  CommercialPropertyContext,
  CorridorGeometry,
} from '../../types';

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

// --- Extended report contexts ---

export function makeDigitalContext(overrides: Partial<DigitalReportContext> = {}): DigitalReportContext {
  return {
    targetUrl: 'https://www.boston.gov/permits/apply',
    assistiveTech: 'NVDA',
    browser: 'Firefox',
    platform: 'Windows',
    wcagCriterion: '4.1.2',
    snapshotRef: 'snap/abc',
    ...overrides,
  };
}

export function makeInsiderContext(overrides: Partial<InsiderReportContext> = {}): InsiderReportContext {
  return {
    insiderCategory: 'public_works',
    observedDurationDays: 540,
    priorInternalReportRef: 'Internal ticket 2024-03-15',
    documentaryReference: 'Work order #12345',
    ...overrides,
  };
}

export function makeCommercialContext(overrides: Partial<CommercialPropertyContext> = {}): CommercialPropertyContext {
  return {
    businessName: 'Riverdale Retail Center',
    businessAddressFull: '123 Main St, Springfield, MA 01103',
    publicViewConfirmed: true,
    reporterAttestation: true,
    ...overrides,
  };
}

export function makeCorridorGeometry(overrides: Partial<CorridorGeometry> = {}): CorridorGeometry {
  return {
    start: { latitude: 42.3601, longitude: -71.0589 },
    end: { latitude: 42.3622, longitude: -71.0612 },
    streetName: 'Beacon Street',
    fromCrossStreet: 'Park St',
    toCrossStreet: 'Charles St',
    ...overrides,
  };
}
