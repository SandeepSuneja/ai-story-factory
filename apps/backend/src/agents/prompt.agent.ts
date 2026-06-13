import { Injectable } from "@nestjs/common";
import { SceneScript } from "../content-state";
import { OpenAIService } from "../services/openai.service";

@Injectable()
export class PromptAgent {
  constructor(private readonly ai: OpenAIService) {}

  async execute(scene: SceneScript, characterAppearance: string) {
    const prompt = `
Create a cinematic AI video prompt for this scene.

Requirements:
- Vertical 9:16
- Realistic
- Ultra detailed
- Dramatic lighting
- Use the exact character appearance in every scene

Character appearance:
${characterAppearance}

Scene narration:
${scene.narration}

Scene visual:
${scene.visualDescription}

Return only the video prompt.
`;

    return this.ai.generate(prompt);
  }
}
