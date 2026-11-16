import React from 'react';
import { useIsFocused } from '@react-navigation/native';
import AdBanner from './AdBanner';
import { useAdsSuppressed } from '../services/adGate';

interface SmartAdBannerProps {
  placement?: 'home' | 'map' | 'dashboard' | 'detail';
}

// Renders only on the focused screen and never while a sensitive flow
// (report / insider) is open — see services/adGate.ts.
export default function SmartAdBanner({ placement = 'home' }: SmartAdBannerProps) {
  const focused = useIsFocused();
  const suppressed = useAdsSuppressed();
  if (!focused || suppressed) return null;
  return <AdBanner placement={placement} />;
}
