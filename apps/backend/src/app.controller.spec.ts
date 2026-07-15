import { Test, TestingModule } from '@nestjs/testing';
import { AudioAgent } from './agents/audio.agent';
import { CharacterAgent } from './agents/character.agent';
import { IdeaAgent } from './agents/idea.agent';
import { ImageAgent } from './agents/image.agent';
import { PromptAgent } from './agents/prompt.agent';
import { ScriptAgent } from './agents/script.agent';
import { UpscaleAgent } from './agents/upscale.agent';
import { AssemblyAgent } from './agents/assembly.agent';
import { MediaUploadService } from './services/media-upload.service';
import { StoryAgent } from './agents/story.agent';
import { VideoJobService } from './services/video-job.service';
import { ImageJobService } from './services/image-job.service';
import { CharacterPortraitService } from './services/character-portrait.service';
import { CastSheetService } from './services/cast-sheet.service';
import { CharacterLoraService } from './services/character-lora.service';
import { SeriesService } from './services/series.service';
import { RetrievalService } from './services/retrieval.service';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { FluxService } from './services/flux.service';
import { QwenService } from './services/qwen.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        QwenService,
        { provide: FluxService, useValue: { generateImage: jest.fn(), getStorageDirectory: jest.fn() } },
        { provide: IdeaAgent, useValue: { execute: jest.fn() } },
        { provide: StoryAgent, useValue: { execute: jest.fn() } },
        { provide: ScriptAgent, useValue: { execute: jest.fn() } },
        { provide: PromptAgent, useValue: { execute: jest.fn() } },
        {
          provide: CharacterAgent,
          useValue: { executeProfile: jest.fn() },
        },
        { provide: ImageAgent, useValue: { execute: jest.fn() } },
        {
          provide: VideoJobService,
          useValue: { start: jest.fn(), get: jest.fn() },
        },
        {
          provide: ImageJobService,
          useValue: { start: jest.fn(), get: jest.fn() },
        },
        {
          provide: CharacterPortraitService,
          useValue: { ensurePortraits: jest.fn(), generatePortrait: jest.fn() },
        },
        {
          provide: CastSheetService,
          useValue: { ensureCastSheet: jest.fn() },
        },
        {
          provide: CharacterLoraService,
          useValue: { ensureLoras: jest.fn(), ensureLora: jest.fn() },
        },
        {
          provide: SeriesService,
          useValue: { getSeries: jest.fn(), mergeCharacters: jest.fn() },
        },
        {
          provide: RetrievalService,
          useValue: { buildContext: jest.fn(), buildSceneQuery: jest.fn() },
        },
        {
          provide: MediaUploadService,
          useValue: { saveSceneVideo: jest.fn() },
        },
        { provide: UpscaleAgent, useValue: { execute: jest.fn() } },
        { provide: AssemblyAgent, useValue: { execute: jest.fn() } },
        { provide: AudioAgent, useValue: { execute: jest.fn() } },
      ],
    }).compile();
    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });
});
