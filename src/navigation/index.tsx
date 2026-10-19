import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants/theme';
import { RootStackParamList, RootTabParamList } from '../types';
import { LINKING_CONFIG } from '../services/deepLinking';
import Icon from '../components/Icon';
import ErrorBoundary from '../components/ErrorBoundary';

import HomeScreen from '../screens/HomeScreen';
import ReportScreen from '../screens/ReportScreen';
import MapScreen from '../screens/MapScreen';
import DashboardScreen from '../screens/DashboardScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ReportDetailScreen from '../screens/ReportDetailScreen';
import OnboardingScreen, { shouldShowOnboarding } from '../screens/OnboardingScreen';
import ARScreen from '../screens/ARScreen';
import PrivacyPolicyScreen from '../screens/PrivacyPolicyScreen';
import TermsOfServiceScreen from '../screens/TermsOfServiceScreen';
import FeaturesScreen from '../screens/FeaturesScreen';
import FeedbackScreen from '../screens/FeedbackScreen';

const Tab = createBottomTabNavigator<RootTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

const TAB_ICONS: Record<string, string> = {
  Home: 'home',
  Report: 'plus-circle',
  Map: 'map',
  Dashboard: 'chart-box', // 'chart-bar-outline' doesn't exist in MaterialCommunityIcons
  Profile: 'account',
};

function MainTabs() {
  // Fixed height/padding override React Navigation's own inset handling, so add
  // the bottom inset back — Android 15 is edge-to-edge and the gesture bar
  // otherwise covers the tab labels.
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color }) => (
          <Icon
            name={focused ? TAB_ICONS[route.name] : `${TAB_ICONS[route.name]}-outline`}
            size={focused ? 26 : 22}
            color={color}
          />
        ),
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textSecondary,
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor: COLORS.border,
          height: 60 + insets.bottom,
          paddingBottom: 8 + insets.bottom,
          paddingTop: 4,
        },
        headerStyle: { backgroundColor: COLORS.primary },
        headerTintColor: COLORS.textOnPrimary,
        headerTitleStyle: { fontWeight: '600' as const },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'Home' }} />
      <Tab.Screen name="Report" component={ReportScreen} options={{ title: 'Report' }} />
      <Tab.Screen name="Map" component={MapScreen} options={{ title: 'Map' }} />
      <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Dashboard' }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
    </Tab.Navigator>
  );
}

export default function Navigation() {
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    shouldShowOnboarding().then(setShowOnboarding);
  }, []);

  if (showOnboarding === null) return null; // Loading

  return (
    <ErrorBoundary>
      <NavigationContainer linking={LINKING_CONFIG as any}>
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: COLORS.primary },
            headerTintColor: COLORS.textOnPrimary,
          }}
        >
          {showOnboarding && (
            <Stack.Screen
              name="Onboarding"
              component={OnboardingScreen}
              options={{ headerShown: false }}
            />
          )}
          <Stack.Screen
            name="MainTabs"
            component={MainTabs}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="ReportDetail"
            component={ReportDetailScreen}
            options={{ title: 'Report Details' }}
          />
          <Stack.Screen
            name="ARView"
            component={ARScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Features"
            component={FeaturesScreen}
            options={{ title: 'All Features' }}
          />
          <Stack.Screen
            name="PrivacyPolicy"
            component={PrivacyPolicyScreen}
            options={{ title: 'Privacy Policy' }}
          />
          <Stack.Screen
            name="TermsOfService"
            component={TermsOfServiceScreen}
            options={{ title: 'Terms of Service' }}
          />
          <Stack.Screen
            name="Feedback"
            component={FeedbackScreen}
            options={{ title: 'Feedback' }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </ErrorBoundary>
  );
}
