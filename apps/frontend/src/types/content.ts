export type StoryLanguage = 'en' | 'hi';

export type VideoGenerationMode = 'local' | 'professional';

export interface SceneScript {
  sceneNumber: number;
  narration: string;
  visualDescription: string;
  duration: number;
  imagePrompt?: string;
  videoPrompt?: string;
  characterAppearance?: string;
  imagePath?: string;
  videoPath?: string;
  upscaledVideoPath?: string;
  audioPath?: string;
}

export interface GenerateIdeaRequest {
  topic: string;
  storyLanguage?: StoryLanguage;
}

export interface GenerateIdeaResponse {
  idea: string;
}

export interface GenerateStoryRequest {
  idea: string;
  storyLanguage?: StoryLanguage;
}

export interface GenerateStoryResponse {
  story: string;
}

export interface GenerateScriptRequest {
  story: string;
  storyLanguage?: StoryLanguage;
}

export interface GenerateScriptResponse {
  script: SceneScript[];
}

export interface GenerateCharacterProfileRequest {
  story: string;
  script: SceneScript[];
  storyLanguage?: StoryLanguage;
}

export interface GenerateCharacterProfileResponse {
  characterAppearance: string;
}

export interface GeneratePromptRequest {
  scene: SceneScript;
  characterAppearance: string;
  videoMode?: VideoGenerationMode;
  storyLanguage?: StoryLanguage;
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
  | 'images'
  | 'videos'
  | 'audio'
  | 'assembly'
  | 'complete';

export interface UpscaleVideoRequest {
  scene: SceneScript;
}

export interface UpscaleVideoResponse {
  scene: SceneScript;
}

export interface GenerateAudioRequest {
  scene: SceneScript;
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
