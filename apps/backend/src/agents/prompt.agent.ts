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
  buildCompactCharacterTags,
  buildSceneAppearanceTag,
  buildSceneCharacterIdentityTag,
  buildSceneImageGuardrails,
  buildReferencePortraitLockHint,
  characterNamesMissingFromPrompt,
  formatCharactersForPrompt,
  formatVisualStyleForPrompt,
  getCharactersForScene,
  getSpeakingCharacters,
} from "../characters";
import {
  buildContextualTalkingImageHint,
  buildSceneCompositionHint,
  classifySceneImageTemplate,
} from "../scene-image";
import {
  imagePromptLanguageRule,
  videoPromptLanguageRule,
} from "../language";
import {
  imagePromptAnimationSuffix,
  buildCompactSeriesStyleLock,
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
const MAX_VIDEO_WORDS = 45;
const MAX_PRO_VIDEO_WORDS = 100;
const FLUX_CLIP_TARGET_WORDS = 68;

function imagePromptWordBudget(_characterCount: number): number {
  return FLUX_CLIP_TARGET_WORDS;
}

function buildFluxOptimizedImagePrompt(
  scene: SceneScript,
  sceneCharacters: StoryCharacter[],
  visualStyle?: SeriesVisualStyle,
): string {
  const resolvedStyle = mergeVisualStyle(visualStyle);
  const names = sceneCharacters.map((character) => character.name);
  const styleLock = buildCompactSeriesStyleLock(resolvedStyle);
  const sceneLead = scene.visualDescription.trim();
  const composition = buildSceneCompositionHint(
    scene,
    sceneCharacters,
    resolvedStyle,
  );
  const roster =
    names.length > 1
      ? `All ${names.length} characters visible: ${names.join(", ")}`
      : names.length === 1
        ? `${names[0]} visible`
        : "";
  const portraitGroup =
    names.length >= 3 && resolvedStyle.orientation === "portrait"
      ? "Wide group shot, full cast in frame"
      : "";
  const tags = sceneCharacters
    .map(
      (character) =>
        `${character.name}: ${buildSceneCharacterIdentityTag(character.appearance, 10)}`,
    )
    .join("; ");
  const style = imagePromptAnimationSuffix(resolvedStyle.animationStyle);

  return [
    styleLock,
    sceneLead,
    composition,
    portraitGroup,
    roster,
    tags,
    style,
  ]
    .filter(Boolean)
    .join(". ")
    .replace(/\.\s*\./g, ".");
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

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Trim boilerplate first so scene action and character appearance tags survive. */
function clampImagePromptPreservingCharacters(
  scene: SceneScript,
  sceneCharacters: StoryCharacter[],
  visualStyle: SeriesVisualStyle | undefined,
  maxWords: number,
): string {
  const resolvedStyle = mergeVisualStyle(visualStyle);
  const styleLock = buildCompactSeriesStyleLock(resolvedStyle);
  const sceneLead = scene.visualDescription.trim();
  const composition = buildSceneCompositionHint(
    scene,
    sceneCharacters,
    resolvedStyle,
  );
  const roster =
    sceneCharacters.length > 1
      ? `All ${sceneCharacters.length} characters visible: ${sceneCharacters
          .map((character) => character.name)
          .join(", ")}`
      : sceneCharacters.length === 1
        ? `${sceneCharacters[0].name} visible`
        : "";
  const tags = sceneCharacters
    .map(
      (character) =>
        `${character.name}: ${buildSceneCharacterIdentityTag(character.appearance, 12)}`,
    )
    .join("; ");
  const referenceLock = buildReferencePortraitLockHint(scene, sceneCharacters);
  const guardrails = buildSceneImageGuardrails();
  const talkingHint = buildContextualTalkingImageHint(scene);

  const mandatory = [sceneLead, referenceLock, tags, roster, guardrails]
    .filter(Boolean)
    .map((part) => part.replace(/\.\s*$/, "").trim())
    .join(". ");
  if (wordCount(mandatory) > maxWords) {
    const compactTags = sceneCharacters
      .map(
        (character) =>
          `${character.name}: ${buildSceneCharacterIdentityTag(character.appearance, 8)}`,
      )
      .join("; ");
    const compactMandatory = [sceneLead, compactTags, roster, guardrails]
      .filter(Boolean)
      .map((part) => part.replace(/\.\s*$/, "").trim())
      .join(". ");
    if (wordCount(compactMandatory) <= maxWords) {
      return compactMandatory;
    }
    return clampWords(compactMandatory, maxWords);
  }

  let prompt = mandatory;
  for (const extra of [composition, talkingHint, styleLock]) {
    if (!extra) {
      continue;
    }
    const candidate = `${prompt.replace(/\.\s*$/, "").trim()}. ${extra
      .replace(/^\.\s*/, "")
      .trim()}`.replace(/\s+/g, " ").trim();
    if (wordCount(candidate) <= maxWords) {
      prompt = candidate;
    }
  }

  return prompt;
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

function enhanceImagePromptForTalking(
  prompt: string,
  scene: SceneScript,
): string {
  const talkingHint = buildContextualTalkingImageHint(scene);
  if (!talkingHint) {
    return prompt;
  }

  return `${prompt} ${talkingHint}`.replace(/\s+/g, " ").trim();
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

function ensureAllSceneCharactersInImagePrompt(
  prompt: string,
  sceneCharacters: StoryCharacter[],
): string {
  const missing = characterNamesMissingFromPrompt(prompt, sceneCharacters);
  if (missing.length === 0) {
    return prompt;
  }

  const roster = `All ${sceneCharacters.length} characters visible: ${sceneCharacters
    .map((character) => character.name)
    .join(", ")}`;
  return `${roster}. ${prompt.trim()} ${buildCompactCharacterTags(missing)}`.trim();
}

export function sanitizeImagePrompt(
  text: string,
  scene: SceneScript,
  sceneCharacters: StoryCharacter[],
  visualStyle?: SeriesVisualStyle,
): string {
  const wordBudget = imagePromptWordBudget(sceneCharacters.length);
  let prompt = buildFluxOptimizedImagePrompt(
    scene,
    sceneCharacters,
    visualStyle,
  );

  prompt = ensureAllSceneCharactersInImagePrompt(prompt, sceneCharacters);
  prompt = enhanceImagePromptForTalking(prompt, scene);

  return clampImagePromptPreservingCharacters(
    scene,
    sceneCharacters,
    visualStyle,
    wordBudget,
  );
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
  const imagePrompt = sanitizeImagePrompt(
    String(value.imagePrompt ?? ""),
    scene,
    sceneCharacters,
    visualStyle,
  );
  const rawVideoPrompt =
    videoMode === "professional"
      ? sanitizeProfessionalVideoPrompt(
          String(value.videoPrompt ?? ""),
          scene.duration,
        )
      : sanitizeVideoPrompt(String(value.videoPrompt ?? ""), scene.duration);
  const videoPrompt = enhanceVideoPromptForTalking(
    rawVideoPrompt,
    scene,
    videoMode === "professional" ? MAX_PRO_VIDEO_WORDS : MAX_VIDEO_WORDS,
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
- Prefer concrete verbs: slow dolly in, gentle pan left, soft static flicker, subtle breathing, eyes blink, hair sways, light pulses
- When characters speak in the scene dialogue, include subtle lip movement and natural jaw motion for the speaking character(s)`;

  const speakingNames = getSpeakingCharacters(scene);
  const talkingRules =
    speakingNames.length > 0
      ? `
Talking characters in this scene: ${speakingNames.join(", ")}.
- imagePrompt: show speaking characters with engaged expressions and mouths slightly open mid-conversation
- videoPrompt: include subtle lip sync, jaw motion, and small conversational gestures for whoever is speaking`
      : "";

  const sourceRules = sourceContext ? `\n${promptRulesWithSource()}` : "";
  const characterCount = sceneCharacters.length;
  const imageWordBudget = imagePromptWordBudget(characterCount);
  const sceneTemplate = classifySceneImageTemplate(scene);
  const portraitHint =
    resolvedStyle.orientation === "portrait" && characterCount >= 3
      ? "- Portrait frame: use a wide group shot so every listed character fits in frame"
      : "";

  return appendSourceMaterial(
    `Create two prompts for scene ${scene.sceneNumber} of a short film pipeline.

Return ONLY valid JSON in this exact shape:
{
  "imagePrompt": "static keyframe prompt for FLUX image generation",
  "videoPrompt": "${videoMode === "professional" ? "external I2V prompt for Kling/Veo/Runway" : "motion-only prompt for Wan2.1 image-to-video"}"
}

${imagePromptLanguageRule(language)}
${videoPromptLanguageRule(language, videoMode)}

IMAGE PROMPT (FLUX — CLIP hard limit 77 tokens):
- Maximum ${imageWordBudget} words — never exceed this
- Scene template for this shot: ${sceneTemplate}
- Required format: "[series style lock]. [scene visual from script]. [composition hint]. All ${characterCount} characters visible: ${sceneCharacters.map((c) => c.name).join(", ")}. Name: visual trait tag (hair, skin, outfit colors); Name: visual trait tag. ${animationSuffix}"
- Always follow the scene visual description above — do not invent new locations or poses
- Put every character name in the first three sentences
- Use visual trait tags (max 10 words per character — hair, skin tone, outfit colors, props)
- Include ALL ${characterCount} character(s) listed below — never omit anyone
${portraitHint}
- Do NOT use live-action, photorealistic, or documentary language
- Do NOT include resolution, aspect ratio, or pixel dimensions
- Do NOT describe camera movement or animation
- Avoid on-screen text, subtitles, split screens, or duplicate clones of the same character${sourceRules}
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

    for (const prompt of attempts) {
      try {
        const text = await this.ai.generate(prompt, {
          maxTokens: PROMPT_MAX_TOKENS,
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
      return {
        imagePrompt: buildFallbackImagePrompt(scene, sceneCharacters, visualStyle),
        videoPrompt: buildFallbackVideoPrompt(scene, videoMode, visualStyle),
      };
    }

    throw new Error("Failed to generate prompts.");
  }
}
