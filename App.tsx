import React, { useCallback, useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { AppState, AppStateStatus, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts,
  PlayfairDisplay_800ExtraBold,
  PlayfairDisplay_800ExtraBold_Italic,
  PlayfairDisplay_900Black,
  PlayfairDisplay_900Black_Italic,
} from '@expo-google-fonts/playfair-display';
import {
  Lora_400Regular,
  Lora_400Regular_Italic,
  Lora_600SemiBold,
} from '@expo-google-fonts/lora';
import {
  Oswald_500Medium,
  Oswald_600SemiBold,
  Oswald_700Bold,
} from '@expo-google-fonts/oswald';
import {
  IBMPlexMono_400Regular,
  IBMPlexMono_500Medium,
  IBMPlexMono_600SemiBold,
} from '@expo-google-fonts/ibm-plex-mono';
import Navigation from './src/navigation';
import { processQueue } from './src/services/offlineQueue';
import {
  registerForPushNotifications,
  subscribeToReportUpdates,
  unsubscribeFromReportUpdates,
} from './src/services/notifications';
import { supabase } from './src/services/supabase';
import { initCrashReporting, setUser } from './src/services/crashReporting';
import { checkCommuteReports, checkWeeklyDigest, recordLocationPoint } from './src/services/smartPush';
import { batchSyncStatuses } from './src/services/authorityApi';
import { loadSavedLanguage } from './src/services/i18n';
import { startProximityMonitoring, stopProximityMonitoring } from './src/services/proximityAlerts';
import { runWitnessCheck } from './src/services/witnessNetwork';
import { checkBrokenPromises } from './src/services/responseScoreboard';
import { checkDeviceSecurity, createPinnedFetch } from './src/services/security';
import { ThemeProvider } from './src/store/ThemeProvider';
import TrackingPrompt from './src/components/TrackingPrompt';

// Install domain-whitelisted fetch globally
const originalFetch = global.fetch;
global.fetch = createPinnedFetch(originalFetch);

initCrashReporting();

// Hold the native splash screen until fonts + initial bootstrap are ready.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const notificationListener = useRef<Notifications.EventSubscription | undefined>(undefined);
  const responseListener = useRef<Notifications.EventSubscription | undefined>(undefined);
  const appState = useRef(AppState.currentState);

  const [fontsLoaded, fontError] = useFonts({
    PlayfairDisplay_800ExtraBold,
    PlayfairDisplay_800ExtraBold_Italic,
    PlayfairDisplay_900Black,
    PlayfairDisplay_900Black_Italic,
    Lora_400Regular,
    Lora_400Regular_Italic,
    Lora_600SemiBold,
    Oswald_500Medium,
    Oswald_600SemiBold,
    Oswald_700Bold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
    IBMPlexMono_600SemiBold,
  });

  const onLayoutReady = useCallback(async () => {
    if (fontsLoaded || fontError) {
      await SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    const logErr = (name: string) => (err: any) => console.warn(`[${name}]`, err?.message || err);

    loadSavedLanguage().catch(logErr('i18n'));
    processQueue().catch(logErr('offlineSync'));
    registerForPushNotifications().catch(logErr('pushNotifs'));
    recordLocationPoint().catch(logErr('commuteRecord'));
    checkCommuteReports().catch(logErr('commuteAlerts'));
    checkWeeklyDigest().catch(logErr('weeklyDigest'));
    batchSyncStatuses().catch(logErr('statusSync'));
    startProximityMonitoring().catch(logErr('proximityAlerts'));
    checkBrokenPromises().catch(logErr('brokenPromises'));

    supabase.auth.getSession().then(({ data: { session } }) => {
      runWitnessCheck(session?.user?.id).catch(logErr('witnessCheck'));
    });

    checkDeviceSecurity().then((status) => {
      if (status.riskLevel === 'dangerous') {
        console.warn('Security warning:', status.warnings);
      }
    }).catch(logErr('securityCheck'));

    // Auth + realtime subscriptions
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        subscribeToReportUpdates(session.user.id, () => {});
        setUser(session.user.id);
      }
    });

    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          subscribeToReportUpdates(session.user.id, () => {});
          setUser(session.user.id);
        } else if (event === 'SIGNED_OUT') {
          unsubscribeFromReportUpdates();
          setUser(null);
        }
      }
    );

    // Handle notification taps for deep linking
    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data;
        console.log('Notification tapped:', data);
      }
    );

    // Re-sync when app comes to foreground
    const appStateSub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        processQueue().catch(() => {});
        recordLocationPoint().catch(() => {});
        batchSyncStatuses().catch(() => {});
      }
      appState.current = nextState;
    });

    return () => {
      authSub.unsubscribe();
      unsubscribeFromReportUpdates();
      stopProximityMonitoring();
      notificationListener.current?.remove();
      responseListener.current?.remove();
      appStateSub.remove();
    };
  }, []);

  // Keep the splash up until fonts resolve. If fonts fail, we still render
  // with system fallbacks rather than leaving the user on a stuck splash.
  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }} onLayout={onLayoutReady}>
      <ThemeProvider>
        <TrackingPrompt />
        <StatusBar style="light" />
        <Navigation />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
