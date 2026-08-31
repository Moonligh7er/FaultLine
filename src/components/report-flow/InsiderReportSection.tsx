import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../../constants/theme';
import type { InsiderCategory, InsiderReportContext } from '../../types';

// ============================================================
// InsiderReportSection
//
// Composed into ReportScreen when the reporter marks themselves as a
// public employee filing an insider report. All fields are optional —
// the reporter can submit with just an insider_category.
//
// Scope is bounded per /whistleblower: infrastructure conditions only,
// never personnel / criminal / classified / retaliation. Out-of-scope
// categories surface a referral panel (see getAllReferrals() from
// src/services/insiderReports.ts).
// ============================================================

const INSIDER_CATEGORIES: Array<{ key: InsiderCategory; label: string }> = [
  { key: 'public_works', label: 'Public Works' },
  { key: 'facilities', label: 'Facilities' },
  { key: 'it', label: 'IT' },
  { key: 'transit', label: 'Transit' },
  { key: 'public_housing', label: 'Public Housing' },
  { key: 'schools', label: 'Schools' },
  { key: 'code_enforcement', label: 'Code Enforcement' },
  { key: 'other', label: 'Other' },
];

export interface InsiderReportSectionProps {
  value: Partial<InsiderReportContext>;
  onChange: (next: Partial<InsiderReportContext>) => void;
  disabled?: boolean;
}

export function InsiderReportSection({
  value,
  onChange,
  disabled = false,
}: InsiderReportSectionProps) {
  const update = <K extends keyof InsiderReportContext>(
    key: K,
    v: InsiderReportContext[K] | undefined,
  ) => {
    onChange({ ...value, [key]: v });
  };

  return (
    <View style={styles.container} accessibilityLabel="Insider report context">
      <Text style={styles.sectionTitle}>Public-employee insider details</Text>

      <View style={styles.notice}>
        <Text style={styles.noticeText}>
          Fault Line is not a specialized whistleblower channel. Scope is bounded to
          infrastructure conditions only. Personnel grievances, criminal misconduct,
          classified information, and retaliation claims go through different channels
          — the reporting flow will surface referrals if you select an out-of-scope
          category above.
        </Text>
      </View>

      <Field label="Which functional area gives you visibility?" required>
        <View style={styles.chipRow}>
          {INSIDER_CATEGORIES.map((cat) => {
            const selected = value.insiderCategory === cat.key;
            return (
              <TouchableOpacity
                key={cat.key}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() => update('insiderCategory', cat.key)}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
                  {cat.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Field>

      <Field label="How long has this condition been observed? (optional)">
        <TextInput
          style={styles.input}
          value={
            value.observedDurationDays === undefined
              ? ''
              : String(value.observedDurationDays)
          }
          onChangeText={(t) => {
            const n = parseInt(t, 10);
            update('observedDurationDays', Number.isFinite(n) ? n : undefined);
          }}
          placeholder="Number of days (e.g., 540)"
          placeholderTextColor={COLORS.textLight}
          keyboardType="number-pad"
          editable={!disabled}
        />
        <Text style={styles.hint}>
          "This has been in the deferred-maintenance list for 18 months" is context a
          resident cannot provide.
        </Text>
      </Field>

      <Field label="Prior internal report reference (optional)">
        <TextInput
          style={styles.input}
          value={value.priorInternalReportRef ?? ''}
          onChangeText={(t) => update('priorInternalReportRef', t || undefined)}
          placeholder='e.g., "Reported via internal ticket 2024-03-15, no response"'
          placeholderTextColor={COLORS.textLight}
          editable={!disabled}
          multiline
        />
      </Field>

      <Field label="Documentary reference (optional)">
        <TextInput
          style={styles.input}
          value={value.documentaryReference ?? ''}
          onChangeText={(t) => update('documentaryReference', t || undefined)}
          placeholder='e.g., "Work order #12345" — do NOT paste privileged documents'
          placeholderTextColor={COLORS.textLight}
          editable={!disabled}
        />
        <Text style={styles.hint}>
          A knowledgeable recipient can look this up on their side. Do not send
          confidential materials — describe the underlying infrastructure condition
          only.
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
    marginBottom: SPACING.sm,
  },
  notice: {
    backgroundColor: COLORS.card,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.warning,
    padding: SPACING.sm,
    marginBottom: SPACING.md,
    borderRadius: BORDER_RADIUS.sm,
  },
  noticeText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.xs,
    lineHeight: 18,
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
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
  chip: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.round,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  chipSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chipLabel: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
  },
  chipLabelSelected: {
    color: COLORS.textOnPrimary,
  },
  hint: {
    color: COLORS.textLight,
    fontSize: FONT_SIZES.xs,
    marginTop: SPACING.xs,
    lineHeight: 16,
  },
});
