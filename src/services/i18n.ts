import { I18n } from 'i18n-js';
import { getLocales } from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ============================================================
// Internationalization / Localization
// Supports: English, Spanish, Portuguese, Chinese, Haitian Creole
// (Top non-English languages in MA/RI/NH)
// ============================================================

const LANG_KEY = 'app_language';

const translations = {
  en: {
    // General
    appName: 'Fault Line',
    home: 'Home',
    report: 'Report',
    map: 'Map',
    dashboard: 'Dashboard',
    profile: 'Profile',

    // Home
    heroTitle: 'Report an Issue',
    heroSubtitle: "Help fix your community's infrastructure — faster.",
    newReport: 'New Report',
    quickReport: 'Quick Report',
    quickReportLabel: 'Quick',
    recentReports: 'Recent Reports',
    seeMap: 'See Map',
    noReportsYet: 'No reports yet',
    beFirst: 'Be the first to report an issue!',
    offlineQueued: '{count} report(s) queued offline',

    // Report
    whatsTheIssue: "What's the issue?",
    whereIsIt: 'Where is it?',
    addDetails: 'Add details',
    howBad: 'How bad is it?',
    reviewSubmit: 'Review & Submit',
    descriptionOptional: 'Description (optional)',
    descriptionPlaceholder: 'Describe the issue...',
    photosVideos: 'Photos & Videos',
    camera: 'Camera',
    gallery: 'Gallery',
    submitAnonymously: 'Submit anonymously',
    next: 'Next',
    back: 'Back',
    submitReport: 'Submit Report',
    submitting: 'Submitting...',
    reportSubmitted: 'Report Submitted!',
    thankYou: 'Thank you for helping improve your community.',
    savedOffline: 'Saved Offline',
    willSubmitLater: 'Your report will be submitted when you reconnect.',
    switchToDetailed: 'Switch to detailed report',
    switchToQuick: 'Switch to quick report',

    // Severity
    size: 'Size',
    hazardLevel: 'Hazard Level',
    urgency: 'Urgency',
    condition: 'Condition',
    small: 'Small',
    medium: 'Medium',
    large: 'Large',
    massive: 'Massive',
    minor: 'Minor',
    moderate: 'Moderate',
    significant: 'Significant',
    dangerous: 'Dangerous',
    extremelyDangerous: 'Extremely Dangerous',

    // Map
    reportsNearby: '{count} reports nearby',
    all: 'All',

    // Dashboard
    communityDashboard: 'Community Dashboard',
    totalReports: 'Total Reports',
    resolved: 'Resolved',
    pending: 'Pending',
    fixRate: 'Fix Rate',
    topCategories: 'Top Categories',
    authorityLeaderboard: 'Authority Response Leaderboard',
    predictions: 'Risk Predictions',

    // Profile
    guestUser: 'Guest User',
    signIn: 'Sign In',
    signOut: 'Sign Out',
    sendMagicLink: 'Send Magic Link',
    reports: 'Reports',
    points: 'Points',
    badges: 'Badges',
    syncOffline: 'Sync {count} Offline Report(s)',
    settings: 'Settings',

    // Social
    upvote: 'Upvote',
    confirm: 'Confirm',
    share: 'Share',
    streak: '{count} day streak!',
    leaderboard: 'Leaderboard',
    neighborhood: 'Your Neighborhood',

    // Errors
    locationRequired: 'Location Required',
    permissionNeeded: 'Permission needed',
    error: 'Error',
    tryAgain: 'Try Again',
    rateLimit: 'Too many reports. Please wait before submitting again.',
  },

  es: {
    appName: 'Fault Line',
    home: 'Inicio',
    report: 'Reportar',
    map: 'Mapa',
    dashboard: 'Panel',
    profile: 'Perfil',
    heroTitle: 'Reportar un Problema',
    heroSubtitle: 'Ayuda a mejorar la infraestructura de tu comunidad — más rápido.',
    newReport: 'Nuevo Reporte',
    quickReport: 'Reporte Rápido',
    quickReportLabel: 'Rápido',
    recentReports: 'Reportes Recientes',
    seeMap: 'Ver Mapa',
    noReportsYet: 'Sin reportes aún',
    beFirst: '¡Sé el primero en reportar un problema!',
    whatsTheIssue: '¿Cuál es el problema?',
    whereIsIt: '¿Dónde está?',
    addDetails: 'Agregar detalles',
    howBad: '¿Qué tan grave es?',
    reviewSubmit: 'Revisar y Enviar',
    descriptionOptional: 'Descripción (opcional)',
    descriptionPlaceholder: 'Describe el problema...',
    photosVideos: 'Fotos y Videos',
    camera: 'Cámara',
    gallery: 'Galería',
    submitAnonymously: 'Enviar anónimamente',
    next: 'Siguiente',
    back: 'Atrás',
    submitReport: 'Enviar Reporte',
    submitting: 'Enviando...',
    reportSubmitted: '¡Reporte Enviado!',
    thankYou: 'Gracias por ayudar a mejorar tu comunidad.',
    savedOffline: 'Guardado Sin Conexión',
    willSubmitLater: 'Tu reporte se enviará cuando te reconectes.',
    size: 'Tamaño',
    hazardLevel: 'Nivel de Peligro',
    urgency: 'Urgencia',
    condition: 'Condición',
    small: 'Pequeño',
    medium: 'Mediano',
    large: 'Grande',
    massive: 'Enorme',
    minor: 'Menor',
    moderate: 'Moderado',
    significant: 'Significativo',
    dangerous: 'Peligroso',
    extremelyDangerous: 'Extremadamente Peligroso',
    communityDashboard: 'Panel Comunitario',
    totalReports: 'Total de Reportes',
    resolved: 'Resueltos',
    pending: 'Pendientes',
    fixRate: 'Tasa de Reparación',
    guestUser: 'Usuario Invitado',
    signIn: 'Iniciar Sesión',
    signOut: 'Cerrar Sesión',
    upvote: 'Apoyar',
    confirm: 'Confirmar',
    share: 'Compartir',
    error: 'Error',
    tryAgain: 'Intentar de Nuevo',
    all: 'Todos',
    settings: 'Configuración',
  },

  pt: {
    appName: 'Fault Line',
    home: 'Início',
    report: 'Reportar',
    map: 'Mapa',
    dashboard: 'Painel',
    profile: 'Perfil',
    heroTitle: 'Reportar um Problema',
    heroSubtitle: 'Ajude a melhorar a infraestrutura da sua comunidade — mais rápido.',
    newReport: 'Novo Relatório',
    quickReport: 'Relatório Rápido',
    quickReportLabel: 'Rápido',
    submitReport: 'Enviar Relatório',
    submitting: 'Enviando...',
    reportSubmitted: 'Relatório Enviado!',
    thankYou: 'Obrigado por ajudar a melhorar sua comunidade.',
    upvote: 'Apoiar',
    confirm: 'Confirmar',
    share: 'Compartilhar',
    error: 'Erro',
    tryAgain: 'Tentar Novamente',
    all: 'Todos',
    settings: 'Configurações',
  },

  zh: {
    appName: 'Fault Line',
    home: '首页',
    report: '报告',
    map: '地图',
    dashboard: '仪表板',
    profile: '个人资料',
    heroTitle: '报告问题',
    heroSubtitle: '帮助更快地修复社区基础设施。',
    newReport: '新报告',
    quickReport: '快速报告',
    submitReport: '提交报告',
    upvote: '点赞',
    confirm: '确认',
    share: '分享',
    error: '错误',
    tryAgain: '重试',
    all: '全部',
    settings: '设置',
  },

  ht: {
    // Haitian Creole — significant population in MA
    appName: 'Fault Line',
    home: 'Akèy',
    report: 'Rapò',
    map: 'Kat',
    dashboard: 'Tablo',
    profile: 'Pwofil',
    heroTitle: 'Rapòte yon Pwoblèm',
    heroSubtitle: 'Ede repare enfrastrikti kominote w — pi vit.',
    newReport: 'Nouvo Rapò',
    quickReport: 'Rapò Rapid',
    submitReport: 'Soumèt Rapò',
    upvote: 'Vote',
    confirm: 'Konfime',
    share: 'Pataje',
    error: 'Erè',
    tryAgain: 'Eseye Ankò',
    all: 'Tout',
    settings: 'Paramèt',
  },
};

export const i18n = new I18n(translations);

// Set default locale from device
const deviceLocale = getLocales()[0]?.languageCode || 'en';
i18n.locale = deviceLocale;
i18n.enableFallback = true;
i18n.defaultLocale = 'en';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
  { code: 'zh', name: 'Chinese', nativeName: '中文' },
  { code: 'ht', name: 'Haitian Creole', nativeName: 'Kreyòl Ayisyen' },
];

export async function loadSavedLanguage(): Promise<string> {
  const saved = await AsyncStorage.getItem(LANG_KEY);
  if (saved) {
    i18n.locale = saved;
    return saved;
  }
  return i18n.locale;
}

export async function setLanguage(code: string): Promise<void> {
  i18n.locale = code;
  await AsyncStorage.setItem(LANG_KEY, code);
}

export function t(key: string, options?: Record<string, any>): string {
  return i18n.t(key, options);
}
