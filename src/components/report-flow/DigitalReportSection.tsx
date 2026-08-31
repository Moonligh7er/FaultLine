import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../../constants/theme';
import type { DigitalReportContext } from '../../types';

// ============================================================
// DigitalReportSection
//
// Composed into ReportScreen when the selected category is one of the
// URL-first categories (Access & Equity Group F). Provides input for:
//   - URL (required)
//   - assistive-tech identifier (optional)
//   - browser (optional)
//   - platform (optional)
//   - WCAG success criterion (optional)
//
// Snapshot capture is triggered on submit by the parent screen calling
// captureSnapshot(url) from src/services/digitalSnapshot.ts.
//
// See /digital-infrastructure for the design; DEFERRED #26 for the
// engineering flow.
// ============================================================

export interface DigitalReportSectionProps {
  value: Partial<DigitalReportContext>;
  onChange: (next: Partial<DigitalReportContext>) => void;
  disabled?: boolean;
}

export function DigitalReportSection({
  value,
  onChange,
  disabled = false,
}: DigitalReportSectionProps) {
  const update = <K extends keyof DigitalReportContext>(
    key: K,
    v: DigitalReportContext[K] | undefined,
  ) => {
    onChange({ ...value, [key]: v });
  };

  return (
    <View style={styles.container} accessibilityLabel="Digital infrastructure report details">
      <Text style={styles.sectionTitle}>Digital infrastructure details</Text>
      <Text style={styles.helperText}>
        A snapshot of the URL will be captured at submission so the failure can be
        evidenced later if the city remediates the page.
      </Text>

      <Field label="URL of the broken resource" required>
        <TextInput
          style={styles.input}
          value={value.targetUrl ?? ''}
          onChangeText={(t) => update('targetUrl', t)}
          placeholder="https://example-city.gov/permits/apply"
          placeholderTextColor={COLORS.textLight}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          editable={!disabled}
          accessibilityLabel="URL of the broken resource"
        />
      </Field>

      <Field label="Assistive technology in use (optional)">
        <TextInput
          style={styles.input}
          value={value.assistiveTech ?? ''}
          onChangeText={(t) => update('assistiveTech', t || undefined)}
          placeholder="NVDA, JAWS, VoiceOver, TalkBack…"
          placeholderTextColor={COLORS.textLight}
          autoCapitalize="none"
          editable={!disabled}
        />
      </Field>

      <View style={styles.row}>
        <View style={styles.rowItem}>
          <Field label="Browser (optional)">
            <TextInput
              style={styles.input}
              value={value.browser ?? ''}
              onChangeText={(t) => update('browser', t || undefined)}
              placeholder="Firefox, Chrome…"
              placeholderTextColor={COLORS.textLight}
              autoCapitalize="none"
              editable={!disabled}
            />
          </Field>
        </View>
        <View style={styles.rowItem}>
          <Field label="Platform (optional)">
            <TextInput
              style={styles.input}
              value={value.platform ?? ''}
              onChangeText={(t) => update('platform', t || undefined)}
              placeholder="macOS, Windows, iOS…"
              placeholderTextColor={COLORS.textLight}
              autoCapitalize="none"
              editable={!disabled}
            />
          </Field>
        </View>
      </View>

      <Field label="WCAG success criterion (optional)">
        <TextInput
          style={styles.input}
          value={value.wcagCriterion ?? ''}
          onChangeText={(t) => update('wcagCriterion', t || undefined)}
          placeholder="1.1.1, 2.1.2, 4.1.2…"
          placeholderTextColor={COLORS.textLight}
          autoCapitalize="none"
          editable={!disabled}
        />
        <Text style={styles.hint}>
          If you know the specific WCAG rule the failure violates, include it — it
          makes the generated demand letter stronger.
        </Text>
      </Field>
    </View>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label}
        {required && <Text style={styles.requiredMark}> *</Text>}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginVertical: SPACING.sm,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    marginBottom: SPACING.xs,
  },
  helperText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.sm,
    marginBottom: SPACING.md,
    lineHeight: 20,
  },
  field: {
    marginBottom: SPACING.md,
  },
  label: {
    color: COLORS.text,
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    marginBottom: SPACING.xs,
  },
  requiredMark: {
    color: COLORS.error,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.sm,
    color: COLORS.text,
    backgroundColor: COLORS.card,
    fontSize: FONT_SIZES.md,
  },
  row: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  rowItem: {
    flex: 1,
  },
  hint: {
    color: COLORS.textLight,
    fontSize: FONT_SIZES.xs,
    marginTop: SPACING.xs,
    lineHeight: 16,
  },
});
