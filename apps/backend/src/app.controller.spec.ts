import { Test, TestingModule } from '@nestjs/testing';
import { CharacterAgent } from './agents/character.agent';
import { IdeaAgent } from './agents/idea.agent';
import { ImageAgent } from './agents/image.agent';
import { PromptAgent } from './agents/prompt.agent';
import { ScriptAgent } from './agents/script.agent';
import { VideoAgent } from './agents/video.agent';
import { StoryAgent } from './agents/story.agent';
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
        { provide: VideoAgent, useValue: { execute: jest.fn() } },
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
