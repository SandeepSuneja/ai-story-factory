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
exports.ImageAgent = void 0;
const common_1 = require("@nestjs/common");
const promises_1 = require("fs/promises");
const flux_service_1 = require("../services/flux.service");
let ImageAgent = class ImageAgent {
    flux;
    constructor(flux) {
        this.flux = flux;
    }
    async execute(scene) {
        if (!scene.videoPrompt) {
            throw new Error("Video prompt is required before image generation");
        }
        await (0, promises_1.mkdir)(this.flux.getStorageDirectory(), { recursive: true });
        const imagePath = await this.flux.generateImage(scene.videoPrompt, scene.sceneNumber);
        return {
            ...scene,
            imagePrompt: scene.videoPrompt,
            imagePath,
        };
    }
};
exports.ImageAgent = ImageAgent;
exports.ImageAgent = ImageAgent = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [flux_service_1.FluxService])
], ImageAgent);
//# sourceMappingURL=image.agent.js.map