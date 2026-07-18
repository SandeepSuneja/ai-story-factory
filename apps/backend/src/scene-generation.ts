/**
 * Scene / character generation modes:
 * - hybrid (default): train SDXL character LoRAs + generate scenes with FLUX
 * - sdxl: train LoRAs + generate scenes with SDXL + LoRA adapters
 * - flux: FLUX scenes only (no LoRA training)
 */
export type SceneGenerationMode = "sdxl" | "flux" | "hybrid";

export function resolveSceneGenerationMode(): SceneGenerationMode {
  const mode = (process.env.SCENE_GENERATION_MODE ?? "hybrid")
    .trim()
    .toLowerCase();
  if (mode === "flux" || mode === "sdxl" || mode === "hybrid") {
    return mode;
  }
  return "hybrid";
}

/** @deprecated Prefer shouldUseSdxlForScenes() — kept for older call sites. */
export function isTierCEnabled(): boolean {
  return shouldUseSdxlForScenes();
}

export function shouldUseSdxlForScenes(): boolean {
  return resolveSceneGenerationMode() === "sdxl";
}

export function shouldTrainCharacterLoras(): boolean {
  const raw = process.env.SDXL_TRAIN_CHARACTER_LORAS?.trim().toLowerCase();
  if (raw === "true" || raw === "1" || raw === "yes") {
    return true;
  }
  if (raw === "false" || raw === "0" || raw === "no") {
    return false;
  }
  // Off by default until curated multi-image bible sets exist per character.
  return false;
}

/** Cast sheets feed FLUX IP-Adapter / scene identity (not used for pure SDXL scenes). */
export function shouldBuildCastSheet(): boolean {
  return !shouldUseSdxlForScenes();
}

/** Portrait pasting is disabled — compose mode is never used. */
export function shouldComposeScene1(): boolean {
  return false;
}

export function shouldUseSdxlImg2imgForScene(
  sceneNumber: number,
  masterSceneImagePath?: string | null,
): boolean {
  if (!shouldUseSdxlForScenes()) {
    return false;
  }

  const master = masterSceneImagePath?.trim();
  if (!master || sceneNumber <= 1) {
    return false;
  }

  const mode = (process.env.SDXL_SCENE_GENERATION_MODE ?? "auto").trim();
  if (mode === "text") {
    return false;
  }

  return process.env.SDXL_USE_IMG2IMG_FOR_SCENES !== "false";
}
