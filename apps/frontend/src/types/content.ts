export interface SceneScript {
  sceneNumber: number;
  narration: string;
  visualDescription: string;
  duration: number;
  imagePrompt?: string;
  videoPrompt?: string;
  imagePath?: string;
  videoPath?: string;
  audioPath?: string;
}

export interface GenerateContentRequest {
  topic: string;
}

export interface GenerateContentResponse {
  idea: string;
  story: string;
  script: SceneScript[];
}
