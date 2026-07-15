import type { SceneScript, SeriesVisualStyle, StoryCharacter } from "./content-state";
import {
  buildSceneCharacterTagForPrompt,
  buildCompactCharacterTags,
  characterNamesMissingFromPrompt,
  truncateToWordCount,
} from "./characters";
import {
  buildCompactSceneCompositionHint,
} from "./scene-image";
import { mergeVisualStyle } from "./visual-style";

export const TIER_A_IMAGE_PROMPT_MAX_WORDS = 58;
/** SDXL multi-character scenes need more budget for spatial + identity cues. */
export const TIER_A_SDXL_IMAGE_PROMPT_MAX_WORDS = 96;

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Single-pass FLUX scene prompt (~58 words) — guardrails added by FLUX service, not here. */
export function buildTierASceneImagePrompt(
  scene: SceneScript,
  sceneCharacters: StoryCharacter[],
  visualStyle?: SeriesVisualStyle,
  maxWords: number = TIER_A_IMAGE_PROMPT_MAX_WORDS,
): string {
  const resolvedStyle = mergeVisualStyle(visualStyle);
  const sceneLead = scene.visualDescription.trim().replace(/\.\s*$/, "");
  const tags = sceneCharacters
    .map(
      (character) =>
        `${character.name}: ${buildSceneCharacterTagForPrompt(character, 8)}`,
    )
    .join("; ");
  const roster =
    sceneCharacters.length > 1
      ? `All ${sceneCharacters.length} characters visible: ${sceneCharacters
          .map((character) => character.name)
          .join(", ")}. Two different people, different faces and outfits, no clones`
      : sceneCharacters[0]
        ? `${sceneCharacters[0].name} visible`
        : "";
  const composition = buildCompactSceneCompositionHint(
    scene,
    sceneCharacters,
  );
  const styleTag =
    resolvedStyle.animationStyle === "3d"
      ? "3D cel animation"
      : "2D cel-shaded forest";

  const layers = [sceneLead, tags, roster, composition, styleTag].filter(
    Boolean,
  );

  let prompt = "";
  for (const layer of layers) {
    const candidate = prompt ? `${prompt}. ${layer}` : layer;
    if (wordCount(candidate) <= maxWords) {
      prompt = candidate;
    }
  }

  if (!prompt) {
    return truncateToWordCount(sceneLead, maxWords);
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
  const tags = sceneCharacters
    .map(
      (character) =>
        `${character.name}: ${buildSceneCharacterTagForPrompt(character, 6)}`,
    )
    .join("; ");
  const composition = buildCompactSceneCompositionHint(
    scene,
    sceneCharacters,
  );

  const layers = [
    `${anchor}. ${sceneLead}`,
    tags,
    composition,
    styleTag,
  ].filter(Boolean);

  let prompt = "";
  for (const layer of layers) {
    const candidate = prompt ? `${prompt}. ${layer}` : layer;
    if (wordCount(candidate) <= maxWords) {
      prompt = candidate;
    }
  }

  if (!prompt) {
    return truncateToWordCount(`${anchor}. ${sceneLead}`, maxWords);
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
  maxWords: number = TIER_A_IMAGE_PROMPT_MAX_WORDS,
): string {
  const missing = characterNamesMissingFromPrompt(prompt, sceneCharacters);
  if (missing.length === 0) {
    return prompt;
  }

  const supplemented = `${prompt}. ${buildCompactCharacterTags(missing)}`.trim();
  if (wordCount(supplemented) <= maxWords) {
    return supplemented;
  }

  return truncateToWordCount(supplemented, maxWords);
}
