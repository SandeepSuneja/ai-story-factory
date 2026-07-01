import { Injectable } from '@nestjs/common';
import { AssemblyAgent } from './agents/assembly.agent';
import { AudioAgent } from './agents/audio.agent';
import { CharacterAgent } from './agents/character.agent';
import { IdeaAgent } from './agents/idea.agent';
import { ImageAgent } from './agents/image.agent';
import { PromptAgent } from './agents/prompt.agent';
import { ScriptAgent } from './agents/script.agent';
import { VideoAgent } from './agents/video.agent';
import { StoryAgent } from './agents/story.agent';
import type { SceneScript } from './content-state';
import {
  GenerateCharacterProfileResponseDto,
  GenerateIdeaResponseDto,
  GenerateImageResponseDto,
  GeneratePromptResponseDto,
  GenerateScriptResponseDto,
  GenerateStoryResponseDto,
  GenerateVideoResponseDto,
  AssembleVideoResponseDto,
  GenerateAudioResponseDto,
} from './models/content.model';

@Injectable()
export class AppService {
  constructor(
    private readonly ideaAgent: IdeaAgent,
    private readonly storyAgent: StoryAgent,
    private readonly scriptAgent: ScriptAgent,
    private readonly characterAgent: CharacterAgent,
    private readonly promptAgent: PromptAgent,
    private readonly imageAgent: ImageAgent,
    private readonly videoAgent: VideoAgent,
    private readonly audioAgent: AudioAgent,
    private readonly assemblyAgent: AssemblyAgent,
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

  async generateImage(scene: SceneScript): Promise<GenerateImageResponseDto> {
    return {
      scene: await this.imageAgent.execute(scene),
    };
  }

  async generateVideo(scene: SceneScript): Promise<GenerateVideoResponseDto> {
    return {
      scene: await this.videoAgent.execute(scene),
    };
  }

  async generateAudio(scene: SceneScript): Promise<GenerateAudioResponseDto> {
    return {
      scene: await this.audioAgent.execute(scene),
    };
  }

  async assembleVideo(
    scenes: SceneScript[],
    projectName?: string,
  ): Promise<AssembleVideoResponseDto> {
    return {
      finalVideoPath: await this.assemblyAgent.execute(scenes, projectName),
    };
  }
}
