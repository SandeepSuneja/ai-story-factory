import { Body, Controller, Get, Post } from '@nestjs/common';
import { AppService } from './app.service';
import {
  GenerateCharacterProfileRequestDto,
  GenerateCharacterProfileResponseDto,
  GenerateIdeaRequestDto,
  GenerateIdeaResponseDto,
  GenerateImageRequestDto,
  GenerateImageResponseDto,
  GeneratePromptRequestDto,
  GeneratePromptResponseDto,
  GenerateScriptRequestDto,
  GenerateScriptResponseDto,
  GenerateStoryRequestDto,
  GenerateStoryResponseDto,
  GenerateVideoRequestDto,
  GenerateVideoResponseDto,
  GenerateAudioRequestDto,
  GenerateAudioResponseDto,
  AssembleVideoRequestDto,
  AssembleVideoResponseDto,
} from './models/content.model';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Post('generate/idea')
  generateIdea(
    @Body() body: GenerateIdeaRequestDto,
  ): Promise<GenerateIdeaResponseDto> {
    return this.appService.generateIdea(body.topic);
  }

  @Post('generate/story')
  generateStory(
    @Body() body: GenerateStoryRequestDto,
  ): Promise<GenerateStoryResponseDto> {
    return this.appService.generateStory(body.idea);
  }

  @Post('generate/script')
  generateScript(
    @Body() body: GenerateScriptRequestDto,
  ): Promise<GenerateScriptResponseDto> {
    return this.appService.generateScript(body.story);
  }

  @Post('generate/character/profile')
  generateCharacterProfile(
    @Body() body: GenerateCharacterProfileRequestDto,
  ): Promise<GenerateCharacterProfileResponseDto> {
    return this.appService.generateCharacterProfile(body.story, body.script);
  }

  @Post('generate/prompt')
  generatePrompt(
    @Body() body: GeneratePromptRequestDto,
  ): Promise<GeneratePromptResponseDto> {
    return this.appService.generatePrompt(body.scene, body.characterAppearance);
  }

  @Post('generate/image')
  generateImage(
    @Body() body: GenerateImageRequestDto,
  ): Promise<GenerateImageResponseDto> {
    return this.appService.generateImage(body.scene);
  }

  @Post('generate/video')
  generateVideo(
    @Body() body: GenerateVideoRequestDto,
  ): Promise<GenerateVideoResponseDto> {
    return this.appService.generateVideo(body.scene);
  }

  @Post('generate/audio')
  generateAudio(
    @Body() body: GenerateAudioRequestDto,
  ): Promise<GenerateAudioResponseDto> {
    return this.appService.generateAudio(body.scene);
  }

  @Post('generate/assembly')
  assembleVideo(
    @Body() body: AssembleVideoRequestDto,
  ): Promise<AssembleVideoResponseDto> {
    return this.appService.assembleVideo(body.scenes, body.projectName);
  }
}
