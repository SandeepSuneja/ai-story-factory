import type { PipelineStep, StoryCharacter } from '../types/content';

import type { ProjectState } from '../types/project';

const IMAGES_STEP_ORDER_INDEX = 6;

export function isImagesStepComplete(
  state: Pick<ProjectState, 'promptedScenes' | 'imageScenes'>,
): boolean {
  return (
    state.promptedScenes.length > 0 &&
    state.imageScenes.length >= state.promptedScenes.length
  );
}

export function shouldReviewImagesStep(
  state: Pick<
    ProjectState,
    | 'reviewStep'
    | 'approvedThroughIndex'
    | 'promptedScenes'
    | 'imageScenes'
    | 'currentStep'
    | 'failedStep'
  >,
): boolean {
  if (state.reviewStep) {
    return false;
  }

  if (state.approvedThroughIndex >= IMAGES_STEP_ORDER_INDEX) {
    return false;
  }

  if (!isImagesStepComplete(state)) {
    return false;
  }

  return state.currentStep === 'images' || state.failedStep === 'images';
}

export function resolveEffectiveReviewStep(
  state: Pick<
    ProjectState,
    | 'reviewStep'
    | 'approvedThroughIndex'
    | 'promptedScenes'
    | 'imageScenes'
    | 'currentStep'
    | 'failedStep'
  >,
): PipelineStep | null {
  if (state.reviewStep) {
    return state.reviewStep;
  }

  if (shouldReviewImagesStep(state)) {
    return 'images';
  }

  return null;
}



export interface PipelineUiState {

  topic: string;

  storyLanguage: ProjectState['storyLanguage'];

  videoGenerationMode: ProjectState['videoGenerationMode'];

  seriesId: string | null;

  sourceProjectId: string | null;

  knowledgeSourceId: string | null;

  sourceFidelityMode: boolean;

  visualStyle: ProjectState['visualStyle'];

  currentStep: PipelineStep;

  reviewStep: PipelineStep | null;

  idea: string | null;

  story: string | null;

  scriptScenes: ProjectState['scriptScenes'];

  characters: StoryCharacter[];

  castReferenceImagePath: string | null;

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



function countUpscaledScenes(scenes: ProjectState['videoScenes']): number {

  return scenes.filter((scene) => scene.upscaledVideoPath?.trim()).length;

}



export function inferInterruptedStep(state: ProjectState): PipelineStep | null {

  if (state.failedStep) {

    return state.failedStep === ('upscale' as string)
      ? 'videos'
      : state.failedStep;

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

    state.imageScenes.length > 0 &&

    countUpscaledScenes(state.videoScenes) < state.imageScenes.length

  ) {

    return 'videos';

  }



  if (

    countUpscaledScenes(state.videoScenes) === state.videoScenes.length &&

    state.videoScenes.length > 0 &&

    state.audioScenes.length > 0 &&

    state.audioScenes.length < state.videoScenes.length

  ) {

    return 'audio';

  }



  if (

    countUpscaledScenes(state.videoScenes) === state.videoScenes.length &&

    state.videoScenes.length > 0 &&

    state.audioScenes.length === state.videoScenes.length &&

    !state.finalVideoPath?.trim()

  ) {

    return 'assembly';

  }



  return null;

}



export function getResumeProgressLabel(

  step: PipelineStep,

  state: Pick<
    ProjectState,
    | 'scriptScenes'
    | 'promptedScenes'
    | 'imageScenes'
    | 'videoScenes'
    | 'audioScenes'
    | 'finalVideoPath'
  >,

): string | null {

  switch (step) {

    case 'prompts':

      return `${state.promptedScenes.length} of ${state.scriptScenes.length} scene prompts done`;

    case 'images':

      return `${state.imageScenes.length} of ${state.promptedScenes.length} scene images done`;

    case 'videos':

      return `${countUpscaledScenes(state.videoScenes)} of ${state.imageScenes.length} scene videos at 1080p`;

    case 'audio':

      return `${state.audioScenes.length} of ${state.videoScenes.length} scene audio tracks done`;

    case 'assembly':

      return state.finalVideoPath?.trim()
        ? 'Final video assembled'
        : 'Final video not assembled yet';

    default:

      return null;

  }

}



export function serializePipelineState(state: PipelineUiState): ProjectState {

  return {

    topic: state.topic,

    storyLanguage: state.storyLanguage,

    videoGenerationMode: state.videoGenerationMode,

    seriesId: state.seriesId,

    sourceProjectId: state.sourceProjectId ?? null,

    knowledgeSourceId: state.knowledgeSourceId ?? null,

    sourceFidelityMode: state.sourceFidelityMode ?? false,

    visualStyle: state.visualStyle,

    currentStep: state.currentStep,

    reviewStep: state.reviewStep,

    idea: state.idea,

    story: state.story,

    scriptScenes: state.scriptScenes,

    characters: state.characters,

    castReferenceImagePath: state.castReferenceImagePath,

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

