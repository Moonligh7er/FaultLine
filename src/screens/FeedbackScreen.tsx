import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import { HapticButton, FadeIn, Pulse } from '../components/AnimatedComponents';
import Icon from '../components/Icon';

const FORMSPREE_ENDPOINT = 'https://formspree.io/f/mlgojojg';

type Tab = 'feedback' | 'feature' | 'bug';

const TAB_META: Record<Tab, { label: string; icon: string; subjectLabel: string; messageLabel: string; placeholder: string }> = {
  feedback: {
    label: '💬 Feedback',
    icon: 'message-text-outline',
    subjectLabel: 'Subject',
    messageLabel: 'Message',
    placeholder: 'Tell us what you think — what works, what does not, what could be better.',
  },
  feature: {
    label: '💡 Feature',
    icon: 'lightbulb-on-outline',
    subjectLabel: 'Feature title',
    messageLabel: 'Description',
    placeholder: 'Describe the feature, why it matters, and how you would use it.',
  },
  bug: {
    label: '🐛 Bug',
    icon: 'bug-outline',
    subjectLabel: 'Bug summary',
    messageLabel: 'Steps to reproduce',
    placeholder: '1. Open the app\n2. Tap Report\n3. Take a photo\n4. App crashes',
  },
};

export default function FeedbackScreen() {
  const [tab, setTab] = useState<Tab>('feedback');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit() {
    if (!subject.trim() || !message.trim()) {
      Alert.alert('Required', 'Subject and message are required.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(FORMSPREE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          _subject: `[Fault Line ${tab}] ${subject}`,
          source: 'mobile-app',
          type: tab,
          name: name || '(anonymous)',
          email: email || '',
          subject,
          message,
        }),
      });
      if (res.ok) {
        setSent(true);
      } else {
        Alert.alert('Submission failed', 'Please try again in a moment.');
      }
    } catch {
      Alert.alert('Network error', 'Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setSent(false);
    setSubject('');
    setMessage('');
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: SPACING.xxl }}>
      <FadeIn style={styles.header}>
        <View style={styles.activeDevPill}>
          <Pulse style={styles.activeDevDot} />
          <Text style={styles.activeDevText}>Active Development</Text>
        </View>
        <Text style={styles.title}>Help Shape Fault Line</Text>
        <Text style={styles.subtitle}>
          We&apos;re actively building this app. Your feedback directly influences what we build next.
        </Text>
      </FadeIn>

      {sent ? (
        <View style={styles.successCard}>
          <Icon name="check-circle-outline" size={48} color={'#00C853'} />
          <Text style={styles.successTitle}>
            {tab === 'feature' ? 'Feature request received!' : tab === 'bug' ? 'Bug report filed!' : 'Thank you!'}
          </Text>
          <Text style={styles.successMessage}>
            We&apos;ve got it. A real human reads every submission. Popular requests get built first.
          </Text>
          <HapticButton style={styles.resetButton} onPress={reset} hapticType="light">
            <Text style={styles.resetButtonText}>Submit another</Text>
          </HapticButton>
        </View>
      ) : (
        <>
          <View style={styles.tabRow}>
            {(Object.keys(TAB_META) as Tab[]).map((t) => (
              <HapticButton
                key={t}
                style={[styles.tab, tab === t && styles.tabActive]}
                onPress={() => setTab(t)}
                hapticType="selection"
              >
                <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                  {TAB_META[t].label}
                </Text>
              </HapticButton>
            ))}
          </View>

          <View style={styles.formCard}>
            <Text style={styles.fieldLabel}>Name (optional)</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor={COLORS.textLight}
              maxLength={80}
            />
            <Text style={styles.fieldLabel}>Email (optional — for follow-up)</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@email.com"
              placeholderTextColor={COLORS.textLight}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={254}
            />
            <Text style={styles.fieldLabel}>{TAB_META[tab].subjectLabel} *</Text>
            <TextInput
              style={styles.input}
              value={subject}
              onChangeText={setSubject}
              placeholder="Required"
              placeholderTextColor={COLORS.textLight}
              maxLength={120}
            />
            <Text style={styles.fieldLabel}>{TAB_META[tab].messageLabel} *</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={message}
              onChangeText={setMessage}
              placeholder={TAB_META[tab].placeholder}
              placeholderTextColor={COLORS.textLight}
              multiline
              textAlignVertical="top"
              maxLength={4000}
            />
            <HapticButton
              style={[styles.submitButton, submitting && { opacity: 0.6 }]}
              onPress={handleSubmit}
              hapticType="medium"
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color={COLORS.textOnPrimary} />
              ) : (
                <Text style={styles.submitButtonText}>Submit</Text>
              )}
            </HapticButton>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { padding: SPACING.lg, alignItems: 'center' },
  activeDevPill: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.xs,
    backgroundColor: 'rgba(0,200,83,0.08)',
    borderWidth: 1, borderColor: 'rgba(0,200,83,0.25)',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.round, marginBottom: SPACING.md,
  },
  activeDevDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#00C853' },
  activeDevText: { fontSize: FONT_SIZES.xs, fontWeight: '700', color: '#00C853', textTransform: 'uppercase', letterSpacing: 1 },
  title: { fontSize: FONT_SIZES.xxl, fontWeight: '800', color: COLORS.text, textAlign: 'center', marginBottom: SPACING.xs },
  subtitle: { fontSize: FONT_SIZES.md, color: COLORS.textSecondary, textAlign: 'center', maxWidth: 360 },
  tabRow: { flexDirection: 'row', gap: SPACING.xs, paddingHorizontal: SPACING.md, marginBottom: SPACING.md },
  tab: {
    flex: 1, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.xs,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.round, alignItems: 'center',
  },
  tabActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  tabText: { fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.textSecondary },
  tabTextActive: { color: COLORS.textOnPrimary },
  formCard: {
    margin: SPACING.md, padding: SPACING.lg,
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border,
  },
  fieldLabel: { fontSize: FONT_SIZES.sm, fontWeight: '600', color: COLORS.textSecondary, marginBottom: SPACING.xs, marginTop: SPACING.sm },
  input: {
    backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.md, padding: SPACING.md,
    fontSize: FONT_SIZES.md, color: COLORS.text,
  },
  textArea: { minHeight: 120 },
  submitButton: {
    marginTop: SPACING.lg, backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.md, alignItems: 'center',
  },
  submitButtonText: { color: COLORS.textOnPrimary, fontSize: FONT_SIZES.lg, fontWeight: '700' },
  successCard: {
    margin: SPACING.md, padding: SPACING.xl, alignItems: 'center',
    backgroundColor: 'rgba(0,200,83,0.06)',
    borderWidth: 1, borderColor: 'rgba(0,200,83,0.25)',
    borderRadius: BORDER_RADIUS.lg, gap: SPACING.sm,
  },
  successTitle: { fontSize: FONT_SIZES.xl, fontWeight: '800', color: COLORS.text, textAlign: 'center', marginTop: SPACING.sm },
  successMessage: { fontSize: FONT_SIZES.md, color: COLORS.textSecondary, textAlign: 'center' },
  resetButton: { marginTop: SPACING.md, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.round, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  resetButtonText: { color: COLORS.text, fontWeight: '600' },
});
