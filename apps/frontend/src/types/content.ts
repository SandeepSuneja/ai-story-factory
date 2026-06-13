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
  audioPath?: string;
}

export interface GenerateIdeaRequest {
  topic: string;
}

export interface GenerateIdeaResponse {
  idea: string;
}

export interface GenerateStoryRequest {
  idea: string;
}

export interface GenerateStoryResponse {
  story: string;
}

export interface GenerateScriptRequest {
  story: string;
}

export interface GenerateScriptResponse {
  script: SceneScript[];
}

export interface GenerateCharacterProfileRequest {
  story: string;
  script: SceneScript[];
}

export interface GenerateCharacterProfileResponse {
  characterAppearance: string;
}

export interface GeneratePromptRequest {
  scene: SceneScript;
  characterAppearance: string;
}

export interface GeneratePromptResponse {
  scene: SceneScript;
}

export interface GenerateImageRequest {
  scene: SceneScript;
}

export interface GenerateImageResponse {
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
  | 'complete';
