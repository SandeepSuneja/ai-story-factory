import { Injectable } from "@nestjs/common";
import type { StoryLanguage } from "../content-state";
import { contentLanguageRule } from "../language";
import { QwenService } from "../services/qwen.service";

@Injectable()
export class IdeaAgent {
  constructor(private readonly ai: QwenService) {}

  async execute(topic: string, language: StoryLanguage = "en") {
    const prompt = `Generate one viral short-video story idea.
Topic: ${topic}.
${contentLanguageRule()}
Return only the idea.
`;

    return this.ai.generate(prompt);
  }
}
