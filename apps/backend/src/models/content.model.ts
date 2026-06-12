import type { SceneScript } from "../content-state";

export class GenerateContentRequestDto {
  topic: string;
}

export class GenerateContentResponseDto {
  idea: string;
  story: string;
  script: SceneScript[];
}
