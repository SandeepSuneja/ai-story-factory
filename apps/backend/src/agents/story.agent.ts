import { Injectable } from "@nestjs/common";
import type { StoryLanguage } from "../content-state";
import { contentLanguageRule } from "../language";
import {
  appendSourceMaterial,
  storyRequirementsWithSource,
  type SourceFidelityContext,
} from "../source-fidelity";
import { QwenService } from "../services/qwen.service";

const STORY_MAX_TOKENS = 16384;

@Injectable()
export class StoryAgent {
  constructor(private readonly ai: QwenService) {}

  async execute(
    idea: string,
    _language: StoryLanguage = "en",
    sourceContext?: SourceFidelityContext,
  ) {
    const requirements = sourceContext
      ? storyRequirementsWithSource()
      : `Requirements:
- No word limit — tell the full story with complete coverage
- strong hook
- emotional tension
- twist ending
- Include every distinct named character required by the idea; there is no upper limit
- Characters must speak to each other through natural dialogue (not only narration)
- Give each character a clear voice and personality`;

    const prompt = appendSourceMaterial(
      `Write a highly engaging story with named characters who talk to each other.
${requirements}
${contentLanguageRule()}
Idea:${idea}
`,
      sourceContext,
    );

    return this.ai.generate(prompt, { maxTokens: STORY_MAX_TOKENS });
  }
}
