import { Injectable } from '@nestjs/common';

import { AudioAgent } from './agents/audio.agent';

import { CharacterAgent } from './agents/character.agent';

import { IdeaAgent } from './agents/idea.agent';

import { ImageAgent } from './agents/image.agent';

import { PromptAgent } from './agents/prompt.agent';

import { ScriptAgent } from './agents/script.agent';

import { StoryAgent } from './agents/story.agent';

import { UpscaleAgent } from './agents/upscale.agent';
import { AssemblyAgent } from './agents/assembly.agent';

import { VideoJobService } from './services/video-job.service';
import { ImageJobService } from './services/image-job.service';

import type { SceneScript, StoryLanguage, VideoGenerationMode } from './content-state';

import { normalizeStoryLanguage } from './language';

import {

  GenerateCharacterProfileResponseDto,

  GenerateIdeaResponseDto,

  GenerateImageResponseDto,

  GeneratePromptResponseDto,

  GenerateScriptResponseDto,

  GenerateStoryResponseDto,

  StartVideoJobResponseDto,

  StartImageJobResponseDto,

  ImageJobStatusResponseDto,

  UpscaleVideoResponseDto,

  VideoJobStatusResponseDto,

  GenerateAudioResponseDto,
  AssembleVideoResponseDto,
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

    private readonly videoJobService: VideoJobService,

    private readonly imageJobService: ImageJobService,

    private readonly upscaleAgent: UpscaleAgent,

    private readonly assemblyAgent: AssemblyAgent,

    private readonly audioAgent: AudioAgent,

  ) {}



  getHello(): string {

    return 'Hello World!';

  }



  async generateIdea(

    topic: string,

    storyLanguage?: StoryLanguage,

  ): Promise<GenerateIdeaResponseDto> {

    const language = normalizeStoryLanguage(storyLanguage);

    return { idea: await this.ideaAgent.execute(topic, language) };

  }



  async generateStory(

    idea: string,

    storyLanguage?: StoryLanguage,

  ): Promise<GenerateStoryResponseDto> {

    const language = normalizeStoryLanguage(storyLanguage);

    return { story: await this.storyAgent.execute(idea, language) };

  }



  async generateScript(

    story: string,

    storyLanguage?: StoryLanguage,

  ): Promise<GenerateScriptResponseDto> {

    const language = normalizeStoryLanguage(storyLanguage);

    return { script: await this.scriptAgent.execute(story, language) };

  }



  async generateCharacterProfile(

    story: string,

    script: SceneScript[],

    storyLanguage?: StoryLanguage,

  ): Promise<GenerateCharacterProfileResponseDto> {

    const language = normalizeStoryLanguage(storyLanguage);

    return {

      characterAppearance: await this.characterAgent.executeProfile(

        story,

        script,

        language,

      ),

    };

  }



  async generatePrompt(

    scene: SceneScript,

    characterAppearance: string,

    videoMode: VideoGenerationMode = 'local',

    storyLanguage?: StoryLanguage,

  ): Promise<GeneratePromptResponseDto> {

    const language = normalizeStoryLanguage(storyLanguage);

    const { imagePrompt, videoPrompt } = await this.promptAgent.execute(

      scene,

      characterAppearance,

      videoMode,

      language,

    );



    return {

      scene: {

        ...scene,

        characterAppearance,

        imagePrompt,

        videoPrompt,

      },

    };

  }



  async generateImage(scene: SceneScript): Promise<GenerateImageResponseDto> {

    return {

      scene: await this.imageAgent.execute(scene),

    };

  }



  startImageJob(scene: SceneScript): StartImageJobResponseDto {

    const job = this.imageJobService.start(scene);

    return {

      jobId: job.id,

      status: job.status,

      sceneNumber: job.sceneNumber,

    };

  }



  getImageJob(jobId: string): ImageJobStatusResponseDto {

    const job = this.imageJobService.get(jobId);

    return {

      id: job.id,

      status: job.status,

      sceneNumber: job.sceneNumber,

      scene: job.scene,

      error: job.error,

    };

  }



  startVideoJob(scene: SceneScript): StartVideoJobResponseDto {

    const job = this.videoJobService.start(scene);

    return {

      jobId: job.id,

      status: job.status,

      sceneNumber: job.sceneNumber,

    };

  }



  getVideoJob(jobId: string): VideoJobStatusResponseDto {

    const job = this.videoJobService.get(jobId);

    return {

      id: job.id,

      status: job.status,

      sceneNumber: job.sceneNumber,

      scene: job.scene,

      error: job.error,

    };

  }



  async upscaleVideo(scene: SceneScript): Promise<UpscaleVideoResponseDto> {

    return {

      scene: await this.upscaleAgent.execute(scene),

    };

  }



  async generateAudio(

    scene: SceneScript,

    storyLanguage?: StoryLanguage,

  ): Promise<GenerateAudioResponseDto> {

    const language = normalizeStoryLanguage(storyLanguage);

    return {

      scene: await this.audioAgent.execute(scene, language),

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


