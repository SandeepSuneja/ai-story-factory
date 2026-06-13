import { Body, Controller, Get, Post } from '@nestjs/common';
import { AppService } from './app.service';
import {
  GenerateCharacterProfileRequestDto,
  GenerateCharacterProfileResponseDto,
  GenerateIdeaRequestDto,
  GenerateIdeaResponseDto,
  GeneratePromptRequestDto,
  GeneratePromptResponseDto,
  GenerateScriptRequestDto,
  GenerateScriptResponseDto,
  GenerateStoryRequestDto,
  GenerateStoryResponseDto,
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
}
