import { AccessibilityInfo, Dimensions, PixelRatio, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ============================================================
// Accessibility Service
// Dynamic text sizing, high contrast, screen reader support
// ============================================================

const A11Y_PREFS_KEY = 'accessibility_prefs';

export interface AccessibilityPrefs {
  textScale: number; // 1.0 = normal, 1.5 = 150%
  highContrast: boolean;
  reduceMotion: boolean;
  largeButtons: boolean;
}

const DEFAULT_PREFS: AccessibilityPrefs = {
  textScale: 1.0,
  highContrast: false,
  reduceMotion: false,
  largeButtons: false,
};

export async function loadAccessibilityPrefs(): Promise<AccessibilityPrefs> {
  const raw = await AsyncStorage.getItem(A11Y_PREFS_KEY);
  const saved = raw ? JSON.parse(raw) : {};

  // Detect system preferences
  const isReduceMotion = await AccessibilityInfo.isReduceMotionEnabled();
  const isScreenReader = await AccessibilityInfo.isScreenReaderEnabled();

  return {
    ...DEFAULT_PREFS,
    ...saved,
    reduceMotion: saved.reduceMotion ?? isReduceMotion,
    largeButtons: saved.largeButtons ?? isScreenReader,
  };
}

export async function saveAccessibilityPrefs(prefs: AccessibilityPrefs): Promise<void> {
  await AsyncStorage.setItem(A11Y_PREFS_KEY, JSON.stringify(prefs));
}

// Scale font size based on user preference + system settings
export function scaledFontSize(baseSize: number, textScale: number): number {
  const systemScale = PixelRatio.getFontScale();
  return Math.round(baseSize * textScale * systemScale);
}

// High contrast colors
export const HIGH_CONTRAST_COLORS = {
  primary: '#0056D2',
  background: '#000000',
  surface: '#1A1A1A',
  text: '#FFFFFF',
  textSecondary: '#CCCCCC',
  border: '#FFFFFF',
  error: '#FF4444',
  success: '#00CC44',
  warning: '#FFBB00',
};

// Accessibility labels for common icons
export const A11Y_LABELS = {
  reportButton: 'Create new infrastructure report',
  quickReportButton: 'Quick report mode, faster submission',
  voiceButton: 'Start voice command for hands-free reporting',
  upvoteButton: 'Upvote this report to increase its priority',
  confirmButton: 'Confirm you have also seen this issue',
  shareButton: 'Share this report with others',
  cameraButton: 'Take a photo of the infrastructure issue',
  galleryButton: 'Choose photos from your gallery',
  mapPin: 'Drag to adjust the exact location of the issue',
  arButton: 'Open augmented reality view to see nearby reports',
};

// Screen reader announcement helper
export function announce(message: string) {
  AccessibilityInfo.announceForAccessibility(message);
}
