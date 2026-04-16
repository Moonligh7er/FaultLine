import { Dimensions } from 'react-native';

// ============================================================
// Smart Photo Coaching
// Camera overlay guidelines + real-time AI feedback
// to help users take better evidence photos.
// ============================================================

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export interface PhotoGuideline {
  id: string;
  text: string;
  icon: string;
  priority: number; // 1 = most important
}

export interface CameraOverlay {
  guidelines: PhotoGuideline[];
  gridLines: { x: number; y: number; width: number; height: number }[];
  referenceZone: { x: number; y: number; width: number; height: number; label: string };
  distanceGuide: string;
}

// Category-specific photo guidance
const CATEGORY_GUIDELINES: Record<string, PhotoGuideline[]> = {
  pothole: [
    { id: 'scale', text: 'Place a shoe or water bottle next to it for scale', icon: 'shoe-formal', priority: 1 },
    { id: 'distance', text: 'Photograph from about 3 feet away', icon: 'ruler', priority: 2 },
    { id: 'surface', text: 'Include surrounding road surface', icon: 'road', priority: 3 },
    { id: 'depth', text: 'Take a second photo showing depth (side angle)', icon: 'angle-acute', priority: 4 },
  ],
  streetlight: [
    { id: 'pole', text: 'Include the full pole and fixture', icon: 'lightbulb-outline', priority: 1 },
    { id: 'number', text: 'Capture any pole ID number', icon: 'pound', priority: 2 },
    { id: 'darkness', text: 'Show the dark area it should illuminate', icon: 'weather-night', priority: 3 },
  ],
  sidewalk: [
    { id: 'crack', text: 'Show the full extent of the damage', icon: 'image-broken-variant', priority: 1 },
    { id: 'trip', text: 'Show the height difference at trip points', icon: 'stairs-up', priority: 2 },
    { id: 'width', text: 'Include the full sidewalk width', icon: 'arrow-expand-horizontal', priority: 3 },
  ],
  fallen_tree: [
    { id: 'blockage', text: 'Show what the tree is blocking', icon: 'road-variant', priority: 1 },
    { id: 'size', text: 'Include something for size reference', icon: 'human-male-height', priority: 2 },
    { id: 'wires', text: 'If near power lines, capture that clearly', icon: 'flash-alert', priority: 3 },
  ],
  signage: [
    { id: 'sign', text: 'Show the sign (or where it should be)', icon: 'sign-direction', priority: 1 },
    { id: 'readable', text: 'Get close enough to read any remaining text', icon: 'magnify', priority: 2 },
    { id: 'intersection', text: 'Include the intersection or road context', icon: 'map-marker', priority: 3 },
  ],
};

const DEFAULT_GUIDELINES: PhotoGuideline[] = [
  { id: 'clear', text: 'Ensure the issue is clearly visible', icon: 'eye', priority: 1 },
  { id: 'scale', text: 'Include a reference object for scale', icon: 'ruler', priority: 2 },
  { id: 'context', text: 'Show the surrounding area for context', icon: 'image-area', priority: 3 },
  { id: 'stable', text: 'Hold steady — avoid blurry photos', icon: 'hand-okay', priority: 4 },
];

export function getPhotoGuidelines(category: string): PhotoGuideline[] {
  return CATEGORY_GUIDELINES[category] || DEFAULT_GUIDELINES;
}

export function getCameraOverlay(category: string): CameraOverlay {
  const guidelines = getPhotoGuidelines(category);

  // Rule of thirds grid
  const gridLines = [
    { x: SCREEN_W / 3, y: 0, width: 1, height: SCREEN_H },
    { x: (SCREEN_W / 3) * 2, y: 0, width: 1, height: SCREEN_H },
    { x: 0, y: SCREEN_H / 3, width: SCREEN_W, height: 1 },
    { x: 0, y: (SCREEN_H / 3) * 2, width: SCREEN_W, height: 1 },
  ];

  // Center target zone where the issue should be
  const referenceZone = {
    x: SCREEN_W * 0.2,
    y: SCREEN_H * 0.25,
    width: SCREEN_W * 0.6,
    height: SCREEN_H * 0.4,
    label: 'Center the issue here',
  };

  const distanceGuides: Record<string, string> = {
    pothole: '~3 feet away',
    sidewalk: '~4 feet away',
    streetlight: '~15 feet away, angle up',
    signage: '~6 feet away',
    fallen_tree: '~10 feet away',
    graffiti: '~5 feet away',
  };

  return {
    guidelines,
    gridLines,
    referenceZone,
    distanceGuide: distanceGuides[category] || '~5 feet away',
  };
}

// AI photo quality feedback (post-capture)
export interface PhotoQualityFeedback {
  overallScore: number; // 0-100
  issues: string[];
  suggestions: string[];
  isUsable: boolean;
}

export function assessPhotoQuality(
  aiAnalysis: any, // From analyzePhoto result
): PhotoQualityFeedback {
  const issues: string[] = [];
  const suggestions: string[] = [];
  let score = 70; // Base score

  if (!aiAnalysis) {
    return {
      overallScore: 50,
      issues: ['Could not analyze photo'],
      suggestions: ['Try taking another photo with better lighting'],
      isUsable: true,
    };
  }

  // Check confidence
  if (aiAnalysis.confidence < 0.3) {
    score -= 30;
    issues.push('Issue is not clearly visible');
    suggestions.push('Get closer to the issue and ensure it fills more of the frame');
  } else if (aiAnalysis.confidence < 0.6) {
    score -= 10;
    suggestions.push('A clearer photo would strengthen this report');
  } else {
    score += 15;
  }

  // Check if category was detected
  if (aiAnalysis.detectedCategory) {
    score += 10;
  } else {
    score -= 15;
    issues.push('Could not identify the type of issue');
    suggestions.push('Include more context around the damaged area');
  }

  // Check if dimensions were estimated (means photo is clear enough)
  if (aiAnalysis.estimatedDimensions) {
    score += 10;
  } else {
    suggestions.push('Including a reference object (shoe, bottle) helps estimate size');
  }

  return {
    overallScore: Math.max(0, Math.min(100, score)),
    issues,
    suggestions,
    isUsable: score >= 30,
  };
}
