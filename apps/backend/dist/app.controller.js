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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppController = void 0;
const common_1 = require("@nestjs/common");
const app_service_1 = require("./app.service");
const content_model_1 = require("./models/content.model");
let AppController = class AppController {
    appService;
    constructor(appService) {
        this.appService = appService;
    }
    getHello() {
        return this.appService.getHello();
    }
    generateIdea(body) {
        return this.appService.generateIdea(body.topic);
    }
    generateStory(body) {
        return this.appService.generateStory(body.idea);
    }
    generateScript(body) {
        return this.appService.generateScript(body.story);
    }
    generateCharacterProfile(body) {
        return this.appService.generateCharacterProfile(body.story, body.script);
    }
    generatePrompt(body) {
        return this.appService.generatePrompt(body.scene, body.characterAppearance);
    }
    generateImage(body) {
        return this.appService.generateImage(body.scene);
    }
    generateVideo(body) {
        return this.appService.generateVideo(body.scene);
    }
    generateAudio(body) {
        return this.appService.generateAudio(body.scene);
    }
    assembleVideo(body) {
        return this.appService.assembleVideo(body.scenes, body.projectName);
    }
};
exports.AppController = AppController;
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", String)
], AppController.prototype, "getHello", null);
__decorate([
    (0, common_1.Post)('generate/idea'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [content_model_1.GenerateIdeaRequestDto]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "generateIdea", null);
__decorate([
    (0, common_1.Post)('generate/story'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [content_model_1.GenerateStoryRequestDto]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "generateStory", null);
__decorate([
    (0, common_1.Post)('generate/script'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [content_model_1.GenerateScriptRequestDto]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "generateScript", null);
__decorate([
    (0, common_1.Post)('generate/character/profile'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [content_model_1.GenerateCharacterProfileRequestDto]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "generateCharacterProfile", null);
__decorate([
    (0, common_1.Post)('generate/prompt'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [content_model_1.GeneratePromptRequestDto]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "generatePrompt", null);
__decorate([
    (0, common_1.Post)('generate/image'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [content_model_1.GenerateImageRequestDto]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "generateImage", null);
__decorate([
    (0, common_1.Post)('generate/video'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [content_model_1.GenerateVideoRequestDto]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "generateVideo", null);
__decorate([
    (0, common_1.Post)('generate/audio'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [content_model_1.GenerateAudioRequestDto]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "generateAudio", null);
__decorate([
    (0, common_1.Post)('generate/assembly'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [content_model_1.AssembleVideoRequestDto]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "assembleVideo", null);
exports.AppController = AppController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [app_service_1.AppService])
], AppController);
//# sourceMappingURL=app.controller.js.map