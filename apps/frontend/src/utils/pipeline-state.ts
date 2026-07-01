import type { PipelineStep } from '../types/content';
import type { ProjectState } from '../types/project';

export interface PipelineUiState {
  topic: string;
  currentStep: PipelineStep;
  reviewStep: PipelineStep | null;
  idea: string | null;
  story: string | null;
  scriptScenes: ProjectState['scriptScenes'];
  characterAppearance: string | null;
  promptedScenes: ProjectState['promptedScenes'];
  imageScenes: ProjectState['imageScenes'];
  videoScenes: ProjectState['videoScenes'];
  audioScenes: ProjectState['audioScenes'];
  finalVideoPath: string | null;
  approvedThroughIndex: number;
  expandedSteps: Record<number, boolean>;
  failedStep: PipelineStep | null;
  pipelineError: string | null;
}

export function inferInterruptedStep(state: ProjectState): PipelineStep | null {
  if (state.failedStep) {
    return state.failedStep;
  }

  if (state.scriptScenes.length === 0) {
    return null;
  }

  if (
    state.promptedScenes.length > 0 &&
    state.promptedScenes.length < state.scriptScenes.length
  ) {
    return 'prompts';
  }

  if (
    state.promptedScenes.length === state.scriptScenes.length &&
    state.imageScenes.length > 0 &&
    state.imageScenes.length < state.promptedScenes.length
  ) {
    return 'images';
  }

  if (
    state.imageScenes.length === state.promptedScenes.length &&
    state.promptedScenes.length > 0 &&
    state.videoScenes.length > 0 &&
    state.videoScenes.length < state.imageScenes.length
  ) {
    return 'videos';
  }

  if (
    state.videoScenes.length === state.imageScenes.length &&
    state.videoScenes.length > 0 &&
    state.audioScenes.length > 0 &&
    state.audioScenes.length < state.videoScenes.length
  ) {
    return 'audio';
  }

  if (
    state.audioScenes.length === state.videoScenes.length &&
    state.audioScenes.length > 0 &&
    !state.finalVideoPath
  ) {
    return 'assembly';
  }

  return null;
}

export function getResumeProgressLabel(
  step: PipelineStep,
  state: Pick<
    ProjectState,
    'scriptScenes' | 'promptedScenes' | 'imageScenes' | 'videoScenes' | 'audioScenes'
  >,
): string | null {
  switch (step) {
    case 'prompts':
      return `${state.promptedScenes.length} of ${state.scriptScenes.length} scene prompts done`;
    case 'images':
      return `${state.imageScenes.length} of ${state.promptedScenes.length} scene images done`;
    case 'videos':
      return `${state.videoScenes.length} of ${state.imageScenes.length} scene videos done`;
    case 'audio':
      return `${state.audioScenes.length} of ${state.videoScenes.length} scene audio tracks done`;
    default:
      return null;
  }
}

export function serializePipelineState(state: PipelineUiState): ProjectState {
  return {
    topic: state.topic,
    currentStep: state.currentStep,
    reviewStep: state.reviewStep,
    idea: state.idea,
    story: state.story,
    scriptScenes: state.scriptScenes,
    characterAppearance: state.characterAppearance,
    promptedScenes: state.promptedScenes,
    imageScenes: state.imageScenes,
    videoScenes: state.videoScenes,
    audioScenes: state.audioScenes,
    finalVideoPath: state.finalVideoPath,
    approvedThroughIndex: state.approvedThroughIndex,
    expandedSteps: state.expandedSteps,
    failedStep: state.failedStep,
    pipelineError: state.pipelineError,
  };
}

export function formatProjectTimestamp(value: string): string {
  const date = new Date(value);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) {
    return 'Just now';
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}
