"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.contentGraph = void 0;
const langgraph_1 = require("@langchain/langgraph");
const idea_agent_1 = require("../agents/idea.agent");
const story_agent_1 = require("../agents/story.agent");
const script_agent_1 = require("../agents/script.agent");
const qwen_service_1 = require("../services/qwen.service");
const ContentStateAnnotation = langgraph_1.Annotation.Root({
    topic: (langgraph_1.Annotation),
    idea: (langgraph_1.Annotation),
    story: (langgraph_1.Annotation),
    script: (langgraph_1.Annotation),
});
const ai = new qwen_service_1.QwenService();
const ideaAgent = new idea_agent_1.IdeaAgent(ai);
const storyAgent = new story_agent_1.StoryAgent(ai);
const scriptAgent = new script_agent_1.ScriptAgent(ai);
exports.contentGraph = new langgraph_1.StateGraph(ContentStateAnnotation)
    .addNode("generateIdea", async (state) => ({
    idea: await ideaAgent.execute(state.topic),
}))
    .addNode("writeStory", async (state) => ({
    story: await storyAgent.execute(state.idea),
}))
    .addNode("buildScript", async (state) => ({
    script: await scriptAgent.execute(state.story),
}))
    .addEdge(langgraph_1.START, "generateIdea")
    .addEdge("generateIdea", "writeStory")
    .addEdge("writeStory", "buildScript")
    .addEdge("buildScript", langgraph_1.END)
    .compile();
//# sourceMappingURL=content.graph.js.map