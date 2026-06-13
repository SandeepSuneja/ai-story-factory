import { CharacterAgent } from './agents/character.agent';
import { IdeaAgent } from './agents/idea.agent';
import { ImageAgent } from './agents/image.agent';
import { PromptAgent } from './agents/prompt.agent';
import { ScriptAgent } from './agents/script.agent';
import { StoryAgent } from './agents/story.agent';
import type { SceneScript } from './content-state';
import { GenerateCharacterProfileResponseDto, GenerateIdeaResponseDto, GenerateImageResponseDto, GeneratePromptResponseDto, GenerateScriptResponseDto, GenerateStoryResponseDto } from './models/content.model';
export declare class AppService {
    private readonly ideaAgent;
    private readonly storyAgent;
    private readonly scriptAgent;
    private readonly characterAgent;
    private readonly promptAgent;
    private readonly imageAgent;
    constructor(ideaAgent: IdeaAgent, storyAgent: StoryAgent, scriptAgent: ScriptAgent, characterAgent: CharacterAgent, promptAgent: PromptAgent, imageAgent: ImageAgent);
    getHello(): string;
    generateIdea(topic: string): Promise<GenerateIdeaResponseDto>;
    generateStory(idea: string): Promise<GenerateStoryResponseDto>;
    generateScript(story: string): Promise<GenerateScriptResponseDto>;
    generateCharacterProfile(story: string, script: SceneScript[]): Promise<GenerateCharacterProfileResponseDto>;
    generatePrompt(scene: SceneScript, characterAppearance: string): Promise<GeneratePromptResponseDto>;
    generateImage(scene: SceneScript): Promise<GenerateImageResponseDto>;
}
