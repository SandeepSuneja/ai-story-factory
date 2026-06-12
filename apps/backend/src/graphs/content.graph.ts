import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { IdeaAgent } from "../agents/idea.agent";
import { StoryAgent } from "../agents/story.agent";
import { ScriptAgent } from "../agents/script.agent";
import type { SceneScript } from "../content-state";
import { OpenAIService } from "../services/openai.service";

const ContentStateAnnotation = Annotation.Root({
  topic: Annotation<string>,
  idea: Annotation<string | undefined>,
  story: Annotation<string | undefined>,
  script: Annotation<SceneScript[] | undefined>,
});

const ai = new OpenAIService();
const ideaAgent = new IdeaAgent(ai);
const storyAgent = new StoryAgent(ai);
const scriptAgent = new ScriptAgent(ai);

export const contentGraph = new StateGraph(ContentStateAnnotation)
  .addNode("generateIdea", async state => ({
    idea: await ideaAgent.execute(state.topic),
  }))
  .addNode("writeStory", async state => ({
    story: await storyAgent.execute(state.idea!),
  }))
  .addNode("buildScript", async state => ({
    script: await scriptAgent.execute(state.story!),
  }))
  .addEdge(START, "generateIdea")
  .addEdge("generateIdea", "writeStory")
  .addEdge("writeStory", "buildScript")
  .addEdge("buildScript", END)
  .compile();
