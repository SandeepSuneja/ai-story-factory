"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAIService = void 0;
const common_1 = require("@nestjs/common");
const openai_1 = __importDefault(require("openai"));
let OpenAIService = class OpenAIService {
    client = new openai_1.default({
        apiKey: process.env.OPENAI_API_KEY
    });
    async generate(prompt) {
        const response = await this.client.responses.create({
            model: "gpt-3.5-turbo",
            input: prompt
        });
        return response.output_text;
    }
};
exports.OpenAIService = OpenAIService;
exports.OpenAIService = OpenAIService = __decorate([
    (0, common_1.Injectable)()
], OpenAIService);
//# sourceMappingURL=openai.service.js.map