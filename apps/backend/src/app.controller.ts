import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AppService } from './app.service';
import {
  GenerateCharacterProfileRequestDto,
  GenerateCharacterProfileResponseDto,
  GenerateIdeaRequestDto,
  GenerateIdeaResponseDto,
  GenerateImageRequestDto,
  GenerateImageResponseDto,
  EnsureCharacterPortraitsRequestDto,
  EnsureCharacterPortraitsResponseDto,
  StartImageJobResponseDto,
  ImageJobStatusResponseDto,
  GeneratePromptRequestDto,
  GeneratePromptResponseDto,
  GenerateScriptRequestDto,
  GenerateScriptResponseDto,
  GenerateStoryRequestDto,
  GenerateStoryResponseDto,
  GenerateVideoRequestDto,
  StartVideoJobResponseDto,
  UploadVideoResponseDto,
  VideoJobStatusResponseDto,
  UpscaleVideoRequestDto,
  UpscaleVideoResponseDto,
  GenerateAudioRequestDto,
  GenerateAudioResponseDto,
  AssembleVideoRequestDto,
  AssembleVideoResponseDto,
} from './models/content.model';
import { MediaUploadService, type UploadedVideoFile } from './services/media-upload.service';
@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly mediaUploadService: MediaUploadService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Post('generate/idea')
  generateIdea(
    @Body() body: GenerateIdeaRequestDto,
  ): Promise<GenerateIdeaResponseDto> {
    return this.appService.generateIdea(
      body.topic,
      body.storyLanguage,
      body.knowledgeSourceId,
      body.sourceFidelityMode,
    );
  }

  @Post('generate/story')
  generateStory(
    @Body() body: GenerateStoryRequestDto,
  ): Promise<GenerateStoryResponseDto> {
    return this.appService.generateStory(
      body.idea,
      body.storyLanguage,
      body.knowledgeSourceId,
      body.sourceFidelityMode,
    );
  }

  @Post('generate/script')
  generateScript(
    @Body() body: GenerateScriptRequestDto,
  ): Promise<GenerateScriptResponseDto> {
    return this.appService.generateScript(
      body.story,
      body.storyLanguage,
      body.knowledgeSourceId,
      body.sourceFidelityMode,
    );
  }

  @Post('generate/character/profile')
  generateCharacterProfile(
    @Body() body: GenerateCharacterProfileRequestDto,
  ): Promise<GenerateCharacterProfileResponseDto> {
    return this.appService.generateCharacterProfile(
      body.story,
      body.script,
      body.storyLanguage,
      body.seriesId,
      body.existingCharacters,
      body.visualStyle,
      body.knowledgeSourceId,
      body.sourceFidelityMode,
    );
  }

  @Post('generate/prompt')
  generatePrompt(
    @Body() body: GeneratePromptRequestDto,
  ): Promise<GeneratePromptResponseDto> {
    return this.appService.generatePrompt(
      body.scene,
      body.characters,
      body.videoMode ?? 'local',
      body.storyLanguage,
      body.visualStyle,
      body.knowledgeSourceId,
      body.sourceFidelityMode,
    );
  }

  @Post('generate/character/portraits')
  ensureCharacterPortraits(
    @Body() body: EnsureCharacterPortraitsRequestDto,
  ): Promise<EnsureCharacterPortraitsResponseDto> {
    return this.appService.ensureCharacterPortraits(
      body.characters,
      body.visualStyle,
      body.seriesId,
    );
  }

  @Post('generate/image')
  startImageJob(
    @Body() body: GenerateImageRequestDto,
  ): StartImageJobResponseDto {
    return this.appService.startImageJob(
      body.scene,
      body.visualStyle,
      body.characters ?? [],
      body.castReferenceImagePath,
    );
  }

  @Get('generate/image/:jobId')
  getImageJob(
    @Param('jobId') jobId: string,
  ): ImageJobStatusResponseDto {
    return this.appService.getImageJob(jobId);
  }

  @Post('generate/video')
  startVideoJob(
    @Body() body: GenerateVideoRequestDto,
  ): StartVideoJobResponseDto {
    return this.appService.startVideoJob(body.scene, body.visualStyle);
  }

  @Get('generate/video/:jobId')
  getVideoJob(
    @Param('jobId') jobId: string,
  ): VideoJobStatusResponseDto {
    return this.appService.getVideoJob(jobId);
  }

  @Post('upload/video')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 500 * 1024 * 1024 },
    }),
  )
  uploadVideo(
    @UploadedFile() file: UploadedVideoFile,
    @Body('scene_number') sceneNumberRaw: string,
  ): Promise<UploadVideoResponseDto> {
    const sceneNumber = Number.parseInt(sceneNumberRaw, 10);
    if (!Number.isFinite(sceneNumber) || sceneNumber < 1) {
      throw new BadRequestException('scene_number must be a positive integer');
    }

    return this.mediaUploadService.saveSceneVideo(sceneNumber, file);
  }

  @Post('generate/upscale')
  upscaleVideo(
    @Body() body: UpscaleVideoRequestDto,
  ): Promise<UpscaleVideoResponseDto> {
    return this.appService.upscaleVideo(body.scene, body.visualStyle);
  }

  @Post('generate/audio')
  generateAudio(
    @Body() body: GenerateAudioRequestDto,
  ): Promise<GenerateAudioResponseDto> {
    return this.appService.generateAudio(
      body.scene,
      body.characters,
      body.storyLanguage,
    );
  }

  @Post('generate/assembly')
  assembleVideo(
    @Body() body: AssembleVideoRequestDto,
  ): Promise<AssembleVideoResponseDto> {
    return this.appService.assembleVideo(body.scenes, body.projectName);
  }
}
