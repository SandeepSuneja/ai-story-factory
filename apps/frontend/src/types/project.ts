import type { PipelineStep, SceneScript, StoryCharacter, StoryLanguage, VideoGenerationMode } from './content';
import type { SeriesVisualStyle } from './series';
import { mergeVisualStyle } from './series';
import { resolveProjectCharacters } from '../utils/characters';
export interface ProjectState {
  topic: string;
  storyLanguage: StoryLanguage;
  videoGenerationMode: VideoGenerationMode;
  seriesId?: string | null;
  sourceProjectId?: string | null;
  visualStyle?: SeriesVisualStyle;
  currentStep: PipelineStep;  reviewStep: PipelineStep | null;
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

export interface Project {
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

export interface CreateProjectRequest {
  name?: string;
  seriesId?: string | null;
  state?: Partial<ProjectState>;
}

export interface UpdateProjectRequest {
  name?: string;
  state?: ProjectState;
}

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export const ACTIVE_PROJECT_STORAGE_KEY = 'ai-story-factory:active-project-id';

export function mergeProjectState(partial?: Partial<ProjectState>): ProjectState {
  const defaults = createEmptyProjectState();
  if (!partial) {
    return defaults;
  }

  return {
    ...defaults,
    ...partial,
    videoGenerationMode: partial.videoGenerationMode ?? defaults.videoGenerationMode,
    seriesId: partial.seriesId ?? defaults.seriesId,
    sourceProjectId: partial.sourceProjectId ?? defaults.sourceProjectId,
    visualStyle: mergeVisualStyle(partial.visualStyle ?? defaults.visualStyle),
    characters: resolveProjectCharacters({
      characters: partial.characters,
      characterAppearance: partial.characterAppearance,
      storyLanguage: partial.storyLanguage ?? defaults.storyLanguage,
    }),
    scriptScenes: partial.scriptScenes ?? defaults.scriptScenes,
    promptedScenes: partial.promptedScenes ?? defaults.promptedScenes,
    imageScenes: partial.imageScenes ?? defaults.imageScenes,
    videoScenes: partial.videoScenes ?? defaults.videoScenes,
    audioScenes: partial.audioScenes ?? defaults.audioScenes,
    finalVideoPath: partial.finalVideoPath ?? defaults.finalVideoPath,
    failedStep: partial.failedStep ?? defaults.failedStep,
    pipelineError: partial.pipelineError ?? defaults.pipelineError,
    expandedSteps: {
      ...defaults.expandedSteps,
      ...partial.expandedSteps,
    },
  };
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

export function getStepLabel(step: PipelineStep): string {
  switch (step) {
    case 'topic':
      return 'Topic';
    case 'idea':
      return 'Idea';
    case 'story':
      return 'Story';
    case 'script':
      return 'Script';
    case 'character':
      return 'Character';
    case 'visual':
      return 'Visual settings';
    case 'prompts':
      return 'Prompts';
    case 'images':
      return 'Images';
    case 'videos':
      return 'Videos';
    case 'audio':
      return 'Audio';
    case 'assembly':
      return 'Assembly';
    case 'complete':
      return 'Complete';
    default:
      return step;
  }
}
