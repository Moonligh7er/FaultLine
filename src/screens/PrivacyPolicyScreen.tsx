import React from 'react';
import { ScrollView, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING, FONT_SIZES } from '../constants/theme';

export default function PrivacyPolicyScreen() {
  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Privacy Policy</Text>
      <Text style={styles.updated}>Last Updated: March 26, 2026</Text>

      <Text style={styles.body}>
        Fault Line ("the App") is a community infrastructure reporting platform. This policy explains what data we collect, why, and how we protect it.
      </Text>

      <Text style={styles.heading}>1. Data We Collect</Text>

      <Text style={styles.subheading}>Information You Provide</Text>
      <Text style={styles.body}>
        • Account information: Email address (if you create an account). You may also report anonymously.{'\n'}
        • Reports: Category, description, severity ratings, and photos/videos you attach to infrastructure reports.{'\n'}
        • Votes: Upvotes and confirmations on community reports.
      </Text>

      <Text style={styles.subheading}>Information Collected Automatically</Text>
      <Text style={styles.body}>
        • Location: GPS coordinates when you submit a report. This is essential to pinpoint the infrastructure issue. We only access your location when you actively use the reporting feature.{'\n'}
        • Device sensors: Accelerometer data to detect potential road impacts. This data is processed on-device only and never transmitted to our servers.{'\n'}
        • Device information: Device model, operating system version, and app version for crash reporting and compatibility.
      </Text>

      <Text style={styles.subheading}>Information We Do NOT Collect</Text>
      <Text style={styles.body}>
        • We do not track your location in the background.{'\n'}
        • We do not sell your personal data to third parties.{'\n'}
        • We do not collect contacts, browsing history, or data from other apps.
      </Text>

      <Text style={styles.heading}>2. How We Use Your Data</Text>
      <Text style={styles.body}>
        • Infrastructure reports: To document issues, identify responsible authorities, and escalate confirmed problems to government agencies.{'\n'}
        • Community verification: To aggregate reports from multiple users to confirm infrastructure issues.{'\n'}
        • Authority escalation: When enough community members report the same issue, we send a professional report to the responsible authority. This report includes location, category, severity, report count, and anonymized descriptions. It does NOT include your name, email, or personal information.{'\n'}
        • Crash reporting: To identify and fix bugs (via Sentry). Crash reports are anonymized.{'\n'}
        • Ads: We display banner advertisements via Google AdMob. We do not serve personalized ads by default.
      </Text>

      <Text style={styles.heading}>3. Data Sharing</Text>
      <Text style={styles.body}>
        We share data only in these circumstances:{'\n\n'}
        • Government authorities: Aggregated, anonymized report data when escalating confirmed infrastructure issues.{'\n'}
        • Crash reporting: Anonymized crash data with Sentry for bug fixes.{'\n'}
        • Ad networks: Google AdMob receives standard ad request data. We do not share personal information with ad networks.{'\n'}
        • Legal: If required by law or to protect safety.{'\n\n'}
        We never sell your personal data.
      </Text>

      <Text style={styles.heading}>4. Data Storage & Security</Text>
      <Text style={styles.body}>
        • Data is stored on Supabase (hosted on AWS) with encryption at rest and in transit.{'\n'}
        • Photos are stored in Supabase Storage with access controls.{'\n'}
        • Passwords are never stored — we use magic link authentication.{'\n'}
        • Row Level Security ensures users can only modify their own data.
      </Text>

      <Text style={styles.heading}>5. Your Rights</Text>
      <Text style={styles.body}>
        • Access: View all your reports and profile data in the app.{'\n'}
        • Delete: Request deletion of your account and all associated data by emailing privacy@faultline.app.{'\n'}
        • Anonymous reporting: You can submit reports without creating an account.{'\n'}
        • Opt-out of tracking: Deny the iOS tracking prompt to prevent personalized ads.
      </Text>

      <Text style={styles.heading}>6. Children's Privacy</Text>
      <Text style={styles.body}>
        Fault Line is not directed at children under 13. We do not knowingly collect data from children.
      </Text>

      <Text style={styles.heading}>7. Changes</Text>
      <Text style={styles.body}>
        We may update this policy. Changes will be posted in the app and on our website.
      </Text>

      <Text style={styles.heading}>8. Contact</Text>
      <Text style={[styles.body, { marginBottom: SPACING.xxl }]}>
        For privacy questions or data deletion requests:{'\n'}
        Email: privacy@faultline.app
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: SPACING.md },
  title: { fontSize: FONT_SIZES.title, fontWeight: '800', color: COLORS.text, marginBottom: SPACING.xs },
  updated: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, marginBottom: SPACING.lg },
  heading: { fontSize: FONT_SIZES.xl, fontWeight: '700', color: COLORS.text, marginTop: SPACING.lg, marginBottom: SPACING.sm },
  subheading: { fontSize: FONT_SIZES.lg, fontWeight: '600', color: COLORS.text, marginTop: SPACING.sm, marginBottom: SPACING.xs },
  body: { fontSize: FONT_SIZES.md, color: COLORS.textSecondary, lineHeight: 24 },
});
