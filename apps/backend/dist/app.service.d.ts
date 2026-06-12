import { PromptAgent } from './agents/prompt.agent';
import type { SceneScript } from './content-state';
import { GenerateContentResponseDto } from './models/content.model';
export declare class AppService {
    private readonly promptAgent;
    constructor(promptAgent: PromptAgent);
    getHello(): string;
    generate(topic: string): Promise<GenerateContentResponseDto>;
    generatePrompts(scenes: SceneScript[]): Promise<SceneScript[]>;
}
