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
exports.AppService = void 0;
const common_1 = require("@nestjs/common");
const prompt_agent_1 = require("./agents/prompt.agent");
const content_graph_1 = require("./graphs/content.graph");
let AppService = class AppService {
    promptAgent;
    constructor(promptAgent) {
        this.promptAgent = promptAgent;
    }
    getHello() {
        return 'Hello World!';
    }
    async generate(topic) {
        const result = await content_graph_1.contentGraph.invoke({ topic });
        const script = await this.generatePrompts(result.script);
        return {
            idea: result.idea,
            story: result.story,
            script,
        };
    }
    async generatePrompts(scenes) {
        const updated = [];
        for (const scene of scenes) {
            const prompt = await this.promptAgent.execute(scene);
            updated.push({
                ...scene,
                videoPrompt: prompt,
            });
        }
        return updated;
    }
};
exports.AppService = AppService;
exports.AppService = AppService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prompt_agent_1.PromptAgent])
], AppService);
//# sourceMappingURL=app.service.js.map