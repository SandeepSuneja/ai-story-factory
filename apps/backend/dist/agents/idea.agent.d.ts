import { QwenService } from "../services/qwen.service";
export declare class IdeaAgent {
    private readonly ai;
    constructor(ai: QwenService);
    execute(topic: string): Promise<string>;
}
