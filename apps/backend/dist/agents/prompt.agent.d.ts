import { SceneScript } from "../content-state";
import { QwenService } from "../services/qwen.service";
export declare class PromptAgent {
    private readonly ai;
    constructor(ai: QwenService);
    execute(scene: SceneScript, characterAppearance: string): Promise<string>;
}
