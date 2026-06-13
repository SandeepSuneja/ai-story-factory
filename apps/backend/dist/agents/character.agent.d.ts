import type { SceneScript } from "../content-state";
import { OpenAIService } from "../services/openai.service";
export declare class CharacterAgent {
    private readonly ai;
    constructor(ai: OpenAIService);
    executeProfile(story: string, script: SceneScript[]): Promise<string>;
}
