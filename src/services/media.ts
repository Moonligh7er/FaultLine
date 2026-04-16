import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import { supabase } from './supabase';
import { MediaAttachment } from '../types';

const MAX_IMAGE_WIDTH = 1920;
const MAX_IMAGE_HEIGHT = 1920;
const JPEG_QUALITY = 0.7;
const MAX_FILE_SIZE_MB = 5;

export async function compressImage(uri: string): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: MAX_IMAGE_WIDTH } }],
    {
      compress: JPEG_QUALITY,
      format: ImageManipulator.SaveFormat.JPEG,
    }
  );
  return result.uri;
}

export async function generateThumbnail(uri: string): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 300 } }],
    {
      compress: 0.6,
      format: ImageManipulator.SaveFormat.JPEG,
    }
  );
  return result.uri;
}

export async function uploadMedia(
  attachment: MediaAttachment,
  reportId: string
): Promise<MediaAttachment> {
  const isImage = attachment.type === 'photo';
  const timestamp = Date.now();

  // Compress images before upload
  let fileUri = attachment.uri;
  let thumbnailUri: string | undefined;
  if (isImage) {
    fileUri = await compressImage(attachment.uri);
    thumbnailUri = await generateThumbnail(attachment.uri);
  }

  // Check file size
  const fileInfo = await FileSystem.getInfoAsync(fileUri);
  if (fileInfo.exists && 'size' in fileInfo && fileInfo.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    throw new Error(`File too large (max ${MAX_FILE_SIZE_MB}MB)`);
  }

  // Read file as base64
  const base64 = await FileSystem.readAsStringAsync(fileUri, {
    encoding: 'base64' as any,
  });

  // Validate file type via magic bytes (first few base64 chars)
  if (isImage && !validateImageMagicBytes(base64)) {
    throw new Error('Invalid image file — file does not appear to be a valid image');
  }

  const ext = isImage ? 'jpg' : 'mp4';
  const path = `reports/${reportId}/${timestamp}_${attachment.id}.${ext}`;

  // Upload to Supabase Storage
  const { data, error } = await supabase.storage
    .from('report-media')
    .upload(path, decode(base64), {
      contentType: isImage ? 'image/jpeg' : 'video/mp4',
      upsert: false,
    });

  if (error) {
    console.error('Upload error:', error);
    throw error;
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from('report-media')
    .getPublicUrl(path);

  // Upload thumbnail
  let thumbnailUrl: string | undefined;
  if (thumbnailUri) {
    const thumbBase64 = await FileSystem.readAsStringAsync(thumbnailUri, {
      encoding: 'base64' as any,
    });
    const thumbPath = `reports/${reportId}/thumbs/${timestamp}_${attachment.id}.jpg`;

    await supabase.storage
      .from('report-media')
      .upload(thumbPath, decode(thumbBase64), {
        contentType: 'image/jpeg',
        upsert: false,
      });

    const { data: thumbUrlData } = supabase.storage
      .from('report-media')
      .getPublicUrl(thumbPath);

    thumbnailUrl = thumbUrlData.publicUrl;
  }

  return {
    ...attachment,
    uploadedUrl: urlData.publicUrl,
    thumbnailUrl,
  };
}

export async function uploadAllMedia(
  media: MediaAttachment[],
  reportId: string,
  onProgress?: (completed: number, total: number) => void
): Promise<MediaAttachment[]> {
  const uploaded: MediaAttachment[] = [];

  for (let i = 0; i < media.length; i++) {
    const result = await uploadMedia(media[i], reportId);
    uploaded.push(result);
    onProgress?.(i + 1, media.length);
  }

  return uploaded;
}

export async function deleteReportMedia(reportId: string): Promise<void> {
  const { data: files } = await supabase.storage
    .from('report-media')
    .list(`reports/${reportId}`);

  if (files && files.length > 0) {
    const paths = files.map((f) => `reports/${reportId}/${f.name}`);
    await supabase.storage.from('report-media').remove(paths);
  }
}

// Validate image file type via base64 magic bytes
function validateImageMagicBytes(base64: string): boolean {
  const header = base64.substring(0, 16);
  // JPEG: starts with /9j/
  // PNG: starts with iVBORw0KGgo
  // GIF: starts with R0lGOD
  // WebP: starts with UklGR
  // BMP: starts with Qk
  return (
    header.startsWith('/9j/') ||      // JPEG
    header.startsWith('iVBORw0K') ||   // PNG
    header.startsWith('R0lGOD') ||     // GIF
    header.startsWith('UklGR') ||      // WebP
    header.startsWith('Qk')            // BMP
  );
}

// Base64 decode helper for Supabase storage upload
function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
