import { Injectable } from "@nestjs/common";
import type { SceneScript } from "../content-state";
import { QwenService } from "../services/qwen.service";

const SCRIPT_MAX_TOKENS = 4096;
const MAX_SCENES = 8;
const MAX_SCENE_DURATION_SECONDS = 6;

function stripModelWrappers(text: string): string {
  let cleaned = text.trim();

  cleaned = cleaned.replace(
    /<\s*redacted_thinking\s*>[\s\S]*?<\s*\/\s*redacted_thinking\s*>/gi,
    "",
  );
  cleaned = cleaned.replace(/[\s\S]*?<\/think>/gi, "");
  cleaned = cleaned.replace(/^<\s*think\s*>[\s\S]*?(?=\[|{)/i, "");

  return cleaned.trim();
}

function extractJsonArray(text: string): string {
  const cleaned = stripModelWrappers(text);
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : cleaned;

  const start = candidate.indexOf("[");
  const end = candidate.lastIndexOf("]");
  if (start !== -1 && end !== -1 && end > start) {
    return candidate.slice(start, end + 1);
  }

  if (start !== -1) {
    return candidate.slice(start);
  }

  return candidate;
}

function extractCompleteJsonObjects(text: string): unknown[] {
  const objects: unknown[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\" && inString) {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      if (depth === 0) {
        start = index;
      }
      depth += 1;
      continue;
    }

    if (char === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start !== -1) {
        const snippet = text.slice(start, index + 1);
        try {
          objects.push(JSON.parse(snippet));
        } catch {
          // Ignore malformed objects and keep scanning.
        }
        start = -1;
      }
    }
  }

  return objects;
}

function normalizeScenes(raw: unknown): SceneScript[] {
  if (!Array.isArray(raw)) {
    throw new Error("Script model output is not a JSON array.");
  }

  if (raw.length === 0) {
    throw new Error("Script model output did not contain any scenes.");
  }

  return raw.slice(0, MAX_SCENES).map((scene, index) => {
    if (!scene || typeof scene !== "object") {
      throw new Error(`Scene ${index + 1} is invalid.`);
    }

    const value = scene as Record<string, unknown>;
    return {
      sceneNumber: Number(value.sceneNumber ?? index + 1),
      narration: String(value.narration ?? "").trim(),
      visualDescription: String(value.visualDescription ?? "").trim(),
      duration: Math.min(
        MAX_SCENE_DURATION_SECONDS,
        Math.max(1, Number(value.duration ?? 3)),
      ),
    };
  });
}

function parseJsonFromModel(text: string): SceneScript[] {
  const jsonText = extractJsonArray(text);

  try {
    return normalizeScenes(JSON.parse(jsonText));
  } catch {
    const salvaged = extractCompleteJsonObjects(jsonText);
    if (salvaged.length > 0) {
      return normalizeScenes(salvaged);
    }

    throw new Error("Could not parse or salvage any scenes from model output.");
  }
}

function buildScriptPrompt(story: string, strict = false): string {
  const rules = strict
    ? `
Rules:
- Return ONLY valid JSON.
- Use exactly 4 to 6 scenes.
- Each scene duration must be 3 to 6 seconds.
- Keep each narration under 12 words.
- Keep each visualDescription under 12 words.
- Do not truncate the JSON. Always close every string and end with ].`
    : `
Rules:
- Return ONLY valid JSON.
- Use 4 to ${MAX_SCENES} scenes.
- Each scene duration must be 3 to ${MAX_SCENE_DURATION_SECONDS} seconds.
- Keep each narration under 18 words.
- Keep each visualDescription under 18 words.
- Escape double quotes inside strings.
- Do not truncate the JSON. Always close every string and end with ].`;

  return `Convert the story into short video scenes.${rules}

Use this exact shape:
[
  {
    "sceneNumber": 1,
    "duration": 6,
    "narration": "spoken line for the scene",
    "visualDescription": "what appears on screen"
  }
]

Story:
${story}
`;
}

@Injectable()
export class ScriptAgent {
  constructor(private readonly ai: QwenService) {}

  async execute(story: string): Promise<SceneScript[]> {
    const attempts = [
      buildScriptPrompt(story, false),
      `${buildScriptPrompt(story, true)}

Your previous answer was invalid or truncated JSON. Reply again with ONLY the JSON array.`,
    ];

    let lastError: Error | null = null;

    for (const prompt of attempts) {
      try {
        const text = await this.ai.generate(prompt, {
          maxTokens: SCRIPT_MAX_TOKENS,
        });
        return parseJsonFromModel(text);
      } catch (error) {
        lastError =
          error instanceof Error
            ? error
            : new Error("Failed to parse script JSON.");
      }
    }

    throw lastError ?? new Error("Failed to generate script.");
  }
}
