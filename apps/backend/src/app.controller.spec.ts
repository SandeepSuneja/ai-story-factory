import { Test, TestingModule } from '@nestjs/testing';
import { CharacterAgent } from './agents/character.agent';
import { IdeaAgent } from './agents/idea.agent';
import { PromptAgent } from './agents/prompt.agent';
import { ScriptAgent } from './agents/script.agent';
import { StoryAgent } from './agents/story.agent';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { OpenAIService } from './services/openai.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        OpenAIService,
        { provide: IdeaAgent, useValue: { execute: jest.fn() } },
        { provide: StoryAgent, useValue: { execute: jest.fn() } },
        { provide: ScriptAgent, useValue: { execute: jest.fn() } },
        { provide: PromptAgent, useValue: { execute: jest.fn() } },
        {
          provide: CharacterAgent,
          useValue: { executeProfile: jest.fn() },
        },
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
