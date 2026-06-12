import { Module } from '@nestjs/common';
import { PromptAgent } from './agents/prompt.agent';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { OpenAIService } from './services/openai.service';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService, OpenAIService, PromptAgent],
})
export class AppModule {}
