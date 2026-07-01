import { Injectable } from "@nestjs/common";
import { SceneScript } from "../content-state";
import { QwenService } from "../services/qwen.service";

@Injectable()
export class PromptAgent {
  constructor(private readonly ai: QwenService) {}

  async execute(scene: SceneScript, characterAppearance: string) {
    const prompt = `
Create a short cinematic motion prompt for CogVideoX image-to-video generation.

Requirements:
- Maximum 180 words (226 tokens for CogVideoX)
- Do NOT describe character appearance — the input image already shows the character
- Focus on camera movement, subject motion, lighting changes, atmosphere, and mood
- Horizontal 3:2 framing (720x480, matches video output)
- One continuous shot, smooth natural motion
- Ultra detailed lighting and atmosphere only

Character appearance (for context only — do not repeat in output):
${characterAppearance}

Scene narration:
${scene.narration}

Scene visual:
${scene.visualDescription}

Return only the motion prompt, under 180 words.
`;

    return this.ai.generate(prompt);
  }
}
