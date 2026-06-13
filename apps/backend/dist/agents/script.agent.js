"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScriptAgent = void 0;
const common_1 = require("@nestjs/common");
const openai_service_1 = require("../services/openai.service");
function parseJsonFromModel(text) {
    const trimmed = text.trim();
    const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    const jsonText = fenceMatch ? fenceMatch[1].trim() : trimmed;
    return JSON.parse(jsonText);
}
let ScriptAgent = class ScriptAgent {
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
};
exports.ScriptAgent = ScriptAgent;
exports.ScriptAgent = ScriptAgent = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [openai_service_1.OpenAIService])
], ScriptAgent);
//# sourceMappingURL=script.agent.js.map