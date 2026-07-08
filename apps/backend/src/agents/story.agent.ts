import { Injectable } from "@nestjs/common";
import type { StoryLanguage } from "../content-state";
import { contentLanguageRule, dialogueLanguageRule } from "../language";
import {
  appendSourceMaterial,
  storyRequirementsWithSource,
  type SourceFidelityContext,
} from "../source-fidelity";
import { QwenService } from "../services/qwen.service";

@Injectable()
export class StoryAgent {
  constructor(private readonly ai: QwenService) {}

  async execute(
    idea: string,
    language: StoryLanguage = "en",
    sourceContext?: SourceFidelityContext,
  ) {
    const languageRules =
      language === "hi"
        ? `${contentLanguageRule()}\n${dialogueLanguageRule(language)}\n- When characters speak in the story, write their quoted dialogue in Hindi (Devanagari); keep all narrative prose in English.`
        : contentLanguageRule();

    const requirements = sourceContext
      ? storyRequirementsWithSource()
      : `Requirements:
- 400 words
- strong hook
- emotional tension
- twist ending
- Include every distinct named character required by the idea; there is no upper limit
- Characters must speak to each other through natural dialogue (not only narration)
- Give each character a clear voice and personality`;

    const prompt = appendSourceMaterial(
      `Write a highly engaging story with named characters who talk to each other.
${requirements}
${languageRules}
Idea:${idea}
`,
      sourceContext,
    );

    return this.ai.generate(prompt);
  }
}
