import { Injectable } from "@nestjs/common";
import type { SceneScript, StoryLanguage, VideoGenerationMode } from "../content-state";
import {
  imagePromptLanguageRule,
  videoPromptLanguageRule,
} from "../language";
import { QwenService } from "../services/qwen.service";

export interface ScenePrompts {
  imagePrompt: string;
  videoPrompt: string;
}

const PROMPT_MAX_TOKENS = 1024;
const MAX_VIDEO_WORDS = 45;
const MAX_PRO_VIDEO_WORDS = 100;
const MAX_IMAGE_WORDS = 50;

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

function extractJsonObject(text: string): string {
  const cleaned = stripModelWrappers(text);
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : cleaned;

  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return candidate.slice(start, end + 1);
  }

  return candidate;
}

function clampWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) {
    return text.trim();
  }
  return words.slice(0, maxWords).join(" ").replace(/[,;:\-–—]+$/, "").trim();
}

function sanitizeVideoPrompt(text: string, duration: number): string {
  let prompt = text
    .replace(/\*\*[^*]+:\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const forbidden =
    /\b(morph(?:ing|s)?|dissolv(?:e|ing|es)|explod(?:e|ing|es)|clone|duplicate|multiple versions?|split(?:ting)? screen|on-screen text|subtitle|caption|television screen|walking backwards|teleport|transform(?:s|ing)? into|world (?:changes|shifts)|appear(?:s|ing) out of thin air)\b/gi;
  prompt = prompt.replace(forbidden, "").replace(/\s+/g, " ").trim();

  const motionHint =
    duration <= 4
      ? "Very slow, subtle motion."
      : "Slow, smooth, continuous motion.";

  prompt = clampWords(prompt, MAX_VIDEO_WORDS);
  if (!prompt) {
    return motionHint;
  }

  if (!/\b(camera|pan|dolly|zoom|track|tilt|crane|push|pull|drift|glide|move|motion|wind|blink|breath|turn|step|walk|glow|flicker|pulse|sway)\b/i.test(prompt)) {
    prompt = `${motionHint} ${prompt}`;
  }

  return prompt;
}

function sanitizeProfessionalVideoPrompt(text: string, duration: number): string {
  let prompt = text
    .replace(/\*\*[^*]+:\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();

  prompt = clampWords(prompt, MAX_PRO_VIDEO_WORDS);
  if (!prompt) {
    return `Cinematic ${duration}-second clip. Smooth camera motion from the provided still image. Dramatic lighting and atmosphere.`;
  }

  return prompt;
}

function stripImageBoilerplate(text: string): string {
  return text
    .replace(/\b(horizontal\s*)?16\s*:\s*9\b[^.]*\.?/gi, "")
    .replace(/\b832\s*[x×]\s*480\b/gi, "")
    .replace(/\b(keyframe|frozen moment|single frame|photographable frame)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function compressCharacterAppearance(characterAppearance: string): string {
  const trimmed = characterAppearance.trim();
  const firstSentence = trimmed.split(/[.!?]/)[0]?.trim() ?? trimmed;
  return clampWords(firstSentence, 18);
}

function sanitizeImagePrompt(
  text: string,
  scene: SceneScript,
  characterAppearance: string,
): string {
  let prompt = stripImageBoilerplate(text);
  if (!prompt) {
    prompt = stripImageBoilerplate(
      `${scene.visualDescription}. ${compressCharacterAppearance(characterAppearance)}`,
    );
  }

  return clampWords(prompt, MAX_IMAGE_WORDS);
}

function parsePromptPair(
  raw: unknown,
  scene: SceneScript,
  characterAppearance: string,
  videoMode: VideoGenerationMode,
): ScenePrompts {
  if (!raw || typeof raw !== "object") {
    throw new Error("Prompt model output is not a JSON object.");
  }

  const value = raw as Record<string, unknown>;
  const imagePrompt = sanitizeImagePrompt(
    String(value.imagePrompt ?? ""),
    scene,
    characterAppearance,
  );
  const videoPrompt =
    videoMode === "professional"
      ? sanitizeProfessionalVideoPrompt(
          String(value.videoPrompt ?? ""),
          scene.duration,
        )
      : sanitizeVideoPrompt(String(value.videoPrompt ?? ""), scene.duration);

  if (!imagePrompt || !videoPrompt) {
    throw new Error("Prompt model output is missing imagePrompt or videoPrompt.");
  }

  return { imagePrompt, videoPrompt };
}

function buildPromptRequest(
  scene: SceneScript,
  characterAppearance: string,
  videoMode: VideoGenerationMode,
  language: StoryLanguage,
): string {
  const videoPromptBlock =
    videoMode === "professional"
      ? `VIDEO PROMPT (Kling AI / Google Veo / Runway — image-to-video):
- Maximum ${MAX_PRO_VIDEO_WORDS} words (2–4 cinematic sentences)
- Write for external I2V tools: user will upload the generated scene image plus this prompt
- Rich cinematic language: camera movement, subject motion, lighting, mood, atmosphere, environment
- One cohesive ${scene.duration}-second shot with smooth, continuous motion
- Reference motion continuing from the still image; do not repeat full character appearance or static layout
- 16:9 cinematic framing; photorealistic or stylized to match the scene
- Suitable for Kling AI, Google Veo, and Runway Gen-style image-to-video workflows`
      : `VIDEO PROMPT (Wan2.1 I2V — motion from the still above):
- Maximum ${MAX_VIDEO_WORDS} words (about 1–2 short sentences)
- Describe ONLY motion that can continue from a single still image
- Pick ONE primary motion: either one camera move OR one subtle subject motion — not both complex moves
- Do NOT repeat character appearance, clothing, or scene layout (the input image already shows them)
- Do NOT request: morphing worlds, dissolving cities, explosions, clones/duplicates appearing, on-screen text, new objects appearing, or major scene changes
- Match clip length (${scene.duration}s): use slow, gentle, continuous motion; no fast cuts or complex choreography
- Prefer concrete verbs: slow dolly in, gentle pan left, soft static flicker, subtle breathing, eyes blink, hair sways, light pulses`;

  return `Create two prompts for scene ${scene.sceneNumber} of a short film pipeline.

Return ONLY valid JSON in this exact shape:
{
  "imagePrompt": "static keyframe prompt for FLUX image generation",
  "videoPrompt": "${videoMode === "professional" ? "external I2V prompt for Kling/Veo/Runway" : "motion-only prompt for Wan2.1 image-to-video"}"
}

${imagePromptLanguageRule(language)}
${videoPromptLanguageRule(language, videoMode)}

IMAGE PROMPT (FLUX — static keyframe, CLIP max 77 tokens):
- Maximum ${MAX_IMAGE_WORDS} words total — shorter is better
- Structure: scene action first, then a brief character tag (hair + outfit only, ~10 words), then lighting/mood (~5 words)
- Summarize character appearance; do NOT paste the full character sheet
- Do NOT include resolution, aspect ratio, or "832x480" (the pipeline sets size)
- Do NOT describe camera movement or animation
- Avoid on-screen text, subtitles, split screens, or multiple copies of the character

${videoPromptBlock}

Character appearance (use in imagePrompt only):
${characterAppearance}

Scene narration:
${scene.narration}

Scene visual (single frame to illustrate):
${scene.visualDescription}

Scene duration: ${scene.duration} seconds`;
}

function buildFallbackVideoPrompt(
  scene: SceneScript,
  videoMode: VideoGenerationMode,
): string {
  const visual = scene.visualDescription.trim();

  if (videoMode === "professional") {
    return clampWords(
      `Cinematic ${scene.duration}-second shot from the still image. ${visual}. Slow dolly in with dramatic lighting, atmospheric depth, and smooth natural motion.`,
      MAX_PRO_VIDEO_WORDS,
    );
  }

  const durationHint =
    scene.duration <= 4
      ? "Very slow subtle motion."
      : "Slow smooth continuous motion.";

  if (/static|flicker|pixel/i.test(visual)) {
    return `${durationHint} Gentle camera push-in while pixel static softly flickers across the scene.`;
  }
  if (/walk/i.test(visual)) {
    return `${durationHint} Slow tracking shot as the subject walks forward with natural movement.`;
  }
  if (/stand|frozen|still/i.test(visual)) {
    return `${durationHint} Subtle push-in; subject holds still with slight breathing and soft ambient light shift.`;
  }

  return `${durationHint} Slow cinematic push-in with natural ambient movement.`;
}

function buildFallbackImagePrompt(
  scene: SceneScript,
  characterAppearance: string,
): string {
  return clampWords(
    [
      scene.visualDescription,
      compressCharacterAppearance(characterAppearance),
      "cinematic lighting, photorealistic.",
    ].join(" "),
    MAX_IMAGE_WORDS,
  );
}

@Injectable()
export class PromptAgent {
  constructor(private readonly ai: QwenService) {}

  async execute(
    scene: SceneScript,
    characterAppearance: string,
    videoMode: VideoGenerationMode = "local",
    language: StoryLanguage = "en",
  ): Promise<ScenePrompts> {
    const attempts = [
      buildPromptRequest(scene, characterAppearance, videoMode, language),
      `${buildPromptRequest(scene, characterAppearance, videoMode, language)}

Your previous answer was invalid JSON. Reply again with ONLY the JSON object.`,
    ];

    let lastError: Error | null = null;

    for (const prompt of attempts) {
      try {
        const text = await this.ai.generate(prompt, {
          maxTokens: PROMPT_MAX_TOKENS,
        });
        const parsed = parsePromptPair(
          JSON.parse(extractJsonObject(text)),
          scene,
          characterAppearance,
          videoMode,
        );
        return parsed;
      } catch (error) {
        lastError =
          error instanceof Error
            ? error
            : new Error("Failed to parse prompt JSON.");
      }
    }

    if (lastError) {
      // Fall back so the pipeline can continue even if the model returns bad JSON.
      return {
        imagePrompt: buildFallbackImagePrompt(scene, characterAppearance),
        videoPrompt: buildFallbackVideoPrompt(scene, videoMode),
      };
    }

    throw new Error("Failed to generate prompts.");
  }
}
