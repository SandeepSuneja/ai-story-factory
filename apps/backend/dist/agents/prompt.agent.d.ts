import { SceneScript } from "../content-state";
import { OpenAIService } from "../services/openai.service";
export declare class PromptAgent {
    private readonly ai;
    constructor(ai: OpenAIService);
    execute(scene: SceneScript, characterAppearance: string): Promise<string>;
}
