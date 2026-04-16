import React, { useState } from 'react';
import { Image, View, ActivityIndicator, StyleSheet, ImageStyle } from 'react-native';
import { COLORS, BORDER_RADIUS } from '../constants/theme';

interface LazyImageProps {
  uri?: string | null;
  style?: ImageStyle;
  fallbackIcon?: React.ReactNode;
}

export default function LazyImage({ uri, style, fallbackIcon }: LazyImageProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  if (!uri || error) {
    return (
      <View style={[styles.placeholder, style]}>
        {fallbackIcon || <ActivityIndicator size="small" color={COLORS.textLight} />}
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      {loading && (
        <View style={[styles.loader, style]}>
          <ActivityIndicator size="small" color={COLORS.textLight} />
        </View>
      )}
      <Image
        source={{ uri }}
        style={[styles.image, style, loading && styles.hidden]}
        onLoad={() => setLoading(false)}
        onError={() => { setError(true); setLoading(false); }}
        resizeMode="cover"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
  hidden: { opacity: 0, position: 'absolute' },
  placeholder: { backgroundColor: COLORS.divider, borderRadius: BORDER_RADIUS.md, justifyContent: 'center', alignItems: 'center' },
  loader: { backgroundColor: COLORS.divider, borderRadius: BORDER_RADIUS.md, justifyContent: 'center', alignItems: 'center', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
});
