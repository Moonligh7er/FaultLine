import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  FlatList,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import { RootStackParamList } from '../types';
import Icon from '../components/Icon';

const { width } = Dimensions.get('window');

const ONBOARDING_KEY = 'onboarding_complete';

interface OnboardingSlide {
  id: string;
  icon: string;
  title: string;
  description: string;
  color: string;
}

const slides: OnboardingSlide[] = [
  {
    id: '1',
    icon: 'map-marker-alert',
    title: 'Spot an Issue?',
    description: 'See a pothole, broken streetlight, or any infrastructure problem? Report it in seconds with a photo and GPS location.',
    color: COLORS.primary,
  },
  {
    id: '2',
    icon: 'account-group',
    title: 'Community Verified',
    description: 'When 3 people report the same issue, it becomes community-verified. More reports = faster action from authorities.',
    color: COLORS.secondary,
  },
  {
    id: '3',
    icon: 'email-fast',
    title: 'Auto-Escalated',
    description: 'After 10+ reports over 30 days, we automatically email the responsible authority with a professional report. Your tax dollars at work!',
    color: COLORS.accent,
  },
  {
    id: '4',
    icon: 'chart-line',
    title: 'Track Progress',
    description: 'See response times, fix rates, and authority leaderboards. Hold your government accountable with real data.',
    color: '#9C27B0',
  },
];

type OnboardingNav = NativeStackNavigationProp<RootStackParamList>;

export default function OnboardingScreen() {
  const navigation = useNavigation<OnboardingNav>();
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const handleComplete = async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
  };

  const handleNext = () => {
    if (currentIndex < slides.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
      setCurrentIndex(currentIndex + 1);
    } else {
      handleComplete();
    }
  };

  const renderSlide = ({ item }: { item: OnboardingSlide }) => (
    <View style={[styles.slide, { width }]}>
      <View style={[styles.iconCircle, { backgroundColor: item.color + '20' }]}>
        <Icon name={item.icon} size={64} color={item.color} />
      </View>
      <Text style={styles.title}>{item.title}</Text>
      <Text style={styles.description}>{item.description}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={slides}
        renderItem={renderSlide}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        onMomentumScrollEnd={(e) => {
          const index = Math.round(e.nativeEvent.contentOffset.x / width);
          setCurrentIndex(index);
        }}
      />

      {/* Dots */}
      <View style={styles.dots}>
        {slides.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, i === currentIndex && styles.dotActive]}
          />
        ))}
      </View>

      {/* Buttons */}
      <View style={styles.buttons}>
        {currentIndex < slides.length - 1 && (
          <TouchableOpacity onPress={handleComplete}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
          <Text style={styles.nextButtonText}>
            {currentIndex === slides.length - 1 ? "Let's Go!" : 'Next'}
          </Text>
          {currentIndex < slides.length - 1 && (
            <Icon name="arrow-right" size={18} color={COLORS.textOnPrimary} />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

export async function shouldShowOnboarding(): Promise<boolean> {
  const value = await AsyncStorage.getItem(ONBOARDING_KEY);
  return value !== 'true';
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  slide: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACING.xl },
  iconCircle: {
    width: 140, height: 140, borderRadius: 70,
    justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.xl,
  },
  title: { fontSize: FONT_SIZES.title, fontWeight: '800', color: COLORS.text, textAlign: 'center', marginBottom: SPACING.md },
  description: { fontSize: FONT_SIZES.lg, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 26, paddingHorizontal: SPACING.lg },
  dots: { flexDirection: 'row', justifyContent: 'center', marginBottom: SPACING.lg },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.border, marginHorizontal: 4 },
  dotActive: { backgroundColor: COLORS.primary, width: 24 },
  buttons: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: SPACING.xl, paddingBottom: SPACING.xxl,
  },
  skipText: { fontSize: FONT_SIZES.lg, color: COLORS.textSecondary, fontWeight: '500' },
  nextButton: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.primary, paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.round, marginLeft: 'auto',
  },
  nextButtonText: { fontSize: FONT_SIZES.lg, color: COLORS.textOnPrimary, fontWeight: '700' },
});
