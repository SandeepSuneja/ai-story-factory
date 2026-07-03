import { Injectable } from "@nestjs/common";
import type { StoryLanguage } from "../content-state";
import { languageOutputRule } from "../language";
import { QwenService } from "../services/qwen.service";

@Injectable()
export class StoryAgent {
  constructor(private readonly ai: QwenService) {}

  async execute(idea: string, language: StoryLanguage = "en") {
    const prompt = `Write a highly engaging story.
Requirements:
- 400 words
- strong hook
- emotional tension
- twist ending
${languageOutputRule(language)}
Idea:${idea}
`;

    return this.ai.generate(prompt);
  }
}
