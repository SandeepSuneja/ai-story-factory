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
exports.PromptAgent = void 0;
const common_1 = require("@nestjs/common");
const openai_service_1 = require("../services/openai.service");
let PromptAgent = class PromptAgent {
    ai;
    constructor(ai) {
        this.ai = ai;
    }
    async execute(scene, characterAppearance) {
        const prompt = `
Create a cinematic AI video prompt for this scene.

Requirements:
- Vertical 9:16
- Realistic
- Ultra detailed
- Dramatic lighting
- Use the exact character appearance in every scene

Character appearance:
${characterAppearance}

Scene narration:
${scene.narration}

Scene visual:
${scene.visualDescription}

Return only the video prompt.
`;
        return this.ai.generate(prompt);
    }
};
exports.PromptAgent = PromptAgent;
exports.PromptAgent = PromptAgent = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [openai_service_1.OpenAIService])
], PromptAgent);
//# sourceMappingURL=prompt.agent.js.map