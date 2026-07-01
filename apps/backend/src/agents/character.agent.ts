import { Injectable } from "@nestjs/common";
import type { SceneScript } from "../content-state";
import { QwenService } from "../services/qwen.service";

@Injectable()
export class CharacterAgent {
  constructor(private readonly ai: QwenService) {}

  async executeProfile(story: string, script: SceneScript[]) {
    const scenesSummary = script
      .map(
        (scene) =>
          `Scene ${scene.sceneNumber}: ${scene.visualDescription} (${scene.narration})`,
      )
      .join("\n");

    const prompt = `
Read the story and script scenes, then define one main character's uniform visual appearance.

Requirements:
- One consistent character only
- Age, gender, ethnicity, face, hair, outfit, accessories
- Distinctive traits that stay the same in every scene
- Must fit the story and all script scenes
- Suitable for AI image and video generation
- 80-120 words

Return only the character appearance description.

Story:
${story}

Script scenes:
${scenesSummary}
`;

    return this.ai.generate(prompt);
  }
}
