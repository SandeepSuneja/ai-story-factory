import { Injectable } from "@nestjs/common";
import type { StoryLanguage } from "../content-state";
import { contentLanguageRule, dialogueLanguageRule } from "../language";
import { QwenService } from "../services/qwen.service";

@Injectable()
export class StoryAgent {
  constructor(private readonly ai: QwenService) {}

  async execute(idea: string, language: StoryLanguage = "en") {
    const languageRules =
      language === "hi"
        ? `${contentLanguageRule()}\n${dialogueLanguageRule(language)}\n- When characters speak in the story, write their quoted dialogue in Hindi (Devanagari); keep all narrative prose in English.`
        : contentLanguageRule();

    const prompt = `Write a highly engaging story with named characters who talk to each other.
Requirements:
- 400 words
- strong hook
- emotional tension
- twist ending
- Include 2 to 4 distinct named characters
- Characters must speak to each other through natural dialogue (not only narration)
- Give each character a clear voice and personality
${languageRules}
Idea:${idea}
`;

    return this.ai.generate(prompt);
  }
}
