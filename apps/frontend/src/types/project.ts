import type { PipelineStep, SceneScript, StoryLanguage, VideoGenerationMode } from './content';

export interface ProjectState {
  topic: string;
  storyLanguage: StoryLanguage;
  videoGenerationMode: VideoGenerationMode;
  currentStep: PipelineStep;
  reviewStep: PipelineStep | null;
  idea: string | null;
  story: string | null;
  scriptScenes: SceneScript[];
  characterAppearance: string | null;
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
  createdAt: string;
  updatedAt: string;
  state: ProjectState;
}

export interface ProjectSummary {
  id: string;
  name: string;
  topic: string;
  currentStep: PipelineStep;
  updatedAt: string;
}

export interface CreateProjectRequest {
  name?: string;
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
    currentStep: 'topic',
    reviewStep: null,
    idea: null,
    story: null,
    scriptScenes: [],
    characterAppearance: null,
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
