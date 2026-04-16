import { Share } from 'react-native';
import * as Sharing from 'expo-sharing';
import { Report } from '../types';
import { CATEGORIES, HAZARD_LEVELS } from '../constants/categories';

export async function shareReport(report: Report): Promise<void> {
  const category = CATEGORIES.find((c) => c.key === report.category);
  const hazard = HAZARD_LEVELS.find((h) => h.key === report.severity.hazardLevel);
  const location = report.location.address || report.location.city || 'Unknown location';

  const message = [
    `🚨 ${category?.label || report.category} reported at ${location}`,
    `Hazard: ${hazard?.label || 'Unknown'}`,
    `Status: ${report.status.replace('_', ' ')}`,
    `${report.upvoteCount} upvotes, ${report.confirmCount} confirmations`,
    '',
    report.description || '',
    '',
    `📍 https://maps.google.com/?q=${report.location.latitude},${report.location.longitude}`,
    '',
    'Reported via Fault Line — help fix your community\'s infrastructure.',
  ].filter(Boolean).join('\n');

  await Share.share({
    message,
    title: `${category?.label} at ${location} — Fault Line`,
  });
}
