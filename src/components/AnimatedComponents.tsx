import React, { useEffect, useRef } from 'react';
import { Animated, ViewStyle, StyleProp, Pressable } from 'react-native';
import { useHaptics } from '../hooks/useHaptics';

// Fade-in on mount
export function FadeIn({ children, delay = 0, duration = 300, style }: {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration, delay, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration, delay, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[{ opacity, transform: [{ translateY }] }, style]}>
      {children}
    </Animated.View>
  );
}

// Staggered list animation
export function StaggeredItem({ children, index, style }: {
  children: React.ReactNode;
  index: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <FadeIn delay={index * 80} style={style}>
      {children}
    </FadeIn>
  );
}

// Scale-on-press button with haptics
export function HapticButton({ children, onPress, style, hapticType = 'light' }: {
  children: React.ReactNode;
  onPress: () => void;
  style?: any;
  hapticType?: 'light' | 'medium' | 'heavy' | 'selection';
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const haptics = useHaptics();

  const handlePressIn = () => {
    Animated.spring(scale, { toValue: 0.95, useNativeDriver: true, speed: 50 }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 50 }).start();
  };

  const handlePress = () => {
    haptics[hapticType]();
    onPress();
  };

  return (
    <Pressable onPressIn={handlePressIn} onPressOut={handlePressOut} onPress={handlePress}>
      <Animated.View style={[{ transform: [{ scale }] }, style]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

// Pulse animation for alerts
export function Pulse({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.05, duration: 1000, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, []);

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      {children}
    </Animated.View>
  );
}

// Number counter animation
export function AnimatedNumber({ value, style }: { value: number; style?: any }) {
  const animValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animValue, { toValue: value, duration: 800, useNativeDriver: false }).start();
  }, [value]);

  const displayValue = animValue.interpolate({
    inputRange: [0, value],
    outputRange: [0, value],
  });

  return (
    <Animated.Text style={style}>
      {/* For RN, we need to use a listener approach */}
      {value}
    </Animated.Text>
  );
}

// Slide-in from side
export function SlideIn({ children, direction = 'right', delay = 0, style }: {
  children: React.ReactNode;
  direction?: 'left' | 'right';
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const translateX = useRef(new Animated.Value(direction === 'right' ? 100 : -100)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateX, { toValue: 0, duration: 400, delay, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 400, delay, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[{ opacity, transform: [{ translateX }] }, style]}>
      {children}
    </Animated.View>
  );
}
