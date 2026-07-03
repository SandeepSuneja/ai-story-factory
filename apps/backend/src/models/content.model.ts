import type { SceneScript, StoryLanguage, VideoGenerationMode } from "../content-state";

export class GenerateIdeaRequestDto {
  topic: string;
  storyLanguage?: StoryLanguage;
}

export class GenerateIdeaResponseDto {
  idea: string;
}

export class GenerateStoryRequestDto {
  idea: string;
  storyLanguage?: StoryLanguage;
}

export class GenerateStoryResponseDto {
  story: string;
}

export class GenerateScriptRequestDto {
  story: string;
  storyLanguage?: StoryLanguage;
}

export class GenerateScriptResponseDto {
  script: SceneScript[];
}

export class GenerateCharacterProfileRequestDto {
  story: string;
  script: SceneScript[];
  storyLanguage?: StoryLanguage;
}

export class GenerateCharacterProfileResponseDto {
  characterAppearance: string;
}

export class GeneratePromptRequestDto {
  scene: SceneScript;
  characterAppearance: string;
  videoMode?: VideoGenerationMode;
  storyLanguage?: StoryLanguage;
}

export class UploadVideoResponseDto {
  filename: string;
  videoPath: string;
}

export class GeneratePromptResponseDto {
  scene: SceneScript;
}

export class GenerateImageRequestDto {
  scene: SceneScript;
}

export class StartImageJobResponseDto {
  jobId: string;
  status: string;
  sceneNumber: number;
}

export class ImageJobStatusResponseDto {
  id: string;
  status: string;
  sceneNumber: number;
  scene?: SceneScript;
  error?: string;
}

export class GenerateImageResponseDto {
  scene: SceneScript;
}

export class GenerateVideoRequestDto {
  scene: SceneScript;
}

export class StartVideoJobResponseDto {
  jobId: string;
  status: string;
  sceneNumber: number;
}

export class VideoJobStatusResponseDto {
  id: string;
  status: string;
  sceneNumber: number;
  scene?: SceneScript;
  error?: string;
}

export class GenerateVideoResponseDto {
  scene: SceneScript;
}

export class UpscaleVideoRequestDto {
  scene: SceneScript;
}

export class UpscaleVideoResponseDto {
  scene: SceneScript;
}

export class GenerateAudioRequestDto {
  scene: SceneScript;
  storyLanguage?: StoryLanguage;
}

export class GenerateAudioResponseDto {
  scene: SceneScript;
}

export class AssembleVideoRequestDto {
  scenes: SceneScript[];
  projectName?: string;
}

export class AssembleVideoResponseDto {
  finalVideoPath: string;
}
