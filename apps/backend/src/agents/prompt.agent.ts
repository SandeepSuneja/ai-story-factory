import { Injectable } from "@nestjs/common";
import { SceneScript } from "../content-state";
import { OpenAIService } from "../services/openai.service";

@Injectable()
export class PromptAgent {
  constructor(private readonly ai: OpenAIService) {}

  async execute(scene: SceneScript) {
    const prompt = `
Create a cinematic AI video prompt.

Requirements:
- Vertical 9:16
- Realistic
- Ultra detailed
- Consistent character
- Dramatic lighting

Scene:
${scene.visualDescription}

Return only prompt.
`;

    return this.ai.generate(prompt);
  }
}
