import React, { useRef } from 'react';
import { Animated, PanResponder, View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import { Report } from '../types';
import ReportCard from './ReportCard';
import Icon from './Icon';
import * as Haptics from 'expo-haptics';

const SWIPE_THRESHOLD = 80;

interface Props {
  report: Report;
  onPress: () => void;
  onUpvote?: () => void;
  onShare?: () => void;
}

export default function SwipeableReportCard({ report, onPress, onUpvote, onShare }: Props) {
  const translateX = useRef(new Animated.Value(0)).current;
  const isSwipingRef = useRef(false);

  const panResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderMove: (_, g) => {
      translateX.setValue(Math.max(-120, Math.min(120, g.dx)));
      if (Math.abs(g.dx) > SWIPE_THRESHOLD && !isSwipingRef.current) {
        isSwipingRef.current = true;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    },
    onPanResponderRelease: (_, g) => {
      if (g.dx > SWIPE_THRESHOLD && onUpvote) {
        onUpvote();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else if (g.dx < -SWIPE_THRESHOLD && onShare) {
        onShare();
      }
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true, speed: 20 }).start();
      isSwipingRef.current = false;
    },
  });

  const upvoteOpacity = translateX.interpolate({ inputRange: [0, SWIPE_THRESHOLD], outputRange: [0, 1], extrapolate: 'clamp' });
  const shareOpacity = translateX.interpolate({ inputRange: [-SWIPE_THRESHOLD, 0], outputRange: [1, 0], extrapolate: 'clamp' });

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.action, styles.left, { opacity: upvoteOpacity }]}>
        <Icon name="thumb-up" size={24} color="#fff" />
        <Text style={styles.actionText}>Upvote</Text>
      </Animated.View>
      <Animated.View style={[styles.action, styles.right, { opacity: shareOpacity }]}>
        <Icon name="share-variant" size={24} color="#fff" />
        <Text style={styles.actionText}>Share</Text>
      </Animated.View>
      <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
        <ReportCard report={report} onPress={onPress} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'relative' },
  action: { position: 'absolute', top: 0, bottom: SPACING.sm, justifyContent: 'center', alignItems: 'center', width: 100, borderRadius: BORDER_RADIUS.lg, paddingHorizontal: SPACING.md },
  left: { left: 0, backgroundColor: COLORS.primary },
  right: { right: 0, backgroundColor: COLORS.secondary },
  actionText: { color: '#fff', fontSize: FONT_SIZES.xs, fontWeight: '700', marginTop: 4 },
});
