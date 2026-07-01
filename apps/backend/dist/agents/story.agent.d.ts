import { QwenService } from "../services/qwen.service";
export declare class StoryAgent {
    private readonly ai;
    constructor(ai: QwenService);
    execute(idea: string): Promise<string>;
}
