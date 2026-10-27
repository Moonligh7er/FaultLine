# Report-Flow Section Components

Composable UI sections for the extended report submission flow. Each section is a controlled component — parent screen owns the state and passes `value` + `onChange`. They compose into `src/screens/ReportScreen.tsx` conditionally based on the selected category / subject.

## Sections

| Component | Renders when | Data captured |
|---|---|---|
| `DigitalReportSection` | Category is in `URL_FIRST_CATEGORIES` (Access & Equity Group F) | Target URL, assistive tech, browser, platform, WCAG criterion |
| `InsiderReportSection` | Reporter marks themselves as public employee | Insider category, observed duration, prior internal report ref, documentary ref |
| `CommercialPropertySection` | `reportSubject === 'commercial_property'` | Business name, full address, chain identifier, public-view attestation, reporter attestation |
| `CorridorReportSection` | `geometryType === 'corridor'` | Street name, cross streets, start/end GPS coordinates |

## Wiring into ReportScreen

**Wired (2026-10-26)** in the full (5-step) wizard; quick mode does not show these sections.

| Section | Step | Trigger |
|---|---|---|
| Corridor | 2 · Location | "This report covers a stretch of road" toggle. No map picker yet: start / end pins use the device's current location (`getCurrentLocation`). |
| Commercial | 2 · Location | "This is a commercial property" toggle |
| Digital | 3 · Details | Category in `URL_FIRST_CATEGORIES` |
| Insider | 3 · Details | "I'm a public employee reporting from inside" toggle (defaults the report to anonymous; an anonymous insider report carries no `user_id`) |

Required fields are checked by `src/services/reportExtensions.ts` (`validateDigital` / `validateInsider` / `validateCommercial` / `validateCorridor`) when the user taps Next on that step, and again on submit. The same module maps each context to its DB columns (`buildExtendedColumns`) — see the header there and `supabase/migration_019*` / `migration_020*`. Commercial reports skip the direct 311/email submission and the cluster pipeline.

Original integration sketch (pseudo-code), kept for reference:

```tsx
import { useState } from 'react';
import {
  DigitalReportSection,
  InsiderReportSection,
  CommercialPropertySection,
  CorridorReportSection,
} from '../components/report-flow';
import { isUrlFirstCategory, buildDigitalContext, captureSnapshot } from '../services/digitalSnapshot';
import { buildInsiderContext } from '../services/insiderReports';
import type {
  DigitalReportContext,
  InsiderReportContext,
  CommercialPropertyContext,
  CorridorGeometry,
} from '../types';

export function ReportScreen() {
  const [category, setCategory] = useState<string>('pothole');
  const [reportSubject, setReportSubject] = useState<'public_infrastructure' | 'commercial_property'>('public_infrastructure');
  const [geometryType, setGeometryType] = useState<'point' | 'corridor' | 'area'>('point');
  const [isInsider, setIsInsider] = useState(false);

  const [digital, setDigital] = useState<Partial<DigitalReportContext>>({});
  const [insider, setInsider] = useState<Partial<InsiderReportContext>>({});
  const [commercial, setCommercial] = useState<Partial<CommercialPropertyContext>>({});
  const [corridor, setCorridor] = useState<Partial<CorridorGeometry>>({});

  // ... existing category picker / photo picker / severity picker ...

  return (
    <ScrollView>
      {/* existing sections... */}

      {isUrlFirstCategory(category) && (
        <DigitalReportSection value={digital} onChange={setDigital} />
      )}

      {isInsider && (
        <InsiderReportSection value={insider} onChange={setInsider} />
      )}

      {reportSubject === 'commercial_property' && (
        <CommercialPropertySection value={commercial} onChange={setCommercial} />
      )}

      {geometryType === 'corridor' && (
        <CorridorReportSection
          value={corridor}
          onChange={setCorridor}
          onPickStart={() => openMapPicker('start')}
          onPickEnd={() => openMapPicker('end')}
        />
      )}

      {/* Submit button — assembles into a Report and calls reports.submit(...) */}
    </ScrollView>
  );
}
```

On submit, the parent screen:

1. Calls `captureSnapshot(digital.targetUrl)` if a digital section was filled — attaches result via `buildDigitalContext(...)`.
2. Attaches `buildInsiderContext(...)` if insider was filled.
3. Includes commercial context + validates the two attestation checkboxes are TRUE.
4. Attaches corridor / area geometry if geometryType is not point.
5. Constructs the final `Report` object and calls `reports.submit(...)`.

## Guardrails enforced in these components

- Commercial section refuses to let a user submit without both attestation checkboxes ticked (validation happens at the screen level; the section renders the required indicator).
- Insider section notice explicitly reminds the user of the out-of-scope categories.
- Digital section explains that a snapshot is captured on submit — no surprise data collection.

## Styling

Uses the shared `COLORS` / `SPACING` / `FONT_SIZES` / `BORDER_RADIUS` tokens from `src/constants/theme.ts`. Sections are fully self-styled — no external stylesheet dependencies.
