import { Injectable } from "@nestjs/common";
import type {
  SceneScript,
  SeriesVisualStyle,
  StoryCharacter,
  StoryLanguage,
  VideoGenerationMode,
} from "../content-state";
import {
  buildSpeakingMotionHint,
  formatCharactersForPrompt,
  formatVisualStyleForPrompt,
  getCharactersForScene,
  getSpeakingCharacters,
} from "../characters";
import { classifySceneImageTemplate, classifyEpisodeSceneSetup } from "../scene-image";
import {
  buildTierASceneImagePrompt,
  ensureAllSceneCharactersInTierAPrompt,
  TIER_A_FLUX_IMAGE_PROMPT_MAX_WORDS,
} from "../scene-image-prompt";
import {
  imagePromptLanguageRule,
  videoPromptLanguageRule,
} from "../language";
import {
  imagePromptAnimationSuffix,
  mergeVisualStyle,
} from "../visual-style";
import {
  appendSourceMaterial,
  promptRulesWithSource,
  type SourceFidelityContext,
} from "../source-fidelity";
import { QwenService } from "../services/qwen.service";

export interface ScenePrompts {
  imagePrompt: string;
  videoPrompt: string;
}

const PROMPT_MAX_TOKENS = 1024;
const PROMPT_MAX_TOKENS_PRO = 1536;
const MAX_VIDEO_WORDS = 45;
const MAX_PRO_VIDEO_WORDS = 120;
const MAX_PRO_IMAGE_WORDS = 180;
const FLUX_CLIP_TARGET_WORDS = TIER_A_FLUX_IMAGE_PROMPT_MAX_WORDS;

function imagePromptWordBudget(_characterCount: number): number {
  return FLUX_CLIP_TARGET_WORDS;
}

function buildFluxOptimizedImagePrompt(
  scene: SceneScript,
  sceneCharacters: StoryCharacter[],
  visualStyle?: SeriesVisualStyle,
): string {
  return buildTierASceneImagePrompt(scene, sceneCharacters, visualStyle);
}

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

  if (!/\b(camera|pan|dolly|zoom|track|tilt|crane|push|pull|drift|glide|move|motion|wind|blink|breath|turn|step|walk|glow|flicker|pulse|sway|speak|lip|mouth|jaw|talk)\b/i.test(prompt)) {
    prompt = `${motionHint} ${prompt}`;
  }

  return prompt;
}

