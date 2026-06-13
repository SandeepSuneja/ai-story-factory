import { Module } from '@nestjs/common';
import { CharacterAgent } from './agents/character.agent';
import { IdeaAgent } from './agents/idea.agent';
import { ImageAgent } from './agents/image.agent';
import { PromptAgent } from './agents/prompt.agent';
import { ScriptAgent } from './agents/script.agent';
import { StoryAgent } from './agents/story.agent';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { FluxService } from './services/flux.service';
import { OpenAIService } from './services/openai.service';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [
    AppService,
    OpenAIService,
    FluxService,
    IdeaAgent,
    StoryAgent,
    ScriptAgent,
    CharacterAgent,
    PromptAgent,
    ImageAgent,
  ],
})
export class AppModule {}
