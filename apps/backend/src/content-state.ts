export type StoryLanguage = 'en' | 'hi';

export type VideoGenerationMode = 'local' | 'professional';

export type PipelineStep =
  | 'topic'
  | 'idea'
  | 'story'
  | 'script'
  | 'character'
  | 'prompts'
  | 'visual'
  | 'images'
  | 'videos'
  | 'audio'
  | 'assembly'
  | 'complete';

export interface DialogueLine {
  characterId: string;
  speaker?: string;
  text: string;
}

export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

export interface DialogueSegment {
  characterId?: string;
  speaker: string;
  text: string;
  voice: string;
  start: number;
  end: number;
}

export interface StoryCharacter {
  id: string;
  name: string;
  role: string;
  appearance: string;
  voice: string;
  /** Canonical portrait used as a visual reference for scene image generation */
  referenceImagePath?: string;
  /** Prompt for external image tools (Midjourney, Kling, etc.) when using professional mode */
  portraitPrompt?: string;
  /** Locked visual tag captured when the portrait was generated (source of truth for scenes) */
  visualIdentityTag?: string;
  /** SDXL LoRA trained from the approved portrait (Tier C) */
  loraPath?: string;
}

export type SeriesOrientation = 'landscape' | 'portrait';

export type AnimationStyle = '2d' | '3d';

export interface SeriesVisualStyle {
  orientation: SeriesOrientation;
  animationStyle: AnimationStyle;
  framing: string;
  colorPalette: string;
  artDirection: string;
}

export interface SceneScript {
  sceneNumber: number;
  narration: string;
  visualDescription: string;
  duration: number;
  dialogue?: DialogueLine[];
  presentCharacterIds?: string[];
  imagePrompt?: string;
  videoPrompt?: string;
  /** @deprecated Legacy single-character field; use project-level characters instead */
  characterAppearance?: string;
  imagePath?: string;
  videoPath?: string;
  upscaledVideoPath?: string;
  audioPath?: string;
  subtitleCues?: SubtitleCue[];
  dialogueSegments?: DialogueSegment[];
}
