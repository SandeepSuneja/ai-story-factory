import type { SceneScript, SeriesVisualStyle, StoryCharacter } from "./content-state";
import {
  buildSceneCharacterTagForPrompt,
  buildCompactCharacterTags,
  characterNamesMissingFromPrompt,
  truncateToWordCount,
} from "./characters";
import {
  buildCompactSceneCompositionHint,
  buildUnifiedForestAnchor,
} from "./scene-image";
import { mergeVisualStyle } from "./visual-style";

/** Legacy word budget — prefer TIER_A_FLUX_IMAGE_PROMPT_MAX_WORDS for FLUX scenes. */
export const TIER_A_IMAGE_PROMPT_MAX_WORDS = 58;
/** FLUX scene prompts: room for character tag lines + composition within CLIP budget. */
export const TIER_A_FLUX_IMAGE_PROMPT_MAX_WORDS = 75;
/** SDXL multi-character scenes need more budget for spatial + identity cues. */
export const TIER_A_SDXL_IMAGE_PROMPT_MAX_WORDS = 96;

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function characterTagLinesMissingFromPrompt(
  prompt: string,
  sceneCharacters: StoryCharacter[],
): StoryCharacter[] {
  return sceneCharacters.filter(
    (character) =>
      !new RegExp(`\\b${character.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:`, "i").test(
        prompt,
      ),
  );
}

function buildCharacterTagLines(
  sceneCharacters: StoryCharacter[],
  tagWordLimit: number,
): string {
  return sceneCharacters
    .map(
      (character) =>
        `${character.name}: ${buildSceneCharacterTagForPrompt(character, tagWordLimit)}`,
    )
    .join("; ");
}

/**
 * FLUX Tier A scene prompt — always keeps `Name: visual tag` lines for CLIP compression.
 * Truncates scene action text first; never drops character identity tags.
 */
export function buildTierASceneImagePrompt(
  scene: SceneScript,
  sceneCharacters: StoryCharacter[],
  visualStyle?: SeriesVisualStyle,
  maxWords: number = TIER_A_FLUX_IMAGE_PROMPT_MAX_WORDS,
): string {
  const resolvedStyle = mergeVisualStyle(visualStyle);
  const sceneLead = scene.visualDescription.trim().replace(/\.\s*$/, "");
  const composition = buildCompactSceneCompositionHint(scene, sceneCharacters);
  const styleTag =
    resolvedStyle.animationStyle === "3d"
      ? "3D cel animation"
      : "2D cel-shaded forest";

  if (sceneCharacters.length === 0) {
    const forestAnchor = buildUnifiedForestAnchor();
    let prompt = sceneLead;
    for (const layer of [forestAnchor, styleTag]) {
      const candidate = `${prompt}. ${layer}`;
      if (wordCount(candidate) <= maxWords) {
        prompt = candidate;
      }
    }
    return prompt || truncateToWordCount(sceneLead, maxWords);
  }

  const roster =
    sceneCharacters.length > 1
      ? `All ${sceneCharacters.length} characters visible: ${sceneCharacters
          .map((character) => character.name)
          .join(", ")}`
      : `${sceneCharacters[0]!.name} visible`;

  let tagWordLimit = 8;
  let tags = buildCharacterTagLines(sceneCharacters, tagWordLimit);
  let tail = [tags, composition, styleTag].filter(Boolean).join(". ");
  let tailWords = wordCount(tail);
  const rosterWords = wordCount(roster);

  while (tailWords + rosterWords + 9 > maxWords && tagWordLimit > 4) {
    tagWordLimit -= 1;
    tags = buildCharacterTagLines(sceneCharacters, tagWordLimit);
    tail = [tags, composition, styleTag].filter(Boolean).join(". ");
    tailWords = wordCount(tail);
  }

  const separatorWords = roster ? 2 : 1;
  let leadBudget = maxWords - tailWords - rosterWords - separatorWords;
  if (leadBudget < 6) {
    leadBudget = 6;
  }

  const leadPart = truncateToWordCount(sceneLead, leadBudget);
  const parts = [leadPart, tail];
  if (roster && wordCount([leadPart, tail, roster].join(". ")) <= maxWords) {
    parts.push(roster);
  }

  let prompt = parts.filter(Boolean).join(". ");

  const missingTags = characterTagLinesMissingFromPrompt(prompt, sceneCharacters);
  if (missingTags.length > 0) {
    const tagLine = buildCompactCharacterTags(missingTags);
    prompt = `${prompt}. ${tagLine}`.trim();
  }

  if (wordCount(prompt) > maxWords) {
    const tagLine = buildCharacterTagLines(sceneCharacters, Math.max(4, tagWordLimit));
    const compactTail = [tagLine, composition, styleTag].join(". ");
    const compactLeadBudget = Math.max(
      6,
      maxWords - wordCount(compactTail) - separatorWords,
    );
    prompt = [truncateToWordCount(sceneLead, compactLeadBudget), compactTail]
      .filter(Boolean)
      .join(". ");
  }

  return prompt;
}

