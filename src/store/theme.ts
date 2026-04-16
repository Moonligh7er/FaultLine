import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'light' | 'dark' | 'system';

const DARK_COLORS = {
  primary: '#64B5F6',
  primaryDark: '#1E88E5',
  primaryLight: '#90CAF9',
  secondary: '#FFA040',
  secondaryLight: '#FFB74D',
  accent: '#69F0AE',

  background: '#121212',
  surface: '#1E1E1E',
  surfaceElevated: '#2C2C2C',
  card: '#1E1E1E',

  text: '#E0E0E0',
  textSecondary: '#9E9E9E',
  textLight: '#616161',
  textOnPrimary: '#000000',

  border: '#333333',
  divider: '#2C2C2C',

  success: '#66BB6A',
  warning: '#FFA726',
  error: '#EF5350',
  info: '#42A5F5',

  statusDraft: '#757575',
  statusSubmitted: '#42A5F5',
  statusAcknowledged: '#29B6F6',
  statusInProgress: '#FFA726',
  statusResolved: '#66BB6A',
  statusClosed: '#78909C',
  statusRejected: '#EF5350',
};

const LIGHT_COLORS = {
  primary: '#1E88E5',
  primaryDark: '#1565C0',
  primaryLight: '#64B5F6',
  secondary: '#FF6F00',
  secondaryLight: '#FFA040',
  accent: '#00C853',

  background: '#F5F5F5',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  card: '#FFFFFF',

  text: '#212121',
  textSecondary: '#757575',
  textLight: '#BDBDBD',
  textOnPrimary: '#FFFFFF',

  border: '#E0E0E0',
  divider: '#EEEEEE',

  success: '#4CAF50',
  warning: '#FFC107',
  error: '#F44336',
  info: '#2196F3',

  statusDraft: '#9E9E9E',
  statusSubmitted: '#2196F3',
  statusAcknowledged: '#03A9F4',
  statusInProgress: '#FF9800',
  statusResolved: '#4CAF50',
  statusClosed: '#607D8B',
  statusRejected: '#F44336',
};

export interface ThemeContextType {
  mode: ThemeMode;
  isDark: boolean;
  colors: typeof LIGHT_COLORS;
  setMode: (mode: ThemeMode) => void;
}

export const ThemeContext = createContext<ThemeContextType>({
  mode: 'light',
  isDark: false,
  colors: LIGHT_COLORS,
  setMode: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

const THEME_KEY = 'app_theme_mode';

export async function loadSavedTheme(): Promise<ThemeMode> {
  const saved = await AsyncStorage.getItem(THEME_KEY);
  return (saved as ThemeMode) || 'light';
}

export async function saveTheme(mode: ThemeMode): Promise<void> {
  await AsyncStorage.setItem(THEME_KEY, mode);
}

export function getColors(isDark: boolean) {
  return isDark ? DARK_COLORS : LIGHT_COLORS;
}

export { LIGHT_COLORS, DARK_COLORS };
