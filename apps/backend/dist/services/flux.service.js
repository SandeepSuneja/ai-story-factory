"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FluxService = void 0;
const common_1 = require("@nestjs/common");
const path_1 = require("path");
let FluxService = class FluxService {
    serviceUrl = process.env.FLUX_SERVICE_URL ?? "http://127.0.0.1:7860";
    getStorageDirectory() {
        return (process.env.IMAGE_STORAGE_DIR ??
            (0, path_1.join)(process.cwd(), "storage", "images"));
    }
    async generateImage(prompt, sceneNumber) {
        const response = await fetch(`${this.serviceUrl}/generate`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                prompt,
                scene_number: sceneNumber,
            }),
        });
        if (!response.ok) {
            const message = await response.text();
            throw new Error(message || `FLUX service failed with status ${response.status}`);
        }
        const result = (await response.json());
        return result.imagePath;
    }
};
exports.FluxService = FluxService;
exports.FluxService = FluxService = __decorate([
    (0, common_1.Injectable)()
], FluxService);
//# sourceMappingURL=flux.service.js.map