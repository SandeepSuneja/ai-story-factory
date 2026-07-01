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
const assembly_agent_1 = require("./agents/assembly.agent");
const audio_agent_1 = require("./agents/audio.agent");
const character_agent_1 = require("./agents/character.agent");
const idea_agent_1 = require("./agents/idea.agent");
const image_agent_1 = require("./agents/image.agent");
const prompt_agent_1 = require("./agents/prompt.agent");
const script_agent_1 = require("./agents/script.agent");
const story_agent_1 = require("./agents/story.agent");
const video_agent_1 = require("./agents/video.agent");
const app_controller_1 = require("./app.controller");
const app_service_1 = require("./app.service");
const projects_controller_1 = require("./projects.controller");
const assembly_service_1 = require("./services/assembly.service");
const flux_service_1 = require("./services/flux.service");
const hunyuan_service_1 = require("./services/hunyuan.service");
const project_service_1 = require("./services/project.service");
const qwen_service_1 = require("./services/qwen.service");
const tts_service_1 = require("./services/tts.service");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [],
        controllers: [app_controller_1.AppController, projects_controller_1.ProjectsController],
        providers: [
            app_service_1.AppService,
            project_service_1.ProjectService,
            qwen_service_1.QwenService,
            flux_service_1.FluxService,
            hunyuan_service_1.HunyuanService,
            tts_service_1.TtsService,
            assembly_service_1.AssemblyService,
            idea_agent_1.IdeaAgent,
            story_agent_1.StoryAgent,
            script_agent_1.ScriptAgent,
            character_agent_1.CharacterAgent,
            prompt_agent_1.PromptAgent,
            image_agent_1.ImageAgent,
            video_agent_1.VideoAgent,
            audio_agent_1.AudioAgent,
            assembly_agent_1.AssemblyAgent,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map