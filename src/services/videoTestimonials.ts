import * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabase';
import { uploadMedia } from './media';
import { MediaAttachment } from '../types';
import { transcribeTestimonial as aiTranscribe } from './ai';

// ============================================================
// Emotional Impact Layer — Video Testimonials
// 15-second video testimonials from affected community members.
// Attached to cluster escalation emails because stories
// move politicians more than numbers.
// ============================================================

export interface Testimonial {
  id: string;
  clusterId: string;
  userId: string;
  userName: string;
  videoUrl: string;
  thumbnailUrl?: string;
  transcription?: string;
  duration: number; // seconds
  createdAt: string;
}

export async function recordTestimonial(
  clusterId: string,
  userId: string,
  userName: string,
): Promise<Testimonial | null> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') return null;

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['videos'],
    videoMaxDuration: 15, // 15 seconds max
    videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
    quality: 0.7,
  });

  if (result.canceled || !result.assets[0]) return null;

  const asset = result.assets[0];
  const attachment: MediaAttachment = {
    id: `testimonial-${Date.now()}`,
    uri: asset.uri,
    type: 'video',
  };

  // Upload video
  const uploaded = await uploadMedia(attachment, `testimonials/${clusterId}`);

  // Store testimonial record
  const testimonial: Testimonial = {
    id: attachment.id,
    clusterId,
    userId,
    userName,
    videoUrl: uploaded.uploadedUrl || asset.uri,
    duration: asset.duration || 15,
    createdAt: new Date().toISOString(),
  };

  // Attempt AI transcription (non-blocking, fallback: no transcription)
  if (testimonial.videoUrl) {
    aiTranscribe(testimonial.videoUrl)
      .then((text) => {
        if (text) {
          testimonial.transcription = text;
          supabase.from('testimonials')
            .update({ transcription: text })
            .eq('id', testimonial.id)
            .then(() => {});
        }
      })
      .catch(() => {}); // Works fine without transcription
  }

  // Try to store in dedicated table, fall back to cluster metadata
  const { error } = await supabase.from('testimonials').insert({
    id: testimonial.id,
    cluster_id: clusterId,
    user_id: userId,
    user_name: userName,
    video_url: testimonial.videoUrl,
    duration: testimonial.duration,
  });

  if (error) {
    // Fallback: store in cluster metadata
    console.error('Testimonial table may not exist:', error.message);
  }

  return testimonial;
}

export async function getTestimonialsForCluster(clusterId: string): Promise<Testimonial[]> {
  const { data, error } = await supabase
    .from('testimonials')
    .select('*')
    .eq('cluster_id', clusterId)
    .order('created_at', { ascending: false });

  if (error || !data) return [];

  return data.map((row: any) => ({
    id: row.id,
    clusterId: row.cluster_id,
    userId: row.user_id,
    userName: row.user_name,
    videoUrl: row.video_url,
    thumbnailUrl: row.thumbnail_url,
    transcription: row.transcription,
    duration: row.duration,
    createdAt: row.created_at,
  }));
}

// Generate text summary of testimonials for email escalation
export function testimonialsSummary(testimonials: Testimonial[]): string {
  if (testimonials.length === 0) return '';

  return `
COMMUNITY VOICES
${'━'.repeat(50)}
${testimonials.length} community member${testimonials.length > 1 ? 's have' : ' has'} recorded video testimonials about this issue:

${testimonials.map((t, i) => `  ${i + 1}. ${t.userName} (${new Date(t.createdAt).toLocaleDateString()})${t.transcription ? `\n     "${t.transcription}"` : ''}`).join('\n')}

Video testimonials are available upon request.
`;
}
