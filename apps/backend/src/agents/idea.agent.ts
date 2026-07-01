import { Injectable } from "@nestjs/common";
import { QwenService } from "../services/qwen.service";

@Injectable()
export class IdeaAgent {
  constructor(private readonly ai: QwenService) {}

  async execute(topic: string) {
    const prompt = `Generate one viral short-video story idea.
Topic: ${topic}.
Return only the idea.
`;

    return this.ai.generate(prompt);
  }
}
