import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

// Deep-purple "BETA" tag shown after the app name wherever it is a title.
// `size` is the badge's font size; pick roughly 40% of the title it follows.
export default function BetaBadge({ size = 11 }: { size?: number }) {
  return (
    <View
      style={[styles.badge, { paddingHorizontal: size * 0.6, paddingVertical: size * 0.28, borderRadius: size * 0.55, marginLeft: size * 0.7 }]}
      accessible
      accessibilityLabel="Beta"
    >
      <Text style={[styles.text, { fontSize: size, letterSpacing: size * 0.12 }]}>BETA</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: '#5B21B6',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignSelf: 'center',
  },
  text: { color: '#FFFFFF', fontWeight: '800', includeFontPadding: false },
});
