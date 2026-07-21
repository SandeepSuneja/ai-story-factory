import { Injectable } from "@nestjs/common";
import type {
  DialogueLine,
  SceneScript,
  StoryLanguage,
  VideoGenerationMode,
} from "../content-state";
import { inferDialogueFromNarration } from "../characters";
import {
  contentLanguageRule,
  dialogueLanguageRule,
} from "../language";
import {
  appendSourceMaterial,
  scriptRulesWithSource,
  type SourceFidelityContext,
} from "../source-fidelity";
import { QwenService } from "../services/qwen.service";

const SCRIPT_MAX_TOKENS_LOCAL = 4096;
const SCRIPT_MAX_TOKENS_PRO = 8192;
const MAX_SCENES_LOCAL = 8;
const MAX_SCENE_DURATION_LOCAL = 6;
const MAX_SCENE_DURATION_PRO = 15;

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

function normalizeDialogue(raw: unknown): DialogueLine[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((entry): DialogueLine | null => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const value = entry as Record<string, unknown>;
      const text = String(value.text ?? "").trim();
      const speaker = String(
        value.speaker ?? value.character ?? value.characterId ?? "",
      ).trim();
      if (!text || !speaker) {
        return null;
      }
      return {
        characterId: speaker.toLowerCase().replace(/\s+/g, "-"),
        speaker,
        text,
      };
    })
    .filter((line): line is DialogueLine => line !== null);
}

function buildNarrationFromDialogue(dialogue: DialogueLine[]): string {
  if (dialogue.length === 0) {
    return "";
  }
  return dialogue.map((line) => `${line.speaker}: ${line.text}`).join("\n");
}

function normalizeScenes(
  raw: unknown,
  videoMode: VideoGenerationMode,
): SceneScript[] {
  if (!Array.isArray(raw)) {
    throw new Error("Script model output is not a JSON array.");
  }

  if (raw.length === 0) {
    throw new Error("Script model output did not contain any scenes.");
  }

  const maxDuration =
    videoMode === "professional"
      ? MAX_SCENE_DURATION_PRO
      : MAX_SCENE_DURATION_LOCAL;
  const scenes =
    videoMode === "professional" ? raw : raw.slice(0, MAX_SCENES_LOCAL);

  return scenes.map((scene, index) => {
    if (!scene || typeof scene !== "object") {
      throw new Error(`Scene ${index + 1} is invalid.`);
    }

    const value = scene as Record<string, unknown>;
    const narration = String(value.narration ?? "").trim();
    let dialogue = normalizeDialogue(value.dialogue);
    if (dialogue.length === 0 && narration) {
      dialogue = inferDialogueFromNarration(narration);
    }
    const resolvedNarration =
      narration || buildNarrationFromDialogue(dialogue);

    return {
      sceneNumber: Number(value.sceneNumber ?? index + 1),
      narration: resolvedNarration,
      visualDescription: String(value.visualDescription ?? "").trim(),
      duration: Math.min(
        maxDuration,
        Math.max(1, Number(value.duration ?? 3)),
      ),
      dialogue,
    };
  });
}

function parseJsonFromModel(
  text: string,
  videoMode: VideoGenerationMode,
): SceneScript[] {
  const jsonText = extractJsonArray(text);

  try {
    return normalizeScenes(JSON.parse(jsonText), videoMode);
  } catch {
    const salvaged = extractCompleteJsonObjects(jsonText);
    if (salvaged.length > 0) {
      return normalizeScenes(salvaged, videoMode);
    }

    throw new Error("Could not parse or salvage any scenes from model output.");
  }
}

