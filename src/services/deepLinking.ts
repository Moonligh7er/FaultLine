import * as Linking from 'expo-linking';

// Deep link configuration for notification taps and external links
// URL scheme: faultline://
// Examples:
//   faultline://report/abc-123
//   faultline://dashboard
//   https://faultline.app/report/abc-123

export const LINKING_CONFIG = {
  prefixes: [
    Linking.createURL('/'),
    'https://faultline.app',
    'faultline://',
  ],
  config: {
    screens: {
      MainTabs: {
        screens: {
          Home: 'home',
          Report: 'report/new',
          Map: 'map',
          Dashboard: 'dashboard',
          Profile: 'profile',
        },
      },
      ReportDetail: 'report/:reportId',
      AuthorityDetail: 'authority/:authorityId',
      Onboarding: 'onboarding',
      Settings: 'settings',
    },
  },
};

export function getReportDeepLink(reportId: string): string {
  return Linking.createURL(`/report/${reportId}`);
}

export function getDashboardDeepLink(): string {
  return Linking.createURL('/dashboard');
}
