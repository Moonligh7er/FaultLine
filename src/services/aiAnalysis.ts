import * as FileSystem from 'expo-file-system';
import { supabase } from './supabase';
import { SizeRating, HazardLevel, ReportCategory } from '../types';

// ============================================================
// AI Photo Analysis Service
// Uses Supabase Edge Function that calls a vision model
// to auto-detect infrastructure damage from photos
// ============================================================

export interface AIAnalysisResult {
  detectedCategory: ReportCategory | null;
  confidence: number; // 0-1
  suggestedSize: SizeRating | null;
  suggestedHazard: HazardLevel;
  damageDescription: string;
  detectedObjects: string[]; // e.g., ['pothole', 'crack', 'water pooling']
  estimatedDimensions?: {
    widthCm: number;
    lengthCm: number;
    depthEstimate: 'shallow' | 'medium' | 'deep';
  };
  roadSurfaceType?: string; // asphalt, concrete, gravel
  weatherConditions?: string; // dry, wet, icy (from photo analysis)
}

export async function analyzePhoto(photoUri: string): Promise<AIAnalysisResult | null> {
  try {
    // Read photo as base64
    const base64 = await FileSystem.readAsStringAsync(photoUri, {
      encoding: 'base64' as any,
    });

    // Call the Supabase Edge Function
    const { data, error } = await supabase.functions.invoke('analyze-photo', {
      body: {
        image: base64,
        mimeType: 'image/jpeg',
      },
    });

    if (error) {
      console.error('AI analysis error:', error);
      return null;
    }

    return data as AIAnalysisResult;
  } catch (err) {
    console.error('AI analysis failed:', err);
    return null;
  }
}

export async function analyzeMultiplePhotos(
  photoUris: string[]
): Promise<AIAnalysisResult | null> {
  // Analyze first photo (primary), use others for validation
  if (photoUris.length === 0) return null;

  const primary = await analyzePhoto(photoUris[0]);
  if (!primary || photoUris.length === 1) return primary;

  // If multiple photos, boost confidence
  const secondary = await analyzePhoto(photoUris[1]);
  if (secondary && secondary.detectedCategory === primary.detectedCategory) {
    primary.confidence = Math.min(primary.confidence * 1.2, 0.99);
  }

  return primary;
}

// Map AI confidence to user-friendly text
export function getConfidenceLabel(confidence: number): string {
  if (confidence >= 0.9) return 'Very High';
  if (confidence >= 0.7) return 'High';
  if (confidence >= 0.5) return 'Moderate';
  if (confidence >= 0.3) return 'Low';
  return 'Very Low';
}

export function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.9) return '#4CAF50';
  if (confidence >= 0.7) return '#8BC34A';
  if (confidence >= 0.5) return '#FFC107';
  if (confidence >= 0.3) return '#FF9800';
  return '#F44336';
}
