// ============================================================
// Fault Line — Theme E (Tunnel + Amber)
// ============================================================
// Dark mode only. Tunnel navy background with optimistic amber
// accent. Industrial structure, editorial typography.
// ============================================================

export const COLORS = {
  // Primary — bright optimistic amber
  primary: '#F4B832',
  primaryDark: '#D9A01A',
  primaryLight: '#FFD15C',
  secondary: '#F4B832',
  secondaryLight: '#FFD15C',
  accent: '#F4B832',

  // Surfaces — tunnel navy
  background: '#0A1628',
  surface: '#050B14',
  surfaceElevated: '#14243C',
  card: '#050B14',

  // Text — subway tile
  text: '#F4F4F0',
  textSecondary: '#CFCFC8',
  textLight: '#9098A5',
  textOnPrimary: '#050B14',

  // Structure
  border: '#1D3553',
  divider: '#14243C',

  // Signals
  success: '#46C37A',
  warning: '#F4B832',
  error: '#E8463E',
  info: '#F4B832',

  // Report status
  statusDraft: '#6B7A91',
  statusSubmitted: '#F4B832',
  statusAcknowledged: '#FFD15C',
  statusInProgress: '#F4B832',
  statusResolved: '#46C37A',
  statusClosed: '#6B7A91',
  statusRejected: '#E8463E',
};

/** Fonts — loaded via expo-font in App.tsx before first render. */
export const FONTS = {
  display: 'PlayfairDisplay_800ExtraBold',
  displayItalic: 'PlayfairDisplay_800ExtraBold_Italic',
  body: 'Lora_400Regular',
  bodyItalic: 'Lora_400Regular_Italic',
  bodyBold: 'Lora_600SemiBold',
  ui: 'Oswald_600SemiBold',
  uiMedium: 'Oswald_500Medium',
  mono: 'IBMPlexMono_500Medium',
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const FONT_SIZES = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 22,
  xxl: 28,
  title: 34,
  hero: 44,
};

export const BORDER_RADIUS = {
  sm: 2,
  md: 4,
  lg: 6,
  xl: 10,
  round: 999,
};

export const SHADOWS = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  amberGlow: {
    shadowColor: '#F4B832',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
};
