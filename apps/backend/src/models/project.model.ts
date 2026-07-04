import type {
  PipelineStep,
  SceneScript,
  SeriesVisualStyle,
  StoryCharacter,
  StoryLanguage,
  VideoGenerationMode,
} from '../content-state';
import { mergeVisualStyle } from './series.model';

export interface ProjectState {
  topic: string;
  storyLanguage: StoryLanguage;
  videoGenerationMode: VideoGenerationMode;
  seriesId?: string | null;
  sourceProjectId?: string | null;
  visualStyle?: SeriesVisualStyle;
  currentStep: PipelineStep;
  reviewStep: PipelineStep | null;
  idea: string | null;
  story: string | null;
  scriptScenes: SceneScript[];
  characters: StoryCharacter[];
  /** @deprecated Legacy single-character field */
  characterAppearance?: string | null;
  promptedScenes: SceneScript[];
  imageScenes: SceneScript[];
  videoScenes: SceneScript[];
  audioScenes: SceneScript[];
  finalVideoPath: string | null;
  approvedThroughIndex: number;
  expandedSteps: Record<number, boolean>;
  failedStep: PipelineStep | null;
  pipelineError: string | null;
}

export interface ProjectRecord {
  id: string;
  name: string;
  seriesId?: string | null;
  createdAt: string;
  updatedAt: string;
  state: ProjectState;
}

export interface ProjectSummary {
  id: string;
  name: string;
  topic: string;
  seriesId?: string | null;
  currentStep: PipelineStep;
  updatedAt: string;
}

export class CreateProjectRequestDto {
  name?: string;
  seriesId?: string | null;
  state?: Partial<ProjectState>;
}

export class UpdateProjectRequestDto {
  name?: string;
  state?: ProjectState;
}

export function createEmptyProjectState(): ProjectState {
  return {
    topic: '',
    storyLanguage: 'en',
    videoGenerationMode: 'local',
    seriesId: null,
    sourceProjectId: null,
    visualStyle: mergeVisualStyle(),
    currentStep: 'topic',
    reviewStep: null,
    idea: null,
    story: null,
    scriptScenes: [],
    characters: [],
    promptedScenes: [],
    imageScenes: [],
    videoScenes: [],
    audioScenes: [],
    finalVideoPath: null,
    approvedThroughIndex: -1,
    expandedSteps: {
      1: false,
      2: false,
      3: false,
      4: false,
      5: false,
      6: false,
      7: false,
      8: false,
      9: false,
      10: false,
    },
    failedStep: null,
    pipelineError: null,
  };
}
