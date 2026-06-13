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
const character_agent_1 = require("./agents/character.agent");
const idea_agent_1 = require("./agents/idea.agent");
const prompt_agent_1 = require("./agents/prompt.agent");
const script_agent_1 = require("./agents/script.agent");
const story_agent_1 = require("./agents/story.agent");
let AppService = class AppService {
    ideaAgent;
    storyAgent;
    scriptAgent;
    characterAgent;
    promptAgent;
    constructor(ideaAgent, storyAgent, scriptAgent, characterAgent, promptAgent) {
        this.ideaAgent = ideaAgent;
        this.storyAgent = storyAgent;
        this.scriptAgent = scriptAgent;
        this.characterAgent = characterAgent;
        this.promptAgent = promptAgent;
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
};
exports.AppService = AppService;
exports.AppService = AppService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [idea_agent_1.IdeaAgent,
        story_agent_1.StoryAgent,
        script_agent_1.ScriptAgent,
        character_agent_1.CharacterAgent,
        prompt_agent_1.PromptAgent])
], AppService);
//# sourceMappingURL=app.service.js.map