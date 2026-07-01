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
exports.CharacterAgent = void 0;
const common_1 = require("@nestjs/common");
const qwen_service_1 = require("../services/qwen.service");
let CharacterAgent = class CharacterAgent {
    ai;
    constructor(ai) {
        this.ai = ai;
    }
    async executeProfile(story, script) {
        const scenesSummary = script
            .map((scene) => `Scene ${scene.sceneNumber}: ${scene.visualDescription} (${scene.narration})`)
            .join("\n");
        const prompt = `
Read the story and script scenes, then define one main character's uniform visual appearance.

Requirements:
- One consistent character only
- Age, gender, ethnicity, face, hair, outfit, accessories
- Distinctive traits that stay the same in every scene
- Must fit the story and all script scenes
- Suitable for AI image and video generation
- 80-120 words

Return only the character appearance description.

Story:
${story}

Script scenes:
${scenesSummary}
`;
        return this.ai.generate(prompt);
    }
};
exports.CharacterAgent = CharacterAgent;
exports.CharacterAgent = CharacterAgent = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [qwen_service_1.QwenService])
], CharacterAgent);
//# sourceMappingURL=character.agent.js.map