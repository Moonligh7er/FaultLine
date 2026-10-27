import {
  isLetterSupported,
  generateDemandLetter,
  generateAIEnhancedLetter,
  getStateStatute,
  getSupportedStates,
} from '../legalGenerator';
import { enhanceDemandLetter } from '../ai';
import { getRouting } from '../routing';
import { makeReport } from './fixtures';

jest.mock('../supabase', () => ({ supabase: {} }));
jest.mock('../ai', () => ({ enhanceDemandLetter: jest.fn() }));

const mockEnhance = enhanceDemandLetter as jest.MockedFunction<typeof enhanceDemandLetter>;
const BANNER = 'UNREVIEWED LEGAL CONTENT';

beforeEach(() => jest.clearAllMocks());

describe('isLetterSupported', () => {
  it.each(['MA', 'RI', 'NH'])('is true for %s', (s) => expect(isLetterSupported(s)).toBe(true));
  it('is case-insensitive', () => expect(isLetterSupported('ma')).toBe(true));
  it('is false for NY', () => expect(isLetterSupported('NY')).toBe(false));
  it('is false for undefined / empty', () => {
    expect(isLetterSupported(undefined)).toBe(false);
    expect(isLetterSupported('')).toBe(false);
  });
});

describe('getSupportedStates / getStateStatute', () => {
  it('lists the pilot states', () => {
    expect(getSupportedStates().sort()).toEqual(['MA', 'NH', 'RI']);
  });
  it('returns null for an unsupported state', () => {
    expect(getStateStatute('NY')).toBeNull();
  });
  it('returns the MA citation', () => {
    expect(getStateStatute('MA')?.statute).toBe('M.G.L. c. 84, § 15');
  });
});

describe('generateDemandLetter', () => {
  it('throws for an unsupported state', () => {
    const r = makeReport({ location: { latitude: 40.7, longitude: -74, state: 'NY', city: 'New York' } });
    expect(() => generateDemandLetter(r, 'NYC DOT')).toThrow(/No statute template/);
  });

  it('throws when the state is missing', () => {
    const r = makeReport({ location: { latitude: 40.7, longitude: -74 } });
    expect(() => generateDemandLetter(r, 'Somewhere')).toThrow(/unknown/);
  });

  it.each(['MA', 'RI', 'NH'])('puts the unreviewed banner at the top for pending-review %s', (state) => {
    const r = makeReport({ location: { latitude: 42, longitude: -71, state, city: 'Town' } });
    const letter = generateDemandLetter(r, 'DPW');
    expect(letter.verificationStatus).toBe('pending-review');
    expect(letter.banner).toContain(BANNER);
    expect(letter.letterText.slice(0, 200)).toContain(BANNER);
    expect(letter.letterText).toContain(letter.disclaimer);
    expect(letter.disclaimer).toContain('NOT YET LEGALLY REVIEWED');
  });

  it('uses the state notice period and citation for defective-highway framing', () => {
    const letter = generateDemandLetter(makeReport(), 'Boston DPW');
    expect(letter.framing).toBe('defective-highway');
    expect(letter.statute).toBe('M.G.L. c. 84, § 15');
    expect(letter.noticePeriodDays).toBe(30);
    expect(letter.letterText).toContain('M.G.L. c. 84, § 15');
  });

  it('computes overdue status from report age', () => {
    const fresh = generateDemandLetter(makeReport({ createdAt: new Date(Date.now() - 5 * 86400000).toISOString() }), 'DPW');
    expect(fresh.daysSinceReport).toBe(5);
    expect(fresh.isOverdue).toBe(false);
    expect(fresh.letterText).toContain('25 days remain');

    const old = generateDemandLetter(makeReport({ createdAt: new Date(Date.now() - 45 * 86400000).toISOString() }), 'DPW');
    expect(old.isOverdue).toBe(true);
    expect(old.letterText).toContain('has EXPIRED');
    expect(old.letterText).toContain('15 days beyond');
  });

  it('includes claimant and damages when supplied', () => {
    const letter = generateDemandLetter(makeReport(), 'DPW', 3, 'Jane Doe', 'Bent rim, $400');
    expect(letter.letterText).toContain('I, Jane Doe, am');
    expect(letter.letterText).toContain('DAMAGES CLAIMED');
    expect(letter.letterText).toContain('Bent rim, $400');
    expect(letter.letterText).toContain('3 independent community members have');
  });

  it('uses a non-highway template for access & equity categories', () => {
    const letter = generateDemandLetter(makeReport({ category: 'missing_curb_cut' }), 'ADA Coordinator');
    expect(letter.framing).toBe('ada-title-ii');
    expect(letter.letterText).toContain('FEDERAL COMPLAINT PATHWAY');
  });
});

