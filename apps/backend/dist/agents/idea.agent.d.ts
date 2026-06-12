import { OpenAIService } from "../services/openai.service";
export declare class IdeaAgent {
    private readonly ai;
    constructor(ai: OpenAIService);
    execute(topic: string): Promise<string>;
}
