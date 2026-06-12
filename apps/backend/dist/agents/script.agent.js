"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScriptAgent = void 0;
function parseJsonFromModel(text) {
    const trimmed = text.trim();
    const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    const jsonText = fenceMatch ? fenceMatch[1].trim() : trimmed;
    return JSON.parse(jsonText);
}
class ScriptAgent {
    ai;
    constructor(ai) {
        this.ai = ai;
    }
    async execute(story) {
        const prompt = `
Convert story into short video scenes.

Return only raw JSON with no markdown or code fences:

[
 {
   "sceneNumber":1,
   "duration":5,
   "narration":"",
   "visualDescription":""
 }
]

Story:
${story}
`;
        return parseJsonFromModel(await this.ai.generate(prompt));
    }
}
exports.ScriptAgent = ScriptAgent;
//# sourceMappingURL=script.agent.js.map