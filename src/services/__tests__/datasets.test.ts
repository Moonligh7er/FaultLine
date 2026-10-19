import { getSupportedStates, getStatuteRecord, statuteDisclaimer, getVerifiedStates } from '../statutes';
import { getSupportedJurisdictions, getRoutingsByJurisdiction, getRouting, routingDisclaimer } from '../routing';
import { getFraming, getTemplate, templateDisclaimer, type LegalFraming } from '../legal-templates';
import { CATEGORIES } from '../../constants/categories';

const SEMVER = /^\d+\.\d+\.\d+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;
const STATUSES = ['verified', 'pending-review', 'stale', 'draft'];

describe('statute dataset integrity', () => {
  const states = getSupportedStates();

  it('has unique, uppercase two-letter state codes', () => {
    expect(states.length).toBeGreaterThan(0);
    expect(new Set(states).size).toBe(states.length);
    for (const s of states) expect(s).toMatch(/^[A-Z]{2}$/);
  });

  it.each(getSupportedStates())('%s record has all required fields', (s) => {
    const r = getStatuteRecord(s)!;
    expect(r).toBeTruthy();
    expect(r.stateCode).toBe(s);
    expect(r.version).toMatch(SEMVER);
    expect(r.statute.trim()).not.toBe('');
    expect(r.title.trim()).not.toBe('');
    expect(r.description.trim()).not.toBe('');
    expect(r.filingRequirements.trim()).not.toBe('');
    expect(Number.isInteger(r.noticePeriodDays)).toBe(true);
    expect(r.noticePeriodDays).toBeGreaterThan(0);
    expect(r.noticePeriodDays).toBeLessThanOrEqual(365);
    expect(STATUSES).toContain(r.verificationStatus);
    expect(Array.isArray(r.knownAmbiguities)).toBe(true);
    for (const a of r.knownAmbiguities) {
      expect(a.concern.trim()).not.toBe('');
      expect(a.detail.trim()).not.toBe('');
    }
    expect(r.sources.length).toBeGreaterThan(0);
    for (const src of r.sources) {
      expect(src.label.trim()).not.toBe('');
      expect(src.url).toMatch(/^https?:\/\//);
      expect(src.accessedAt).toMatch(ISO_DATE);
    }
  });

  it.each(getSupportedStates())('%s: verified entries carry a reviewer, dates and a source', (s) => {
    const r = getStatuteRecord(s)!;
    if (r.verificationStatus === 'verified') {
      expect(r.verifiedBy).toBeTruthy();
      expect(r.verifiedAt).toMatch(ISO_DATE);
      expect(r.nextReviewAt).toMatch(ISO_DATE);
    } else {
      // Anything not verified must never present as reviewed.
      expect(statuteDisclaimer(r)).not.toContain('legal review:');
    }
  });

  it('verified states are a subset of supported states', () => {
    for (const s of getVerifiedStates()) expect(states).toContain(s);
  });
});

describe('routing dataset integrity', () => {
  const categoryKeys = new Set(CATEGORIES.map((c) => c.key as string));
  const jurisdictions = getSupportedJurisdictions();

  it('covers every statute state', () => {
    for (const s of getSupportedStates()) expect(jurisdictions).toContain(s);
  });

  // State-scoped jurisdictions only: getRoutingsByJurisdiction upper-cases its
  // input, so the lowercase 'federal-fallback' scope can't be listed through it.
  const stateJurisdictions = jurisdictions.filter((j) => /^[A-Z]{2}$/.test(j));

  it.each(stateJurisdictions)('%s records have required fields', (j) => {
    const list = getRoutingsByJurisdiction(j);
    expect(list.length).toBeGreaterThan(0);
    const keys = new Set<string>();
    for (const r of list) {
      expect(r.jurisdictionScope).toBe(j);
      expect(r.version).toMatch(SEMVER);
      expect(r.primaryAuthority.name.trim()).not.toBe('');
      expect(STATUSES).toContain(r.verificationStatus);
      expect(categoryKeys.has(r.categoryKey)).toBe(true);
      expect(keys.has(r.categoryKey)).toBe(false); // no duplicate (category, jurisdiction)
      keys.add(r.categoryKey);
      // README policy: sources are mandatory once a record is verified.
      if (r.verificationStatus === 'verified') expect(r.sources.length).toBeGreaterThan(0);
      for (const src of r.sources) {
        expect(src.url).toMatch(/^https?:\/\//);
        expect(src.accessedAt).toMatch(ISO_DATE);
      }
      if (r.verificationStatus !== 'verified') {
        expect(routingDisclaimer(r)).toContain('NOT YET LEGALLY REVIEWED');
      }
    }
  });

  it('routes MA potholes to a MA-specific record', () => {
    const r = getRouting('pothole', 'ma');
    expect(r?.jurisdictionScope).toBe('MA');
  });

  it('returns null for an unknown category/jurisdiction', () => {
    expect(getRouting('pothole', 'NY')).toBeNull();
  });
});

describe('legal templates', () => {
  const framings: LegalFraming[] = ['defective-highway', 'ada-title-ii', 'fair-housing-504', 'title-vi-language', 'transit-ada'];

  it.each(framings)('%s template is complete', (f) => {
    const t = getTemplate(f);
    expect(t.framing).toBe(f);
    expect(t.version).toMatch(SEMVER);
    for (const k of ['headline', 'statuteCitation', 'statuteTitle', 'legalBasisText', 'filingRequirements', 'federalComplaintPathway'] as const) {
      expect(t[k].trim()).not.toBe('');
    }
    expect(t.statuteUrl).toMatch(/^https?:\/\//);
    expect(t.noticePeriodDays).toBeGreaterThan(0);
    expect(t.demandLanguage.inspectVerb.trim()).not.toBe('');
    expect(t.demandLanguage.remedyClause.trim()).not.toBe('');
    expect(templateDisclaimer(t)).toContain(`v${t.version}`);
  });

  it('every category maps to a framing with a template', () => {
    for (const c of CATEGORIES) {
      expect(getTemplate(getFraming(c.key))).toBeDefined();
    }
  });
});
