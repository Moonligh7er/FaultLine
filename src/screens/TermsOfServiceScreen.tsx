import React from 'react';
import { ScrollView, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING, FONT_SIZES } from '../constants/theme';

export default function TermsOfServiceScreen() {
  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Terms of Service</Text>
      <Text style={styles.updated}>Last Updated: March 26, 2026</Text>

      <Text style={styles.heading}>1. Acceptance</Text>
      <Text style={styles.body}>
        By using Fault Line ("the App"), you agree to these terms. If you don't agree, don't use the App.
      </Text>

      <Text style={styles.heading}>2. What the App Does</Text>
      <Text style={styles.body}>
        Fault Line allows users to report infrastructure issues (potholes, broken streetlights, etc.) in their community. Reports are aggregated, verified by the community, and escalated to responsible government authorities when thresholds are met.
      </Text>

      <Text style={styles.heading}>3. User Responsibilities</Text>
      <Text style={styles.body}>
        • Accurate reporting: Submit truthful reports. Do not fabricate or exaggerate issues.{'\n'}
        • Appropriate content: Do not upload offensive, illegal, or irrelevant photos/descriptions.{'\n'}
        • No spam: Do not submit duplicate or frivolous reports to game the system.{'\n'}
        • No abuse: Do not harass other users, authorities, or misuse the platform.{'\n'}
        • Legal compliance: Follow all applicable local, state, and federal laws.
      </Text>

      <Text style={styles.heading}>4. Account</Text>
      <Text style={styles.body}>
        • You may use the App without an account (anonymous reporting).{'\n'}
        • If you create an account, you are responsible for maintaining its security.{'\n'}
        • We may suspend accounts that violate these terms.
      </Text>

      <Text style={styles.heading}>5. Content Rights</Text>
      <Text style={styles.body}>
        • You retain ownership of photos and descriptions you submit.{'\n'}
        • By submitting a report, you grant Fault Line a non-exclusive, royalty-free license to use, display, and transmit your report content for the purpose of operating the service (including sharing with government authorities).{'\n'}
        • We may display aggregated report data publicly (dashboards, heatmaps, statistics).
      </Text>

      <Text style={styles.heading}>6. Limitations</Text>
      <Text style={styles.body}>
        • No guarantees: We do not guarantee that any reported issue will be fixed, acknowledged, or responded to by any authority.{'\n'}
        • No emergency service: Fault Line is NOT a replacement for 911 or emergency services. For immediate danger, call emergency services.{'\n'}
        • Availability: We strive for uptime but do not guarantee uninterrupted service.{'\n'}
        • Accuracy: Location data and authority identification are best-effort. We are not liable for reports sent to incorrect authorities.
      </Text>

      <Text style={styles.heading}>7. Ads</Text>
      <Text style={styles.body}>
        The App displays banner advertisements to support free operation. Ad content is provided by third-party networks (Google AdMob) and does not constitute endorsement by Fault Line.
      </Text>

      <Text style={styles.heading}>8. Termination</Text>
      <Text style={styles.body}>
        We may suspend or terminate access for users who violate these terms, spam the system, or abuse the platform.
      </Text>

      <Text style={styles.heading}>9. Liability</Text>
      <Text style={styles.body}>
        Fault Line is provided "as is." We are not liable for any damages arising from use of the App, including but not limited to vehicle damage, personal injury, or property damage related to reported infrastructure issues.
      </Text>

      <Text style={styles.heading}>10. Changes</Text>
      <Text style={styles.body}>
        We may update these terms. Continued use after changes constitutes acceptance.
      </Text>

      <Text style={styles.heading}>11. Contact</Text>
      <Text style={[styles.body, { marginBottom: SPACING.xxl }]}>
        Questions about these terms: legal@faultline.app
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: SPACING.md },
  title: { fontSize: FONT_SIZES.title, fontWeight: '800', color: COLORS.text, marginBottom: SPACING.xs },
  updated: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, marginBottom: SPACING.lg },
  heading: { fontSize: FONT_SIZES.xl, fontWeight: '700', color: COLORS.text, marginTop: SPACING.lg, marginBottom: SPACING.sm },
  body: { fontSize: FONT_SIZES.md, color: COLORS.textSecondary, lineHeight: 24 },
});
