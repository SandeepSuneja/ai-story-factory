import { Injectable } from "@nestjs/common";
import { OpenAIService } from "../services/openai.service";

@Injectable()
export class StoryAgent {
  constructor(private readonly ai: OpenAIService) {}

  async execute(idea: string) {
    const prompt = `Write a highly engaging story.
Requirements:
- 400 words
- strong hook
- emotional tension
- twist ending
Idea:${idea}
`;

    return this.ai.generate(prompt);
  }
}
