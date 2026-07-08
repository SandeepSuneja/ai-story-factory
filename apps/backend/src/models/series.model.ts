import type {
  SeriesVisualStyle,
  StoryCharacter,
} from '../content-state';
import { createDefaultVisualStyle } from '../visual-style';

export type { AnimationStyle, SeriesOrientation, SeriesVisualStyle } from '../content-state';
export {
  createDefaultVisualStyle,
  mergeVisualStyle,
} from '../visual-style';

export interface SeriesRecord {
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

export class CreateSeriesRequestDto {
  name?: string;
  description?: string;
  visualStyle?: Partial<SeriesVisualStyle>;
}

export class UpdateSeriesRequestDto {
  name?: string;
  description?: string;
  visualStyle?: Partial<SeriesVisualStyle>;
  characters?: StoryCharacter[];
}

export function createEmptySeries(name = 'Untitled series'): SeriesRecord {
  const now = new Date().toISOString();

  return {
    id: '',
    name,
    description: '',
    createdAt: now,
    updatedAt: now,
    visualStyle: createDefaultVisualStyle(),
    characters: [],
  };
}
