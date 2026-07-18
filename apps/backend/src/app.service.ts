import { Injectable } from '@nestjs/common';

import { AudioAgent } from './agents/audio.agent';

import { CharacterAgent } from './agents/character.agent';

import { IdeaAgent } from './agents/idea.agent';

import { ImageAgent } from './agents/image.agent';

import { buildProfessionalPortraitPrompt, PromptAgent } from './agents/prompt.agent';

import { ScriptAgent } from './agents/script.agent';

import { StoryAgent } from './agents/story.agent';

import { UpscaleAgent } from './agents/upscale.agent';
import { AssemblyAgent } from './agents/assembly.agent';

import { VideoJobService } from './services/video-job.service';
import { ImageJobService } from './services/image-job.service';
import { CharacterPortraitService } from './services/character-portrait.service';
import { CastSheetService } from './services/cast-sheet.service';
import { CharacterLoraService } from './services/character-lora.service';
import {
  shouldBuildCastSheet,
  shouldTrainCharacterLoras,
} from './scene-generation';

import type { SceneScript, SeriesVisualStyle, StoryCharacter, StoryLanguage, VideoGenerationMode } from './content-state';
import { mergeCharacterLibraries } from './characters';
import { SeriesService } from './services/series.service';
import { RetrievalService } from './services/retrieval.service';
import type { SourceFidelityContext } from './source-fidelity';

import { normalizeStoryLanguage } from './language';

