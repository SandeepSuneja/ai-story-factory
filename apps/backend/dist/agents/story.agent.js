"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StoryAgent = void 0;
class StoryAgent {
    ai;
    constructor(ai) {
        this.ai = ai;
    }
    async execute(idea) {
        const prompt = `Write a highly engaging story.
  Requirements:
  - 400 words
  - strong hook
  - emotional tension
  - twist ending
  Idea:${idea}
  `;
        return this.ai.generate(prompt);
    }
}
exports.StoryAgent = StoryAgent;
//# sourceMappingURL=story.agent.js.map