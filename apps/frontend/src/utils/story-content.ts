import type { SceneScript } from '../types/content';
import type { ProjectState } from '../types/project';
import { mergeVisualStyle } from '../types/series';

const CHARACTER_STEP_INDEX = 3;

export function stripSceneMedia(scene: SceneScript): SceneScript {
  return {
    ...scene,
    imagePath: undefined,
    videoPath: undefined,
    upscaledVideoPath: undefined,
    audioPath: undefined,
    subtitleCues: undefined,
    dialogueSegments: undefined,
  };
}

export function hasReusableStoryContent(state: Pick<
  ProjectState,
  'idea' | 'story' | 'scriptScenes' | 'characters' | 'promptedScenes'
>): boolean {
  return Boolean(
    state.idea?.trim() &&
      state.story?.trim() &&
      state.scriptScenes.length > 0 &&
      state.characters.length > 0,
  );
}

export function buildVideoVariantState(
  source: ProjectState,
  sourceProjectId: string,
): Partial<ProjectState> {
  return {
    topic: source.topic,
    storyLanguage: source.storyLanguage,
    videoGenerationMode: source.videoGenerationMode,
    seriesId: source.seriesId ?? null,
    sourceProjectId,
    idea: source.idea,
    story: source.story,
    scriptScenes: source.scriptScenes.map(stripSceneMedia),
    characters: source.characters,
    promptedScenes: [],
    visualStyle: mergeVisualStyle(),
    currentStep: 'visual',
    reviewStep: 'visual',
    approvedThroughIndex: CHARACTER_STEP_INDEX,
    imageScenes: [],
    videoScenes: [],
    audioScenes: [],
    finalVideoPath: null,
    failedStep: null,
    pipelineError: null,
    expandedSteps: {
      1: true,
      2: true,
      3: true,
      4: true,
      5: true,
      6: false,
      7: false,
      8: false,
      9: false,
      10: false,
    },
  };
}
