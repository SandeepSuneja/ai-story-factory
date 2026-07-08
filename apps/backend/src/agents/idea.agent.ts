import { Injectable } from "@nestjs/common";
import type { StoryLanguage } from "../content-state";
import { contentLanguageRule } from "../language";
import {
  appendSourceMaterial,
  ideaInstructionsWithSource,
  type SourceFidelityContext,
} from "../source-fidelity";
import { QwenService } from "../services/qwen.service";

@Injectable()
export class IdeaAgent {
  constructor(private readonly ai: QwenService) {}

  async execute(
    topic: string,
    language: StoryLanguage = "en",
    sourceContext?: SourceFidelityContext,
  ) {
    const instructions = sourceContext
      ? ideaInstructionsWithSource()
      : "Generate one viral short-video story idea.";

    const prompt = appendSourceMaterial(
      `${instructions}
Topic: ${topic}.
${contentLanguageRule()}
Return only the idea.`,
      sourceContext,
    );

    return this.ai.generate(prompt);
  }
}
