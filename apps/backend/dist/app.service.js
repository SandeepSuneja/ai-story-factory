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
const assembly_agent_1 = require("./agents/assembly.agent");
const audio_agent_1 = require("./agents/audio.agent");
const character_agent_1 = require("./agents/character.agent");
const idea_agent_1 = require("./agents/idea.agent");
const image_agent_1 = require("./agents/image.agent");
const prompt_agent_1 = require("./agents/prompt.agent");
const script_agent_1 = require("./agents/script.agent");
const video_agent_1 = require("./agents/video.agent");
const story_agent_1 = require("./agents/story.agent");
let AppService = class AppService {
    ideaAgent;
    storyAgent;
    scriptAgent;
    characterAgent;
    promptAgent;
    imageAgent;
    videoAgent;
    audioAgent;
    assemblyAgent;
    constructor(ideaAgent, storyAgent, scriptAgent, characterAgent, promptAgent, imageAgent, videoAgent, audioAgent, assemblyAgent) {
        this.ideaAgent = ideaAgent;
        this.storyAgent = storyAgent;
        this.scriptAgent = scriptAgent;
        this.characterAgent = characterAgent;
        this.promptAgent = promptAgent;
        this.imageAgent = imageAgent;
        this.videoAgent = videoAgent;
        this.audioAgent = audioAgent;
        this.assemblyAgent = assemblyAgent;
    }
    getHello() {
        return 'Hello World!';
    }
    async generateIdea(topic) {
        return { idea: await this.ideaAgent.execute(topic) };
    }
    async generateStory(idea) {
        return { story: await this.storyAgent.execute(idea) };
    }
    async generateScript(story) {
        return { script: await this.scriptAgent.execute(story) };
    }
    async generateCharacterProfile(story, script) {
        return {
            characterAppearance: await this.characterAgent.executeProfile(story, script),
        };
    }
    async generatePrompt(scene, characterAppearance) {
        const videoPrompt = await this.promptAgent.execute(scene, characterAppearance);
        return {
            scene: {
                ...scene,
                characterAppearance,
                videoPrompt,
            },
        };
    }
    async generateImage(scene) {
        return {
            scene: await this.imageAgent.execute(scene),
        };
    }
    async generateVideo(scene) {
        return {
            scene: await this.videoAgent.execute(scene),
        };
    }
    async generateAudio(scene) {
        return {
            scene: await this.audioAgent.execute(scene),
        };
    }
    async assembleVideo(scenes, projectName) {
        return {
            finalVideoPath: await this.assemblyAgent.execute(scenes, projectName),
        };
    }
};
exports.AppService = AppService;
exports.AppService = AppService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [idea_agent_1.IdeaAgent,
        story_agent_1.StoryAgent,
        script_agent_1.ScriptAgent,
        character_agent_1.CharacterAgent,
        prompt_agent_1.PromptAgent,
        image_agent_1.ImageAgent,
        video_agent_1.VideoAgent,
        audio_agent_1.AudioAgent,
        assembly_agent_1.AssemblyAgent])
], AppService);
//# sourceMappingURL=app.service.js.map