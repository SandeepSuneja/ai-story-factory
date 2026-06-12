import { OpenAIService } from "../services/openai.service";
export declare class StoryAgent {
    private readonly ai;
    constructor(ai: OpenAIService);
    execute(idea: string): Promise<string>;
}
