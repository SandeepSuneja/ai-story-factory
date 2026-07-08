import type { SeriesVisualStyle } from './series';

export type StoryLanguage = 'en' | 'hi';

export type VideoGenerationMode = 'local' | 'professional';

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
  referenceImagePath?: string;
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
  /** @deprecated Legacy single-character field */
  characterAppearance?: string;
  imagePath?: string;
  videoPath?: string;
  upscaledVideoPath?: string;
  audioPath?: string;
  subtitleCues?: SubtitleCue[];
  dialogueSegments?: DialogueSegment[];
}

export interface GenerateIdeaRequest {
  topic: string;
  storyLanguage?: StoryLanguage;
  knowledgeSourceId?: string | null;
  sourceFidelityMode?: boolean;
}

export interface GenerateIdeaResponse {
  idea: string;
}

export interface GenerateStoryRequest {
  idea: string;
  storyLanguage?: StoryLanguage;
  knowledgeSourceId?: string | null;
  sourceFidelityMode?: boolean;
}

export interface GenerateStoryResponse {
  story: string;
}

export interface GenerateScriptRequest {
  story: string;
  storyLanguage?: StoryLanguage;
  knowledgeSourceId?: string | null;
  sourceFidelityMode?: boolean;
}

export interface GenerateScriptResponse {
  script: SceneScript[];
}

export interface GenerateCharacterProfileRequest {
  story: string;
  script: SceneScript[];
  storyLanguage?: StoryLanguage;
  seriesId?: string | null;
  visualStyle?: SeriesVisualStyle;
  knowledgeSourceId?: string | null;
  sourceFidelityMode?: boolean;
}

export interface GenerateCharacterProfileResponse {
  characters: StoryCharacter[];
  script: SceneScript[];
  reusedCharacters: string[];
  newCharacters: StoryCharacter[];
  castReferenceImagePath?: string;
}

export interface GeneratePromptRequest {
  scene: SceneScript;
  characters: StoryCharacter[];
  videoMode?: VideoGenerationMode;
  storyLanguage?: StoryLanguage;
  visualStyle?: SeriesVisualStyle;
  knowledgeSourceId?: string | null;
  sourceFidelityMode?: boolean;
}

export interface UploadVideoResponse {
  filename: string;
  videoPath: string;
}

export interface GeneratePromptResponse {
  scene: SceneScript;
}

export interface GenerateImageRequest {
  scene: SceneScript;
  visualStyle?: SeriesVisualStyle;
  characters?: StoryCharacter[];
  castReferenceImagePath?: string;
}

export interface EnsureCharacterPortraitsRequest {
  characters: StoryCharacter[];
  visualStyle?: SeriesVisualStyle;
  seriesId?: string | null;
}

export interface EnsureCharacterPortraitsResponse {
  characters: StoryCharacter[];
  castReferenceImagePath?: string;
}

export interface StartImageJobResponse {
  jobId: string;
  status: string;
  sceneNumber: number;
}

export interface ImageJobStatusResponse {
  id: string;
  status: string;
  sceneNumber: number;
  scene?: SceneScript;
  error?: string;
}

export interface GenerateImageResponse {
  scene: SceneScript;
}

export interface GenerateVideoRequest {
  scene: SceneScript;
  visualStyle?: SeriesVisualStyle;
}

export interface StartVideoJobResponse {
  jobId: string;
  status: string;
  sceneNumber: number;
}

export interface VideoJobStatusResponse {
  id: string;
  status: string;
  sceneNumber: number;
  scene?: SceneScript;
  error?: string;
}

export interface GenerateVideoResponse {
  scene: SceneScript;
}

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

export interface UpscaleVideoRequest {
  scene: SceneScript;
  visualStyle?: SeriesVisualStyle;
}

export interface UpscaleVideoResponse {
  scene: SceneScript;
}

export interface GenerateAudioRequest {
  scene: SceneScript;
  characters: StoryCharacter[];
  storyLanguage?: StoryLanguage;
}

export interface GenerateAudioResponse {
  scene: SceneScript;
}

export interface AssembleVideoRequest {
  scenes: SceneScript[];
  projectName?: string;
}

export interface AssembleVideoResponse {
  finalVideoPath: string;
}
