import { Injectable } from "@nestjs/common";
import { OpenAIService } from "../services/openai.service";

@Injectable()
export class IdeaAgent {
  constructor(private readonly ai: OpenAIService) {}

  async execute(topic: string) {
    const prompt = `Generate one viral short-video story idea.
Topic: ${topic}.
Return only the idea.
`;

    return this.ai.generate(prompt);
  }
}
