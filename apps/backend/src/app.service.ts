import { Injectable } from '@nestjs/common';
import { PromptAgent } from './agents/prompt.agent';
import type { SceneScript } from './content-state';
import { contentGraph } from './graphs/content.graph';
import { GenerateContentResponseDto } from './models/content.model';

@Injectable()
export class AppService {
  constructor(private readonly promptAgent: PromptAgent) {}

  getHello(): string {
    return 'Hello World!';
  }

  async generate(topic: string): Promise<GenerateContentResponseDto> {
    const result = await contentGraph.invoke({ topic });
    const script = await this.generatePrompts(result.script!);

    return {
      idea: result.idea!,
      story: result.story!,
      script,
    };
  }

  async generatePrompts(scenes: SceneScript[]): Promise<SceneScript[]> {
    const updated: SceneScript[] = [];

    for (const scene of scenes) {
      const prompt = await this.promptAgent.execute(scene);

      updated.push({
        ...scene,
        videoPrompt: prompt,
      });
    }

    return updated;
  }
}