import {

  GenerateCharacterProfileResponseDto,

  GenerateIdeaResponseDto,

  GenerateImageResponseDto,

  EnsureCharacterPortraitsRequestDto,

  EnsureCharacterPortraitsResponseDto,

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

    private readonly characterPortraitService: CharacterPortraitService,

    private readonly castSheetService: CastSheetService,

    private readonly characterLoraService: CharacterLoraService,

    private readonly upscaleAgent: UpscaleAgent,

    private readonly assemblyAgent: AssemblyAgent,

    private readonly audioAgent: AudioAgent,

    private readonly seriesService: SeriesService,

    private readonly retrievalService: RetrievalService,

  ) {}



  getHello(): string {

    return 'Hello World!';

  }

  private shouldUseSourceFidelity(
    sourceFidelityMode?: boolean,
    knowledgeSourceId?: string | null,
  ): boolean {
    return Boolean(sourceFidelityMode && knowledgeSourceId?.trim());
  }

  private async resolveSourceContext(
    query: string,
    knowledgeSourceId?: string | null,
    sourceFidelityMode?: boolean,
  ): Promise<SourceFidelityContext | undefined> {
    if (!this.shouldUseSourceFidelity(sourceFidelityMode, knowledgeSourceId)) {
      return undefined;
    }

    return this.retrievalService.buildContext(
      knowledgeSourceId,
      query,
      Number.parseInt(process.env.RAG_DEFAULT_TOP_K ?? '6', 10) || 6,
    );
  }



  async generateIdea(

    topic: string,

    storyLanguage?: StoryLanguage,

    knowledgeSourceId?: string | null,

    sourceFidelityMode?: boolean,

  ): Promise<GenerateIdeaResponseDto> {

    const language = normalizeStoryLanguage(storyLanguage);

    const sourceContext = await this.resolveSourceContext(
      topic,
      knowledgeSourceId,
      sourceFidelityMode,
    );

    return {
      idea: await this.ideaAgent.execute(topic, language, sourceContext),
    };

  }



  async generateStory(

    idea: string,

    storyLanguage?: StoryLanguage,

    knowledgeSourceId?: string | null,

    sourceFidelityMode?: boolean,

  ): Promise<GenerateStoryResponseDto> {

    const language = normalizeStoryLanguage(storyLanguage);

    const sourceContext = await this.resolveSourceContext(
      idea,
      knowledgeSourceId,
      sourceFidelityMode,
    );

    return {
      story: await this.storyAgent.execute(idea, language, sourceContext),
    };

  }



  async generateScript(

    story: string,

    storyLanguage?: StoryLanguage,

    knowledgeSourceId?: string | null,

    sourceFidelityMode?: boolean,

    videoMode: VideoGenerationMode = 'local',

  ): Promise<GenerateScriptResponseDto> {

    const language = normalizeStoryLanguage(storyLanguage);

    const sourceContext = await this.resolveSourceContext(
      story,
      knowledgeSourceId,
      sourceFidelityMode,
    );

    return {
      script: await this.scriptAgent.execute(
        story,
        language,
        sourceContext,
        videoMode,
      ),
    };

  }



  async generateCharacterProfile(

    story: string,

    script: SceneScript[],

    storyLanguage?: StoryLanguage,

    seriesId?: string | null,

    existingCharacters?: StoryCharacter[],

    visualStyle?: SeriesVisualStyle,

    knowledgeSourceId?: string | null,

    sourceFidelityMode?: boolean,

    videoMode: VideoGenerationMode = 'local',

  ): Promise<GenerateCharacterProfileResponseDto> {

    const language = normalizeStoryLanguage(storyLanguage);

    const sourceContext = await this.resolveSourceContext(
      story,
      knowledgeSourceId,
      sourceFidelityMode,
    );

    let library = existingCharacters ?? [];

    if (seriesId) {
      const series = await this.seriesService.getSeries(seriesId);
      library = mergeCharacterLibraries(series.characters, library);
    }

    const result = await this.characterAgent.executeProfile(
      story,
      script,
      language,
      library,
      sourceContext,
    );

    let characters = result.characters;
    let castReferenceImagePath: string | undefined;

    if (characters.length > 0 && videoMode === 'professional') {
      characters = characters.map((character) => ({
        ...character,
        portraitPrompt:
          character.portraitPrompt?.trim() ||
          buildProfessionalPortraitPrompt(character, visualStyle),
      }));
    } else if (characters.length > 0) {
      characters = await this.characterPortraitService.ensurePortraits(
        characters,
        visualStyle,
      );
      // Hybrid: train SDXL LoRAs for identity assets, then build FLUX cast sheet for scenes.
      if (shouldTrainCharacterLoras()) {
        characters = await this.characterLoraService.ensureLoras(characters);
      }
      if (shouldBuildCastSheet()) {
        castReferenceImagePath = await this.castSheetService.ensureCastSheet(
          characters,
          visualStyle,
        );
      }
    }

    if (seriesId && result.newCharacters.length > 0) {
      await this.seriesService.mergeCharacters(seriesId, characters);
    }

    return {
      ...result,
      characters,
      castReferenceImagePath,
    };

  }



  async ensureCharacterPortraits(

    characters: StoryCharacter[],

    visualStyle?: SeriesVisualStyle,

    seriesId?: string | null,

  ): Promise<EnsureCharacterPortraitsResponseDto> {

    const updated = await this.characterPortraitService.ensurePortraits(

      characters,

      visualStyle,

    );

    let withLoras = updated;
    if (shouldTrainCharacterLoras()) {
      withLoras = await this.characterLoraService.ensureLoras(updated);
    }

    const castReferenceImagePath = shouldBuildCastSheet()
      ? await this.castSheetService.ensureCastSheet(withLoras, visualStyle)
      : undefined;

    if (seriesId) {

      await this.seriesService.mergeCharacters(seriesId, withLoras);

    }

    return { characters: withLoras, castReferenceImagePath };

  }



  async generatePrompt(

    scene: SceneScript,

    characters: StoryCharacter[],

    videoMode: VideoGenerationMode = 'local',

    storyLanguage?: StoryLanguage,

    visualStyle?: SeriesVisualStyle,

    knowledgeSourceId?: string | null,

    sourceFidelityMode?: boolean,

  ): Promise<GeneratePromptResponseDto> {

    const language = normalizeStoryLanguage(storyLanguage);

    const sourceContext = await this.resolveSourceContext(
      this.retrievalService.buildSceneQuery(scene),
      knowledgeSourceId,
      sourceFidelityMode,
    );

    const { imagePrompt, videoPrompt } = await this.promptAgent.execute(

      scene,

      characters,

      videoMode,

      language,

      visualStyle,

      sourceContext,

    );



    return {

      scene: {

        ...scene,

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



  startImageJob(
    scene: SceneScript,
    visualStyle?: SeriesVisualStyle,
    characters: StoryCharacter[] = [],
    castReferenceImagePath?: string,
    masterSceneImagePath?: string,
    regenerate = false,
  ): StartImageJobResponseDto {

    const job = this.imageJobService.start(
      scene,
      visualStyle,
      characters,
      castReferenceImagePath,
      masterSceneImagePath,
      regenerate,
    );

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



  startVideoJob(
    scene: SceneScript,
    visualStyle?: SeriesVisualStyle,
  ): StartVideoJobResponseDto {

    const job = this.videoJobService.start(scene, visualStyle);

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



  async upscaleVideo(
    scene: SceneScript,
    visualStyle?: SeriesVisualStyle,
  ): Promise<UpscaleVideoResponseDto> {

    return {

      scene: await this.upscaleAgent.execute(scene, visualStyle),

    };

  }



  async generateAudio(

    scene: SceneScript,

    characters: StoryCharacter[],

    storyLanguage?: StoryLanguage,

  ): Promise<GenerateAudioResponseDto> {

    const language = normalizeStoryLanguage(storyLanguage);

    return {

      scene: await this.audioAgent.execute(scene, characters, language),

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


