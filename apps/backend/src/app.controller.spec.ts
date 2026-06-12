import { Test, TestingModule } from '@nestjs/testing';
import { PromptAgent } from './agents/prompt.agent';
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
        { provide: PromptAgent, useValue: { execute: jest.fn() } },
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