describe('federal fallback routing', () => {
  it("finds the framework's federal agency when the state has no record", () => {
    // MA has no transit-accessibility record of its own.
    const r = getRouting('missing_audible_signage_transit', 'MA', 'transit-ada');
    expect(r?.jurisdictionScope).toBe('federal-fallback');
    expect(r?.primaryAuthority.name).toMatch(/Federal Transit Administration/);
    expect(getRouting('english_only_signage', 'CO', 'title-vi-language')?.categoryKey).toBe('title-vi-language-access-any');
  });

  it('prefers the state record over the federal one', () => {
    expect(getRouting('missing_curb_cut', 'MA', 'ada-title-ii')?.jurisdictionScope).toBe('MA');
  });

  it('has no federal fallback for physical defects', () => {
    expect(getRouting('pothole', 'CO', 'defective-highway')).toBeNull();
  });

  it('keeps the letter addressed locally and names the federal agency as the pathway', () => {
    const r = makeReport({ category: 'missing_audible_signage_transit' as never });
    const letter = generateDemandLetter(r, 'MBTA');
    expect(letter.letterText).toContain('Dear MBTA,');
    expect(letter.letterText).toMatch(/federal complaint may be filed with: Federal Transit Administration/);
    expect(letter.letterText).toContain('No state-specific routing is on file');
  });
});

describe('generateAIEnhancedLetter', () => {
  const report = makeReport();

  it('re-attaches banner and disclaimer when the AI rewrite drops them', async () => {
    mockEnhance.mockResolvedValue('Dear DPW, please fix the pothole. Sincerely, Jane');
    const base = generateDemandLetter(report, 'DPW');
    const out = await generateAIEnhancedLetter(report, 'DPW');

    expect(out.letterText).not.toBe(base.letterText);
    expect(out.letterText.startsWith(base.banner.trim())).toBe(true);
    expect(out.letterText).toContain('please fix the pothole');
    expect(out.letterText.trim().endsWith(base.disclaimer.trim())).toBe(true);
  });

  it('does not duplicate safeguards the AI kept', async () => {
    const base = generateDemandLetter(report, 'DPW');
    mockEnhance.mockResolvedValue(`${base.banner}\nImproved body.\n${base.disclaimer}`);
    const out = await generateAIEnhancedLetter(report, 'DPW');
    expect(out.letterText.split(BANNER).length - 1).toBe(1);
    expect(out.letterText.split(base.disclaimer).length - 1).toBe(1);
  });

  it('falls back to the base letter when the AI throws', async () => {
    mockEnhance.mockRejectedValue(new Error('network'));
    const base = generateDemandLetter(report, 'DPW');
    const out = await generateAIEnhancedLetter(report, 'DPW');
    expect(out.letterText).toBe(base.letterText);
  });

  it('returns the base letter when AI returns it unchanged or empty', async () => {
    const base = generateDemandLetter(report, 'DPW');
    mockEnhance.mockResolvedValue(base.letterText);
    expect((await generateAIEnhancedLetter(report, 'DPW')).letterText).toBe(base.letterText);
    mockEnhance.mockResolvedValue('');
    expect((await generateAIEnhancedLetter(report, 'DPW')).letterText).toBe(base.letterText);
  });

  it('passes letter context to the AI', async () => {
    mockEnhance.mockResolvedValue('');
    await generateAIEnhancedLetter(report, 'DPW', 4);
    expect(mockEnhance).toHaveBeenCalledWith(expect.stringContaining(BANNER), 'Pothole', 'MA', 10, 4, 'Dangerous');
  });

  it('still throws for unsupported states (no AI call)', async () => {
    const ny = makeReport({ location: { latitude: 40.7, longitude: -74, state: 'NY' } });
    await expect(generateAIEnhancedLetter(ny, 'NYC')).rejects.toThrow();
    expect(mockEnhance).not.toHaveBeenCalled();
  });
});
