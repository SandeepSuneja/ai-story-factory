import type { PipelineStep, SceneScript } from '../content-state';

export interface ProjectState {
  topic: string;
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

export interface ProjectRecord {
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

export class CreateProjectRequestDto {
  name?: string;
  state?: Partial<ProjectState>;
}

export class UpdateProjectRequestDto {
  name?: string;
  state?: ProjectState;
}

export function createEmptyProjectState(): ProjectState {
  return {
    topic: '',
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
