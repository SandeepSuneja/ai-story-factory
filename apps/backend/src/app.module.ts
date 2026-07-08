import { Module } from '@nestjs/common';
import { AudioAgent } from './agents/audio.agent';
import { CharacterAgent } from './agents/character.agent';
import { IdeaAgent } from './agents/idea.agent';
import { ImageAgent } from './agents/image.agent';
import { PromptAgent } from './agents/prompt.agent';
import { QaAgent } from './agents/qa.agent';
import { ScriptAgent } from './agents/script.agent';
import { StoryAgent } from './agents/story.agent';
import { UpscaleAgent } from './agents/upscale.agent';
import { AssemblyAgent } from './agents/assembly.agent';
import { VideoAgent } from './agents/video.agent';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { KnowledgeController } from './knowledge.controller';
import { ProjectsController } from './projects.controller';
import { SeriesService } from './services/series.service';
import { SeriesController } from './series.controller';
import { FluxService } from './services/flux.service';
import { HunyuanService } from './services/hunyuan.service';
import { KnowledgeService } from './services/knowledge.service';
import { MediaUploadService } from './services/media-upload.service';
import { ProjectService } from './services/project.service';
import { QwenService } from './services/qwen.service';
import { RagService } from './services/rag.service';
import { RetrievalService } from './services/retrieval.service';
import { TtsService } from './services/tts.service';
import { UpscaleService } from './services/upscale.service';
import { AssemblyService } from './services/assembly.service';
import { VideoJobService } from './services/video-job.service';
import { ImageJobService } from './services/image-job.service';
import { CharacterPortraitService } from './services/character-portrait.service';
import { CastSheetService } from './services/cast-sheet.service';

@Module({
  imports: [],
  controllers: [
    AppController,
    ProjectsController,
    SeriesController,
    KnowledgeController,
  ],
  providers: [
    AppService,
    ProjectService,
    SeriesService,
    KnowledgeService,
    RagService,
    RetrievalService,
    QwenService,
    FluxService,
    HunyuanService,
    TtsService,
    UpscaleService,
    AssemblyService,
    MediaUploadService,
    IdeaAgent,
    StoryAgent,
    ScriptAgent,
    CharacterAgent,
    PromptAgent,
    QaAgent,
    ImageAgent,
    VideoAgent,
    VideoJobService,
    ImageJobService,
    CharacterPortraitService,
    CastSheetService,
    UpscaleAgent,
    AssemblyAgent,
    AudioAgent,
  ],
})
export class AppModule {}
