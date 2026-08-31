import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../../constants/theme';
import type { CommercialPropertyContext } from '../../types';

// ============================================================
// CommercialPropertySection
//
// Composed into ReportScreen when the reporter marks the subject as
// commercial property. Enforces the /business-property guardrails in the
// UI itself:
//   - Business name + address REQUIRED
//   - Public-view attestation REQUIRED
//   - Reporter factual-observation attestation REQUIRED
//   - Chain identifier optional (looked up on submit against
//     src/services/commercial/chains.ts)
//
// Individual submissions never publish. The aggregation pipeline in
// src/services/commercial/aggregation.ts computes readiness; publication
// runs through the right-of-reply pipeline.
// ============================================================

export interface CommercialPropertySectionProps {
  value: Partial<CommercialPropertyContext>;
  onChange: (next: Partial<CommercialPropertyContext>) => void;
  disabled?: boolean;
}

export function CommercialPropertySection({
  value,
  onChange,
  disabled = false,
}: CommercialPropertySectionProps) {
  const update = <K extends keyof CommercialPropertyContext>(
    key: K,
    v: CommercialPropertyContext[K] | undefined,
  ) => {
    onChange({ ...value, [key]: v });
  };

  return (
    <View style={styles.container} accessibilityLabel="Commercial property report details">
      <Text style={styles.sectionTitle}>Commercial property details</Text>

      <View style={styles.notice}>
        <Text style={styles.noticeText}>
          Commercial reports are held privately until aggregation thresholds are met.
          Individual reports never publish. The property owner receives a 14-day
          right-of-reply notification before any public attribution. See our{' '}
          <Text style={styles.noticeLink}>guardrail commitments</Text> for the full
          model.
        </Text>
      </View>

      <Field label="Business name" required>
        <TextInput
          style={styles.input}
          value={value.businessName ?? ''}
          onChangeText={(t) => update('businessName', t)}
          placeholder="e.g., Riverdale Retail Center"
          placeholderTextColor={COLORS.textLight}
          editable={!disabled}
        />
      </Field>

      <Field label="Full business address" required>
        <TextInput
          style={styles.input}
          value={value.businessAddressFull ?? ''}
          onChangeText={(t) => update('businessAddressFull', t)}
          placeholder="123 Main St, City, State ZIP"
          placeholderTextColor={COLORS.textLight}
          editable={!disabled}
          multiline
        />
      </Field>

      <Field label="Chain identifier (optional)">
        <TextInput
          style={styles.input}
          value={value.chainIdentifier ?? ''}
          onChangeText={(t) => update('chainIdentifier', t || undefined)}
          placeholder='e.g., "cvs", "target", "mcdonalds"'
          placeholderTextColor={COLORS.textLight}
          autoCapitalize="none"
          editable={!disabled}
        />
        <Text style={styles.hint}>
          If the business is a chain / franchise, adding the brand identifier lets
          Fault Line aggregate patterns across locations.
        </Text>
      </Field>

      <AttestationRow
        label="I observed this condition from public view (sidewalk, parking lot, storefront) — not from a back-of-house or employee-only area."
        checked={value.publicViewConfirmed === true}
        onToggle={(v) => update('publicViewConfirmed', v)}
        disabled={disabled}
        required
      />

      <AttestationRow
        label="This report is a factual observation of a physical condition — not a service complaint, competitive attack, or subjective review. I understand knowingly false reports may create anti-SLAPP counterclaim exposure."
        checked={value.reporterAttestation === true}
        onToggle={(v) => update('reporterAttestation', v)}
        disabled={disabled}
        required
      />
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

function AttestationRow({
  label,
  checked,
  onToggle,
  disabled,
  required,
}: {
  label: string;
  checked: boolean;
  onToggle: (v: boolean) => void;
  disabled?: boolean;
  required?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.attestRow, checked && styles.attestRowChecked]}
      onPress={() => onToggle(!checked)}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
    >
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked && <Text style={styles.checkmark}>✓</Text>}
      </View>
      <Text style={styles.attestLabel}>
        {label}
        {required && <Text style={styles.requiredMark}> *</Text>}
      </Text>
    </TouchableOpacity>
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
    borderLeftColor: COLORS.primary,
    padding: SPACING.sm,
    marginBottom: SPACING.md,
    borderRadius: BORDER_RADIUS.sm,
  },
  noticeText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.xs,
    lineHeight: 18,
  },
  noticeLink: {
    color: COLORS.primary,
    fontWeight: '700',
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
  hint: {
    color: COLORS.textLight,
    fontSize: FONT_SIZES.xs,
    marginTop: SPACING.xs,
    lineHeight: 16,
  },
  attestRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    padding: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.sm,
    backgroundColor: COLORS.card,
  },
  attestRowChecked: {
    borderColor: COLORS.success,
  },
  attestLabel: {
    flex: 1,
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.sm,
    lineHeight: 20,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.sm,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.card,
  },
  checkboxChecked: {
    borderColor: COLORS.success,
    backgroundColor: COLORS.success,
  },
  checkmark: {
    color: COLORS.textOnPrimary,
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
  },
});
