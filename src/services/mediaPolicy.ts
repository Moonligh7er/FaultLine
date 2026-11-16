import Constants from 'expo-constants';
import type { MediaAttachment, Report } from '../types';

// ============================================================
// What media a report may carry
// ============================================================

// The only http(s) media URLs the server accepts on a report: our own
// public report-media bucket. Anything else is dropped before insert.
const PROD_SUPABASE_URL = 'https://dzewklljiksyivsfpunt.supabase.co';
const configuredUrl: string = Constants.expoConfig?.extra?.supabaseUrl || PROD_SUPABASE_URL;
export const REPORT_MEDIA_URL_PREFIX = `${configuredUrl.replace(/\/+$/, '')}/storage/v1/object/public/report-media/`;

export function isAllowedMediaUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (!/^https?:/i.test(value)) return true; // local file:// / content:// uris are the device-side copy
  return value.startsWith(REPORT_MEDIA_URL_PREFIX);
}

// Video metadata (device model, capture time, often GPS) can't be stripped
// on the device, so anonymous reports — every signed-out report included —
// are photo-only. Photos are re-encoded before upload (media.ts), which
// drops their EXIF.
export function isEffectivelyAnonymous(report: Pick<Report, 'isAnonymous' | 'userId'>): boolean {
  return report.isAnonymous === true || !report.userId;
}

export function hasAnonymousVideo(report: Pick<Report, 'isAnonymous' | 'userId' | 'media'>): boolean {
  return isEffectivelyAnonymous(report) && (report.media || []).some((m) => m.type === 'video');
}

/** Storage extension + content type for a video, from its file name. */
export function videoFileType(attachment: Pick<MediaAttachment, 'uri'>): { ext: string; contentType: string } {
  const name = (attachment.uri.split(/[?#]/)[0] || '').toLowerCase();
  if (name.endsWith('.mov') || name.endsWith('.qt')) return { ext: 'mov', contentType: 'video/quicktime' };
  return { ext: 'mp4', contentType: 'video/mp4' };
}
