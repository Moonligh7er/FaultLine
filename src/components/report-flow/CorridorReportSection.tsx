import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../../constants/theme';
import type { CorridorGeometry, ReportLocation } from '../../types';

// ============================================================
// CorridorReportSection
//
// Composed into ReportScreen when the reporter opts into corridor-mode
// reporting. Captures a linear street segment via start + end GPS
// coordinates and optional street identifiers.
//
// Two flows to populate the geometry:
//   1. Reporter drops two pins on the map (parent screen provides start/end
//      via onPickStart / onPickEnd callbacks; typically opens a map picker
//      overlay)
//   2. Reporter types street + cross-street identifiers manually
//
// See /corridor-reports for the design. Auto-suggested corridors come
// through a different path — src/services/corridorAggregation.ts.
// ============================================================

export interface CorridorReportSectionProps {
  value: Partial<CorridorGeometry>;
  onChange: (next: Partial<CorridorGeometry>) => void;
  onPickStart: () => void;
  onPickEnd: () => void;
  disabled?: boolean;
}

export function CorridorReportSection({
  value,
  onChange,
  onPickStart,
  onPickEnd,
  disabled = false,
}: CorridorReportSectionProps) {
  const update = <K extends keyof CorridorGeometry>(
    key: K,
    v: CorridorGeometry[K] | undefined,
  ) => {
    onChange({ ...value, [key]: v });
  };

  return (
    <View style={styles.container} accessibilityLabel="Corridor report details">
      <Text style={styles.sectionTitle}>Corridor report</Text>
      <Text style={styles.helperText}>
        Report a systemic pattern spanning a street segment — not just a single point.
        A corridor needs 5+ community-verified reports at 3+ distinct GPS points to
        escalate.
      </Text>

      <Field label="Street name" required>
        <TextInput
          style={styles.input}
          value={value.streetName ?? ''}
          onChangeText={(t) => update('streetName', t)}
          placeholder="e.g., Beacon Street"
          placeholderTextColor={COLORS.textLight}
          editable={!disabled}
        />
      </Field>

      <View style={styles.row}>
        <View style={styles.rowItem}>
          <Field label="From cross street (optional)">
            <TextInput
              style={styles.input}
              value={value.fromCrossStreet ?? ''}
              onChangeText={(t) => update('fromCrossStreet', t || undefined)}
              placeholder="e.g., 3rd Ave"
              placeholderTextColor={COLORS.textLight}
              editable={!disabled}
            />
          </Field>
        </View>
        <View style={styles.rowItem}>
          <Field label="To cross street (optional)">
            <TextInput
              style={styles.input}
              value={value.toCrossStreet ?? ''}
              onChangeText={(t) => update('toCrossStreet', t || undefined)}
              placeholder="e.g., 4th Ave"
              placeholderTextColor={COLORS.textLight}
              editable={!disabled}
            />
          </Field>
        </View>
      </View>

      <View style={styles.pinsRow}>
        <PinCell
          label="Start point"
          coord={value.start}
          onPick={onPickStart}
          disabled={disabled}
        />
        <PinCell
          label="End point"
          coord={value.end}
          onPick={onPickEnd}
          disabled={disabled}
        />
      </View>
    </View>
  );
}

function PinCell({
  label,
  coord,
  onPick,
  disabled,
}: {
  label: string;
  coord: { latitude: number; longitude: number } | undefined;
  onPick: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={styles.pinCell}
      onPress={onPick}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`Set ${label}`}
    >
      <Text style={styles.pinLabel}>{label}</Text>
      {coord ? (
        <Text style={styles.pinCoord}>
          {coord.latitude.toFixed(5)}, {coord.longitude.toFixed(5)}
        </Text>
      ) : (
        <Text style={styles.pinPlaceholder}>Tap to drop pin on map</Text>
      )}
    </TouchableOpacity>
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
  pinsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  pinCell: {
    flex: 1,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderStyle: 'dashed',
    borderRadius: BORDER_RADIUS.sm,
    backgroundColor: COLORS.card,
  },
  pinLabel: {
    color: COLORS.primary,
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    marginBottom: SPACING.xs,
  },
  pinCoord: {
    color: COLORS.text,
    fontSize: FONT_SIZES.sm,
    fontVariant: ['tabular-nums'],
  },
  pinPlaceholder: {
    color: COLORS.textLight,
    fontSize: FONT_SIZES.sm,
    fontStyle: 'italic',
  },
});
