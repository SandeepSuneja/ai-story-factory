import type { SceneScript } from "../content-state";

export class GenerateIdeaRequestDto {
  topic: string;
}

export class GenerateIdeaResponseDto {
  idea: string;
}

export class GenerateStoryRequestDto {
  idea: string;
}

export class GenerateStoryResponseDto {
  story: string;
}

export class GenerateScriptRequestDto {
  story: string;
}

export class GenerateScriptResponseDto {
  script: SceneScript[];
}

export class GenerateCharacterProfileRequestDto {
  story: string;
  script: SceneScript[];
}

export class GenerateCharacterProfileResponseDto {
  characterAppearance: string;
}

export class GeneratePromptRequestDto {
  scene: SceneScript;
  characterAppearance: string;
}

export class GeneratePromptResponseDto {
  scene: SceneScript;
}

export class GenerateImageRequestDto {
  scene: SceneScript;
}

export class GenerateImageResponseDto {
  scene: SceneScript;
}

export class GenerateVideoRequestDto {
  scene: SceneScript;
}

export class GenerateVideoResponseDto {
  scene: SceneScript;
}

export class GenerateAudioRequestDto {
  scene: SceneScript;
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