export const TIER_B_KONTEXT_PROMPT_MAX_WORDS = 52;

/** Kontext edit prompt for scenes 2+ — describes changes while preserving master look. */
export function buildTierBKontextPrompt(
  scene: SceneScript,
  sceneCharacters: StoryCharacter[],
  visualStyle?: SeriesVisualStyle,
  maxWords: number = TIER_B_KONTEXT_PROMPT_MAX_WORDS,
): string {
  const resolvedStyle = mergeVisualStyle(visualStyle);
  const sceneLead = scene.visualDescription.trim().replace(/\.\s*$/, "");
  const names = sceneCharacters.map((character) => character.name);
  const styleTag =
    resolvedStyle.animationStyle === "3d"
      ? "same 3D cel animation style"
      : "same 2D cel-shaded forest style";
  const anchor =
    names.length > 1
      ? `Same scene and same characters (${names.join(", ")}) as the reference image`
      : "Same scene style and character as the reference image";
  const tags = buildCharacterTagLines(sceneCharacters, 6);
  const composition = buildCompactSceneCompositionHint(scene, sceneCharacters);
  const forestAnchor = buildUnifiedForestAnchor();

  const tail = [forestAnchor, tags, composition, styleTag].filter(Boolean).join(". ");
  const tailWords = wordCount(tail);
  const leadBudget = Math.max(8, maxWords - tailWords - 1);
  const leadPart = truncateToWordCount(`${anchor}. ${sceneLead}`, leadBudget);

  let prompt = `${leadPart}. ${tail}`.replace(/\.\s*\./g, ".").trim();

  if (wordCount(prompt) > maxWords) {
    prompt = truncateToWordCount(prompt, maxWords);
  }

  const missingTags = characterTagLinesMissingFromPrompt(prompt, sceneCharacters);
  if (missingTags.length > 0) {
    const supplemented = `${prompt}. ${buildCompactCharacterTags(missingTags)}`.trim();
    if (wordCount(supplemented) <= maxWords + 12) {
      prompt = supplemented;
    }
  }

  return prompt;
}

export function shouldUseKontextForScene(
  sceneNumber: number,
  masterSceneImagePath?: string | null,
): boolean {
  const mode = (process.env.FLUX_SCENE_GENERATION_MODE ?? "auto").trim();
  const master = masterSceneImagePath?.trim();

  if (!master || sceneNumber <= 1) {
    return false;
  }

  if (mode === "text") {
    return false;
  }

  if (mode === "kontext") {
    return true;
  }

  return process.env.FLUX_USE_KONTEXT_FOR_SCENES !== "false";
}

export function ensureAllSceneCharactersInTierAPrompt(
  prompt: string,
  sceneCharacters: StoryCharacter[],
  maxWords: number = TIER_A_FLUX_IMAGE_PROMPT_MAX_WORDS,
): string {
  const missingTags = characterTagLinesMissingFromPrompt(prompt, sceneCharacters);
  if (missingTags.length === 0) {
    return prompt;
  }

  const supplemented = `${prompt}. ${buildCompactCharacterTags(missingTags)}`.trim();
  if (wordCount(supplemented) <= maxWords) {
    return supplemented;
  }

  return supplemented;
}
