import type { StoryCharacter } from './content';

export type SeriesOrientation = 'landscape' | 'portrait';

export type AnimationStyle = '2d' | '3d';

export interface SeriesVisualStyle {
  orientation: SeriesOrientation;
  animationStyle: AnimationStyle;
  framing: string;
  colorPalette: string;
  artDirection: string;
}

export interface Series {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  visualStyle: SeriesVisualStyle;
  characters: StoryCharacter[];
}

export interface SeriesSummary {
  id: string;
  name: string;
  characterCount: number;
  projectCount?: number;
  updatedAt: string;
}

export interface CreateSeriesRequest {
  name?: string;
  description?: string;
  visualStyle?: Partial<SeriesVisualStyle>;
}

export interface UpdateSeriesRequest {
  name?: string;
  description?: string;
  visualStyle?: Partial<SeriesVisualStyle>;
  characters?: StoryCharacter[];
}

export const ACTIVE_SERIES_STORAGE_KEY = 'ai-story-factory:active-series-id';

function defaultArtDirectionForAnimation(
  animationStyle: AnimationStyle,
): string {
  if (animationStyle === '3d') {
    return '3D animated CGI with stylized cartoon rendering, soft global illumination, and cohesive episode lighting';
  }

  return '2D animated illustration with cel-shaded colors, clean line art, and cohesive episode lighting';
}

export function createDefaultVisualStyle(): SeriesVisualStyle {
  return {
    orientation: 'landscape',
    animationStyle: '2d',
    framing:
      'Eye-level cinematic framing, consistent left-to-right scene blocking, stable camera height across episodes',
    colorPalette: 'Warm natural tones with soft contrast',
    artDirection: defaultArtDirectionForAnimation('2d'),
  };
}

export function mergeVisualStyle(
  partial?: Partial<SeriesVisualStyle>,
): SeriesVisualStyle {
  const defaults = createDefaultVisualStyle();
  if (!partial) {
    return defaults;
  }

  const animationStyle = partial.animationStyle ?? defaults.animationStyle;

  return {
    orientation: partial.orientation ?? defaults.orientation,
    animationStyle,
    framing: partial.framing?.trim() || defaults.framing,
    colorPalette: partial.colorPalette?.trim() || defaults.colorPalette,
    artDirection:
      partial.artDirection?.trim() ||
      defaultArtDirectionForAnimation(animationStyle),
  };
}

export function getOrientationLabel(orientation: SeriesOrientation): string {
  return orientation === 'portrait' ? 'Portrait (9:16)' : 'Landscape (16:9)';
}

export function getAnimationStyleLabel(animationStyle: AnimationStyle): string {
  return animationStyle === '3d' ? '3D animated' : '2D animated';
}
