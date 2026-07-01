import type { SceneScript } from "../content-state";
import { QwenService } from "../services/qwen.service";
export declare class CharacterAgent {
    private readonly ai;
    constructor(ai: QwenService);
    executeProfile(story: string, script: SceneScript[]): Promise<string>;
}
