import type { SceneScript } from "../content-state";
import { OpenAIService } from "../services/openai.service";
export declare class ScriptAgent {
    private readonly ai;
    constructor(ai: OpenAIService);
    execute(story: string): Promise<SceneScript[]>;
}
