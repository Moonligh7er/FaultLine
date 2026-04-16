import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LIGHT_COLORS, DARK_COLORS, ThemeMode } from './theme';

const THEME_KEY = 'app_theme_mode';

interface ThemeContextType {
  mode: ThemeMode;
  isDark: boolean;
  colors: typeof LIGHT_COLORS;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  mode: 'system',
  isDark: false,
  colors: LIGHT_COLORS,
  setMode: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then((saved) => {
      if (saved) setModeState(saved as ThemeMode);
    });
  }, []);

  const setMode = (newMode: ThemeMode) => {
    setModeState(newMode);
    AsyncStorage.setItem(THEME_KEY, newMode);
  };

  const isDark = mode === 'dark' || (mode === 'system' && systemScheme === 'dark');
  const colors = isDark ? DARK_COLORS : LIGHT_COLORS;

  return (
    <ThemeContext.Provider value={{ mode, isDark, colors, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}
