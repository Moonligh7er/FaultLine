import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, ViewStyle } from 'react-native';
import { COLORS, BORDER_RADIUS } from '../constants/theme';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export default function SkeletonLoader({
  width = '100%',
  height = 16,
  borderRadius = BORDER_RADIUS.md,
  style,
}: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, []);

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: COLORS.border,
          opacity,
        },
        style,
      ]}
    />
  );
}

export function ReportCardSkeleton() {
  return (
    <View style={skeletonStyles.card}>
      <View style={skeletonStyles.header}>
        <SkeletonLoader width={40} height={40} borderRadius={20} />
        <View style={skeletonStyles.headerText}>
          <SkeletonLoader width={120} height={16} />
          <SkeletonLoader width={180} height={12} style={{ marginTop: 6 }} />
        </View>
        <SkeletonLoader width={70} height={20} borderRadius={10} />
      </View>
      <SkeletonLoader width="90%" height={12} style={{ marginTop: 12 }} />
      <SkeletonLoader width="60%" height={12} style={{ marginTop: 6 }} />
    </View>
  );
}

const skeletonStyles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: 16,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerText: {
    flex: 1,
    marginLeft: 8,
  },
});
