"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IdeaAgent = void 0;
class IdeaAgent {
    ai;
    constructor(ai) {
        this.ai = ai;
    }
    async execute(topic) {
        const prompt = `Generate one viral short-video story idea.
Topic: ${topic}.
Return only the idea.
`;
        return this.ai.generate(prompt);
    }
}
exports.IdeaAgent = IdeaAgent;
//# sourceMappingURL=idea.agent.js.map