"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const character_agent_1 = require("./agents/character.agent");
const idea_agent_1 = require("./agents/idea.agent");
const prompt_agent_1 = require("./agents/prompt.agent");
const script_agent_1 = require("./agents/script.agent");
const story_agent_1 = require("./agents/story.agent");
const app_controller_1 = require("./app.controller");
const app_service_1 = require("./app.service");
const openai_service_1 = require("./services/openai.service");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [],
        controllers: [app_controller_1.AppController],
        providers: [
            app_service_1.AppService,
            openai_service_1.OpenAIService,
            idea_agent_1.IdeaAgent,
            story_agent_1.StoryAgent,
            script_agent_1.ScriptAgent,
            prompt_agent_1.PromptAgent,
            character_agent_1.CharacterAgent,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map