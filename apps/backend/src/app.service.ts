import { Injectable } from '@nestjs/common';
import { CharacterAgent } from './agents/character.agent';
import { IdeaAgent } from './agents/idea.agent';
import { PromptAgent } from './agents/prompt.agent';
import { ScriptAgent } from './agents/script.agent';
import { StoryAgent } from './agents/story.agent';
import type { SceneScript } from './content-state';
import {
  GenerateCharacterProfileResponseDto,
  GenerateIdeaResponseDto,
  GeneratePromptResponseDto,
  GenerateScriptResponseDto,
  GenerateStoryResponseDto,
} from './models/content.model';

@Injectable()
export class AppService {
  constructor(
    private readonly ideaAgent: IdeaAgent,
    private readonly storyAgent: StoryAgent,
    private readonly scriptAgent: ScriptAgent,
    private readonly characterAgent: CharacterAgent,
    private readonly promptAgent: PromptAgent,
  ) {}

  getHello(): string {
    return 'Hello World!';
  }

  async generateIdea(topic: string): Promise<GenerateIdeaResponseDto> {
    return { idea: await this.ideaAgent.execute(topic) };
  }

  async generateStory(idea: string): Promise<GenerateStoryResponseDto> {
    return { story: await this.storyAgent.execute(idea) };
  }

  async generateScript(story: string): Promise<GenerateScriptResponseDto> {
    return { script: await this.scriptAgent.execute(story) };
  }

  async generateCharacterProfile(
    story: string,
    script: SceneScript[],
  ): Promise<GenerateCharacterProfileResponseDto> {
    return {
      characterAppearance: await this.characterAgent.executeProfile(story, script),
    };
  }

  async generatePrompt(
    scene: SceneScript,
    characterAppearance: string,
  ): Promise<GeneratePromptResponseDto> {
    const videoPrompt = await this.promptAgent.execute(scene, characterAppearance);

    return {
      scene: {
        ...scene,
        characterAppearance,
        videoPrompt,
      },
    };
  }
}
