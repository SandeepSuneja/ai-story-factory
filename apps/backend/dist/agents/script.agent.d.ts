import type { SceneScript } from "../content-state";
import { QwenService } from "../services/qwen.service";
export declare class ScriptAgent {
    private readonly ai;
    constructor(ai: QwenService);
    execute(story: string): Promise<SceneScript[]>;
}