function buildScriptPrompt(
  story: string,
  language: StoryLanguage,
  videoMode: VideoGenerationMode,
  strict = false,
  sourceContext?: SourceFidelityContext,
): string {
  const contentRule = contentLanguageRule();
  const dialogueRule = dialogueLanguageRule(language);
  const dialogueField = "spoken line in English";
  const visualField =
    "what appears on screen in English, naming every visible character";
  const isPro = videoMode === "professional";

  const rules = isPro
    ? strict
      ? `
Rules:
- Return ONLY valid JSON.
- There is NO maximum scene count. Use as many scenes as needed to cover the full story.
- Cover every major story beat: setup, rising action, key turns, climax, and resolution. Do not skip plot points.
- Preserve story order — scenes must follow the narrative sequence from beginning to end.
- Each scene duration must be 3 to ${MAX_SCENE_DURATION_PRO} seconds.
- Include every named character from the story; there is no upper limit on cast size
- Each scene must name every visible character in visualDescription
- Each scene must include dialogue for the characters who speak in that scene
- Keep each dialogue line up to 35 words — use fuller lines rather than one-sentence summaries.
- Keep each visualDescription under 24 words.
- Each visualDescription must describe ONE static photographable frame with all visible characters named (no camera moves, morphing, on-screen text, or duplicate clones of the same character).
- Do not truncate the JSON. Always close every string and end with ].`
      : `
Rules:
- Return ONLY valid JSON.
- There is NO maximum scene count. Break the story into as many scenes as needed for complete coverage.
- Cover every important moment of the story from beginning to end — do not compress or omit plot points to stay short.
- Preserve story order — scenes must follow the narrative sequence from beginning to end.
- Prefer completeness over brevity; a long scene list is better than an incomplete story.
- Each scene duration must be 3 to ${MAX_SCENE_DURATION_PRO} seconds.
- Include every named character from the story; there is no upper limit on cast size
- Each scene must name every visible character in visualDescription
- Each scene must include dialogue for the characters who speak in that scene
- Keep each dialogue line up to 35 words — use fuller lines rather than one-sentence summaries.
- Keep each visualDescription under 28 words.
- Each visualDescription must describe ONE static photographable frame with all visible characters named (no camera moves, morphing, on-screen text, or duplicate clones of the same character).
- Escape double quotes inside strings.
- Do not truncate the JSON. Always close every string and end with ].`
    : strict
      ? `
Rules:
- Return ONLY valid JSON.
- Use exactly 4 to 6 scenes.
- Each scene duration must be 3 to ${MAX_SCENE_DURATION_LOCAL} seconds.
- Include every named character from the story; there is no upper limit on cast size
- Each scene must name every visible character in visualDescription
- Each scene must include dialogue for the characters who speak in that scene
- Keep each dialogue line up to 35 words.
- Keep each visualDescription under 16 words.
- Each visualDescription must describe ONE static photographable frame with all visible characters named (no camera moves, morphing, on-screen text, or duplicate clones of the same character).
- Do not truncate the JSON. Always close every string and end with ].`
      : `
Rules:
- Return ONLY valid JSON.
- Use 4 to ${MAX_SCENES_LOCAL} scenes.
- Each scene duration must be 3 to ${MAX_SCENE_DURATION_LOCAL} seconds.
- Include every named character from the story; there is no upper limit on cast size
- Each scene must name every visible character in visualDescription
- Each scene must include dialogue for the characters who speak in that scene
- Keep each dialogue line up to 35 words.
- Keep each visualDescription under 20 words.
- Each visualDescription must describe ONE static photographable frame with all visible characters named (no camera moves, morphing, on-screen text, or duplicate clones of the same character).
- Escape double quotes inside strings.
- Do not truncate the JSON. Always close every string and end with ].`;

  const sourceRules = sourceContext ? `\n${scriptRulesWithSource()}` : "";
  const pipelineNote = isPro
    ? "\nThese scenes will be produced with professional external tools (Kling AI, Google Veo, etc.). Completeness of story coverage matters more than keeping the video short."
    : "";

  return appendSourceMaterial(
    `Convert the story into short video scenes with character dialogue.${rules}${sourceRules}${pipelineNote}
${contentRule}
${dialogueRule}
- narration, visualDescription, and dialogue.text must be in English.
- Use the same speaker names consistently across all scenes.

Use this exact shape:
[
  {
    "sceneNumber": 1,
    "duration": ${isPro ? 8 : 6},
    "visualDescription": "${visualField}",
    "dialogue": [
      { "speaker": "Maya", "text": "${dialogueField}" },
      { "speaker": "Raj", "text": "${dialogueField}" }
    ]
  }
]

Story:
${story}
`,
    sourceContext,
  );
}

@Injectable()
export class ScriptAgent {
  constructor(private readonly ai: QwenService) {}

  async execute(
    story: string,
    language: StoryLanguage = "en",
    sourceContext?: SourceFidelityContext,
    videoMode: VideoGenerationMode = "local",
  ): Promise<SceneScript[]> {
    const maxTokens =
      videoMode === "professional"
        ? SCRIPT_MAX_TOKENS_PRO
        : SCRIPT_MAX_TOKENS_LOCAL;
    const attempts = [
      buildScriptPrompt(story, language, videoMode, false, sourceContext),
      `${buildScriptPrompt(story, language, videoMode, true, sourceContext)}

Your previous answer was invalid or truncated JSON. Reply again with ONLY the JSON array.`,
    ];

    let lastError: Error | null = null;

    for (const prompt of attempts) {
      try {
        const text = await this.ai.generate(prompt, {
          maxTokens,
        });
        return parseJsonFromModel(text, videoMode);
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
