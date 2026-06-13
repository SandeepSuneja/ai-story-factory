import { Injectable } from "@nestjs/common";
import type { SceneScript } from "../content-state";
import { OpenAIService } from "../services/openai.service";

function parseJsonFromModel(text: string): SceneScript[] {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const jsonText = fenceMatch ? fenceMatch[1].trim() : trimmed;

  return JSON.parse(jsonText) as SceneScript[];
}

@Injectable()
export class ScriptAgent {
  constructor(private readonly ai: OpenAIService) {}

  async execute(story: string): Promise<SceneScript[]> {
    const prompt = `
Convert story into short video scenes.

Return only raw JSON with no markdown or code fences:

[
 {
   "sceneNumber":1,
   "duration":5,
   "narration":"",
   "visualDescription":""
 }
]

Story:
${story}
`;

    return parseJsonFromModel(await this.ai.generate(prompt));
  }
}
