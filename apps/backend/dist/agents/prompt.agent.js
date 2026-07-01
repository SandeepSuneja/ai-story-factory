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
const qwen_service_1 = require("../services/qwen.service");
let PromptAgent = class PromptAgent {
    ai;
    constructor(ai) {
        this.ai = ai;
    }
    async execute(scene, characterAppearance) {
        const prompt = `
Create a short cinematic motion prompt for CogVideoX image-to-video generation.

Requirements:
- Maximum 180 words (226 tokens for CogVideoX)
- Do NOT describe character appearance — the input image already shows the character
- Focus on camera movement, subject motion, lighting changes, atmosphere, and mood
- Horizontal 3:2 framing (720x480, matches video output)
- One continuous shot, smooth natural motion
- Ultra detailed lighting and atmosphere only

Character appearance (for context only — do not repeat in output):
${characterAppearance}

Scene narration:
${scene.narration}

Scene visual:
${scene.visualDescription}

Return only the motion prompt, under 180 words.
`;
        return this.ai.generate(prompt);
    }
};
exports.PromptAgent = PromptAgent;
exports.PromptAgent = PromptAgent = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [qwen_service_1.QwenService])
], PromptAgent);
//# sourceMappingURL=prompt.agent.js.map