import { Module } from '@nestjs/common';
import { AssemblyAgent } from './agents/assembly.agent';
import { AudioAgent } from './agents/audio.agent';
import { CharacterAgent } from './agents/character.agent';
import { IdeaAgent } from './agents/idea.agent';
import { ImageAgent } from './agents/image.agent';
import { PromptAgent } from './agents/prompt.agent';
import { ScriptAgent } from './agents/script.agent';
import { StoryAgent } from './agents/story.agent';
import { VideoAgent } from './agents/video.agent';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ProjectsController } from './projects.controller';
import { AssemblyService } from './services/assembly.service';
import { FluxService } from './services/flux.service';
import { HunyuanService } from './services/hunyuan.service';
import { ProjectService } from './services/project.service';
import { QwenService } from './services/qwen.service';
import { TtsService } from './services/tts.service';

@Module({
  imports: [],
  controllers: [AppController, ProjectsController],
  providers: [
    AppService,
    ProjectService,
    QwenService,
    FluxService,
    HunyuanService,
    TtsService,
    AssemblyService,
    IdeaAgent,
    StoryAgent,
    ScriptAgent,
    CharacterAgent,
    PromptAgent,
    ImageAgent,
    VideoAgent,
    AudioAgent,
    AssemblyAgent,
  ],
})
export class AppModule {}