function enhanceVideoPromptForTalking(
  prompt: string,
  scene: SceneScript,
  maxWords: number,
): string {
  const speakingHint = buildSpeakingMotionHint(scene);
  if (!speakingHint) {
    return prompt;
  }

  const combined = `${prompt} ${speakingHint}`.replace(/\s+/g, " ").trim();
  return clampWords(combined, maxWords);
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

function sanitizeProfessionalImagePrompt(
  text: string,
  scene: SceneScript,
  sceneCharacters: StoryCharacter[],
  visualStyle?: SeriesVisualStyle,
): string {
  let prompt = text
    .replace(/\*\*[^*]+:\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!prompt) {
    return buildFallbackProfessionalImagePrompt(
      scene,
      sceneCharacters,
      visualStyle,
    );
  }

  for (const character of sceneCharacters) {
    if (!new RegExp(`\\b${escapeRegExp(character.name)}\\b`, "i").test(prompt)) {
      prompt = `${prompt} ${character.name}: ${character.appearance}`.replace(
        /\s+/g,
        " ",
      );
    }
  }

  return clampWords(prompt, MAX_PRO_IMAGE_WORDS);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ensureAllSceneCharactersInImagePrompt(
  prompt: string,
  sceneCharacters: StoryCharacter[],
): string {
  return ensureAllSceneCharactersInTierAPrompt(prompt, sceneCharacters);
}

export function sanitizeImagePrompt(
  _text: string,
  scene: SceneScript,
  sceneCharacters: StoryCharacter[],
  visualStyle?: SeriesVisualStyle,
): string {
  let prompt = buildFluxOptimizedImagePrompt(
    scene,
    sceneCharacters,
    visualStyle,
  );

  prompt = ensureAllSceneCharactersInImagePrompt(prompt, sceneCharacters);

  return prompt;
}

function parsePromptPair(
  raw: unknown,
  scene: SceneScript,
  sceneCharacters: StoryCharacter[],
  videoMode: VideoGenerationMode,
  visualStyle?: SeriesVisualStyle,
): ScenePrompts {
  if (!raw || typeof raw !== "object") {
    throw new Error("Prompt model output is not a JSON object.");
  }

  const value = raw as Record<string, unknown>;

  if (videoMode === "professional") {
    const imagePrompt = sanitizeProfessionalImagePrompt(
      String(value.imagePrompt ?? ""),
      scene,
      sceneCharacters,
      visualStyle,
    );
    const rawVideoPrompt = sanitizeProfessionalVideoPrompt(
      String(value.videoPrompt ?? ""),
      scene.duration,
    );
    const videoPrompt = enhanceVideoPromptForTalking(
      rawVideoPrompt,
      scene,
      MAX_PRO_VIDEO_WORDS,
    );

    if (!imagePrompt || !videoPrompt) {
      throw new Error(
        "Prompt model output is missing imagePrompt or videoPrompt.",
      );
    }

    return { imagePrompt, videoPrompt };
  }

  const imagePrompt = sanitizeImagePrompt(
    String(value.imagePrompt ?? ""),
    scene,
    sceneCharacters,
    visualStyle,
  );
  const rawVideoPrompt = sanitizeVideoPrompt(
    String(value.videoPrompt ?? ""),
    scene.duration,
  );
  const videoPrompt = enhanceVideoPromptForTalking(
    rawVideoPrompt,
    scene,
    MAX_VIDEO_WORDS,
  );

  if (!imagePrompt || !videoPrompt) {
    throw new Error("Prompt model output is missing imagePrompt or videoPrompt.");
  }

  return { imagePrompt, videoPrompt };
}

function formatSceneDialogue(scene: SceneScript): string {
  if (!Array.isArray(scene.dialogue) || scene.dialogue.length === 0) {
    return scene.narration;
  }

  return scene.dialogue
    .map((line) => `${line.speaker ?? line.characterId}: ${line.text}`)
    .join("\n");
}

function recommendedProfessionalVideoPlatform(scene: SceneScript): string {
  if (scene.duration >= 8) {
    return "Google Veo (longer cinematic shot)";
  }
  if (getSpeakingCharacters(scene).length > 0) {
    return "Kling AI I2V (dialogue performance)";
  }
  return "Kling AI or Runway Gen I2V";
}

function buildPromptRequest(
  scene: SceneScript,
  characters: StoryCharacter[],
  videoMode: VideoGenerationMode,
  language: StoryLanguage,
  visualStyle?: SeriesVisualStyle,
  sourceContext?: SourceFidelityContext,
): string {
  const sceneCharacters = getCharactersForScene(scene, characters);
  const characterBlock = formatCharactersForPrompt(sceneCharacters);
  const resolvedStyle = mergeVisualStyle(visualStyle);
  const seriesStyleBlock = formatVisualStyleForPrompt(resolvedStyle);
  const animationSuffix = imagePromptAnimationSuffix(resolvedStyle.animationStyle);

  if (videoMode === "professional") {
    return buildProfessionalPromptRequest(
      scene,
      sceneCharacters,
      characterBlock,
      seriesStyleBlock,
      animationSuffix,
      language,
      sourceContext,
    );
  }

  const videoPromptBlock = `VIDEO PROMPT (Wan2.1 I2V — motion from the still above):
- Maximum ${MAX_VIDEO_WORDS} words (about 1–2 short sentences)
- Describe ONLY motion that can continue from a single still image
- Pick ONE primary motion: either one camera move OR one subtle subject motion — not both complex moves
- Do NOT repeat character appearance, clothing, or scene layout (the input image already shows them)
- Do NOT request: morphing worlds, dissolving cities, explosions, clones/duplicates appearing, on-screen text, new objects appearing, or major scene changes
- Match clip length (${scene.duration}s): use slow, gentle, continuous motion; no fast cuts or complex choreography
- Prefer concrete verbs: slow dolly in, gentle pan left, soft static flicker, subtle breathing, eyes blink, hair sways, light pulses
- When characters speak in the scene dialogue, include subtle lip movement and natural jaw motion for the speaking character(s)`;

  const speakingNames = getSpeakingCharacters(scene);
  const talkingRules =
    speakingNames.length > 0
      ? `
Talking characters in this scene: ${speakingNames.join(", ")}.
- videoPrompt only: include subtle lip sync, jaw motion, and small conversational gestures for whoever is speaking`
      : "";

  const sourceRules = sourceContext ? `\n${promptRulesWithSource()}` : "";
  const characterCount = sceneCharacters.length;
  const imageWordBudget = imagePromptWordBudget(characterCount);
  const sceneTemplate = classifySceneImageTemplate(scene);
  const sceneSetup = classifyEpisodeSceneSetup(scene);

  return appendSourceMaterial(
    `Create two prompts for scene ${scene.sceneNumber} of a short film pipeline.

Return ONLY valid JSON in this exact shape:
{
  "imagePrompt": "static keyframe prompt for FLUX image generation",
  "videoPrompt": "motion-only prompt for Wan2.1 image-to-video"
}

${imagePromptLanguageRule(language)}
${videoPromptLanguageRule(language, videoMode)}

IMAGE PROMPT (FLUX Tier A — ~${imageWordBudget} words, CLIP 77-token hard limit):
- Maximum ${imageWordBudget} words — never exceed this
- Scene template for this shot: ${sceneTemplate}
- Blocking setup for this shot: ${sceneSetup}
- Required: single unified forest background for both characters — no split panels, no flat color backdrop behind one character only
- Blocking: Valmiki seated left on stone under banyan; Narada standing right with veena staff unless setup is narada_hero or valmiki_reaction
- Required format: "[scene action from visual description]. [unified forest anchor]. Name: visual tag; Name: visual tag. All ${characterCount} visible: ${sceneCharacters.map((c) => c.name).join(", ")}. [short composition]. ${animationSuffix}"
- Use each character's visual trait tag from the character list below (locked tags are authoritative)
- Always follow the scene visual description — do not invent new locations or poses
- Do NOT include guardrails, resolution, aspect ratio, camera movement, or talking/lip hints (added server-side)
- Do NOT use live-action, photorealistic, or documentary language
- Avoid on-screen text, subtitles, split screens, or duplicate clones${sourceRules}
${talkingRules}

${videoPromptBlock}

${seriesStyleBlock ? `Series visual consistency (apply to imagePrompt composition):\n${seriesStyleBlock}\n` : ""}Characters in this scene (use in imagePrompt only):
${characterBlock}

Scene dialogue:
${formatSceneDialogue(scene)}

Scene visual (single frame to illustrate):
${scene.visualDescription}

Scene duration: ${scene.duration} seconds`,
    sourceContext,
  );
}

function buildProfessionalPromptRequest(
  scene: SceneScript,
  sceneCharacters: StoryCharacter[],
  characterBlock: string,
  seriesStyleBlock: string,
  animationSuffix: string,
  language: StoryLanguage,
  sourceContext?: SourceFidelityContext,
): string {
  const speakingNames = getSpeakingCharacters(scene);
  const talkingRules =
    speakingNames.length > 0
      ? `
Talking characters in this scene: ${speakingNames.join(", ")}.
- videoPrompt: include natural lip sync, facial performance, and conversational gestures`
      : "";
  const sourceRules = sourceContext ? `\n${promptRulesWithSource()}` : "";
  const platform = recommendedProfessionalVideoPlatform(scene);

  return appendSourceMaterial(
    `Create two prompts for scene ${scene.sceneNumber} for professional external tools (Kling AI, Google Veo, Runway, Midjourney).

Return ONLY valid JSON in this exact shape:
{
  "imagePrompt": "still keyframe prompt for Midjourney / Kling image / similar",
  "videoPrompt": "image-to-video prompt for Kling AI / Google Veo / Runway"
}

${imagePromptLanguageRule(language)}
${videoPromptLanguageRule(language, "professional")}

IMAGE PROMPT (Midjourney / Kling Image / Leonardo — still keyframe):
- Maximum ${MAX_PRO_IMAGE_WORDS} words
- Rich cinematic still suitable as the first frame for image-to-video
- Name every visible character and include stable appearance details from the character list
- Describe setting, lighting, composition, mood, and ${animationSuffix}
- 16:9 cinematic framing unless visual style says otherwise
- No on-screen text, subtitles, watermarks, or split panels
- Do not invent new locations or outfits beyond the scene visual and character list

VIDEO PROMPT (Kling AI / Google Veo / Runway — image-to-video):
- Maximum ${MAX_PRO_VIDEO_WORDS} words (2–4 cinematic sentences)
- Written for external I2V: user uploads the generated scene still plus this prompt
- Camera movement, subject motion, lighting shifts, atmosphere, environment
- One cohesive ${scene.duration}-second shot with smooth continuous motion
- Reference motion continuing from the still; do not repeat full static appearance
- Suitable for Kling AI, Google Veo, and Runway Gen-style workflows
- Recommended platform for this scene: ${platform}
${sourceRules}
${talkingRules}

${seriesStyleBlock ? `Series visual consistency:\n${seriesStyleBlock}\n` : ""}Characters in this scene:
${characterBlock}

Scene dialogue:
${formatSceneDialogue(scene)}

Scene visual (single frame to illustrate):
${scene.visualDescription}

Scene duration: ${scene.duration} seconds`,
    sourceContext,
  );
}

function buildFallbackVideoPrompt(
  scene: SceneScript,
  videoMode: VideoGenerationMode,
  visualStyle?: SeriesVisualStyle,
): string {
  const resolvedStyle = mergeVisualStyle(visualStyle);
  const animatedHint =
    resolvedStyle.animationStyle === "3d"
      ? "Smooth 3D animated motion."
      : "Smooth 2D animated motion.";
  const visual = scene.visualDescription.trim();

  if (videoMode === "professional") {
    return enhanceVideoPromptForTalking(
      clampWords(
        `${animatedHint} Cinematic ${scene.duration}-second shot from the still image. ${visual}. Slow dolly in with dramatic lighting, atmospheric depth, and smooth natural motion.`,
        MAX_PRO_VIDEO_WORDS,
      ),
      scene,
      MAX_PRO_VIDEO_WORDS,
    );
  }

  const durationHint =
    scene.duration <= 4
      ? "Very slow subtle motion."
      : "Slow smooth continuous motion.";

  if (/static|flicker|pixel/i.test(visual)) {
    return enhanceVideoPromptForTalking(
      `${durationHint} Gentle camera push-in while pixel static softly flickers across the scene.`,
      scene,
      MAX_VIDEO_WORDS,
    );
  }
  if (/walk/i.test(visual)) {
    return enhanceVideoPromptForTalking(
      `${durationHint} Slow tracking shot as the subject walks forward with natural movement.`,
      scene,
      MAX_VIDEO_WORDS,
    );
  }
  if (/stand|frozen|still/i.test(visual)) {
    return enhanceVideoPromptForTalking(
      `${durationHint} Subtle push-in; subject holds still with slight breathing and soft ambient light shift.`,
      scene,
      MAX_VIDEO_WORDS,
    );
  }

  const base = `${durationHint} Slow cinematic push-in with natural ambient movement.`;
  return enhanceVideoPromptForTalking(base, scene, MAX_VIDEO_WORDS);
}

function buildFallbackImagePrompt(
  scene: SceneScript,
  sceneCharacters: StoryCharacter[],
  visualStyle?: SeriesVisualStyle,
): string {
  return buildFluxOptimizedImagePrompt(scene, sceneCharacters, visualStyle);
}

function buildFallbackProfessionalImagePrompt(
  scene: SceneScript,
  sceneCharacters: StoryCharacter[],
  visualStyle?: SeriesVisualStyle,
): string {
  const resolvedStyle = mergeVisualStyle(visualStyle);
  const styleHint = imagePromptAnimationSuffix(resolvedStyle.animationStyle);
  const characterBits = sceneCharacters
    .map((character) => `${character.name}: ${character.appearance}`)
    .join(". ");
  return clampWords(
    `Cinematic still frame. ${scene.visualDescription}. ${characterBits}. ${styleHint}. Dramatic lighting, detailed environment, 16:9 composition.`,
    MAX_PRO_IMAGE_WORDS,
  );
}

export function buildProfessionalPortraitPrompt(
  character: StoryCharacter,
  visualStyle?: SeriesVisualStyle,
): string {
  const resolvedStyle = mergeVisualStyle(visualStyle);
  const styleHint = imagePromptAnimationSuffix(resolvedStyle.animationStyle);
  return clampWords(
    `Character reference portrait of ${character.name}, ${character.role}. ${character.appearance}. ${styleHint}. Full-body or three-quarter view, neutral pose, clean background, consistent identity sheet, highly detailed face and costume, 16:9.`,
    MAX_PRO_IMAGE_WORDS,
  );
}

@Injectable()
export class PromptAgent {
  constructor(private readonly ai: QwenService) {}

  async execute(
    scene: SceneScript,
    characters: StoryCharacter[],
    videoMode: VideoGenerationMode = "local",
    language: StoryLanguage = "en",
    visualStyle?: SeriesVisualStyle,
    sourceContext?: SourceFidelityContext,
  ): Promise<ScenePrompts> {
    const sceneCharacters = getCharactersForScene(scene, characters);
    const attempts = [
      buildPromptRequest(scene, characters, videoMode, language, visualStyle, sourceContext),
      `${buildPromptRequest(scene, characters, videoMode, language, visualStyle, sourceContext)}

Your previous answer was invalid JSON. Reply again with ONLY the JSON object.`,
    ];

    let lastError: Error | null = null;
    const maxTokens =
      videoMode === "professional" ? PROMPT_MAX_TOKENS_PRO : PROMPT_MAX_TOKENS;

    for (const prompt of attempts) {
      try {
        const text = await this.ai.generate(prompt, {
          maxTokens,
        });
        const parsed = parsePromptPair(
          JSON.parse(extractJsonObject(text)),
          scene,
          sceneCharacters,
          videoMode,
          visualStyle,
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
      if (videoMode === "professional") {
        return {
          imagePrompt: buildFallbackProfessionalImagePrompt(
            scene,
            sceneCharacters,
            visualStyle,
          ),
          videoPrompt: buildFallbackVideoPrompt(scene, videoMode, visualStyle),
        };
      }

      return {
        imagePrompt: buildFallbackImagePrompt(scene, sceneCharacters, visualStyle),
        videoPrompt: buildFallbackVideoPrompt(scene, videoMode, visualStyle),
      };
    }

    throw new Error("Failed to generate prompts.");
  }
}
