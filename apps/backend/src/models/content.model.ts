import type { SceneScript, StoryCharacter, StoryLanguage, SeriesVisualStyle, VideoGenerationMode } from "../content-state";

export class GenerateIdeaRequestDto {
  topic: string;
  storyLanguage?: StoryLanguage;
  knowledgeSourceId?: string | null;
  sourceFidelityMode?: boolean;
}

export class GenerateIdeaResponseDto {
  idea: string;
}

export class GenerateStoryRequestDto {
  idea: string;
  storyLanguage?: StoryLanguage;
  knowledgeSourceId?: string | null;
  sourceFidelityMode?: boolean;
}

export class GenerateStoryResponseDto {
  story: string;
}

export class GenerateScriptRequestDto {
  story: string;
  storyLanguage?: StoryLanguage;
  knowledgeSourceId?: string | null;
  sourceFidelityMode?: boolean;
  videoMode?: VideoGenerationMode;
}

export class GenerateScriptResponseDto {
  script: SceneScript[];
}

export class GenerateCharacterProfileRequestDto {
  story: string;
  script: SceneScript[];
  storyLanguage?: StoryLanguage;
  seriesId?: string | null;
  existingCharacters?: StoryCharacter[];
  visualStyle?: SeriesVisualStyle;
  knowledgeSourceId?: string | null;
  sourceFidelityMode?: boolean;
  videoMode?: VideoGenerationMode;
}

export class GenerateCharacterProfileResponseDto {
  characters: StoryCharacter[];
  script: SceneScript[];
  reusedCharacters: string[];
  newCharacters: StoryCharacter[];
  castReferenceImagePath?: string;
}

export class GeneratePromptRequestDto {
  scene: SceneScript;
  characters: StoryCharacter[];
  videoMode?: VideoGenerationMode;
  storyLanguage?: StoryLanguage;
  visualStyle?: SeriesVisualStyle;
  knowledgeSourceId?: string | null;
  sourceFidelityMode?: boolean;
}

export class UploadVideoResponseDto {
  filename: string;
  videoPath: string;
}

export class UploadImageResponseDto {
  filename: string;
  imagePath: string;
}

export class GeneratePromptResponseDto {
  scene: SceneScript;
}

export class GenerateImageRequestDto {
  scene: SceneScript;
  visualStyle?: SeriesVisualStyle;
  characters?: StoryCharacter[];
  castReferenceImagePath?: string;
  masterSceneImagePath?: string;
  /** Fresh random seed so regenerate does not repeat the prior image. */
  regenerate?: boolean;
}

export class EnsureCharacterPortraitsRequestDto {
  characters: StoryCharacter[];
  visualStyle?: SeriesVisualStyle;
  seriesId?: string | null;
}

export class EnsureCharacterPortraitsResponseDto {
  characters: StoryCharacter[];
  castReferenceImagePath?: string;
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
  visualStyle?: SeriesVisualStyle;
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
  visualStyle?: SeriesVisualStyle;
}

export class UpscaleVideoResponseDto {
  scene: SceneScript;
}

export class GenerateAudioRequestDto {
  scene: SceneScript;
  characters: StoryCharacter[];
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
