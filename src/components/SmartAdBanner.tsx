import React from 'react';
import AdBanner from './AdBanner';

interface SmartAdBannerProps {
  placement?: 'home' | 'map' | 'dashboard' | 'detail';
}

export default function SmartAdBanner({ placement = 'home' }: SmartAdBannerProps) {
  return <AdBanner placement={placement} />;
}
