import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { Agent, fetch as undiciFetch } from "undici";
import { sanitizeImagePrompt } from "../src/agents/prompt.agent";
import {
  buildCharacterPortraitPrompt,
  characterPortraitSeed,
  getCharactersForScene,
  deterministicSeed,
  resolveSceneReferenceImages,
  sceneImageSeed,
} from "../src/characters";
import { imagePromptAnimationSuffix, mergeVisualStyle } from "../src/visual-style";
import type { ProjectRecord } from "../src/models/project.model";
import type { SceneScript, StoryCharacter } from "../src/content-state";
const API_BASE = process.env.API_BASE ?? "http://127.0.0.1:3000";
const FLUX_BASE = process.env.FLUX_SERVICE_URL ?? "http://127.0.0.1:7860";
const SCENES_ONLY = process.argv.includes("--scenes-only");
const SCENE_ARGS = process.argv
  .slice(2)
  .filter((value) => value !== "--scenes-only");
const PROJECT_ID =
  SCENE_ARGS[0] ?? "bd0265ff-ba15-40ee-96a9-1dad19c6dd4f";
const SCENE_FILTER = SCENE_ARGS
  .slice(1)
  .map((value) => Number.parseInt(value, 10))
  .filter((value) => Number.isFinite(value) && value > 0);

function sortScenes(scenes: SceneScript[]): SceneScript[] {
  return scenes.slice().sort((left, right) => left.sceneNumber - right.sceneNumber);
}

function refreshScenePrompts(
  scene: SceneScript,
  project: ProjectRecord,
): SceneScript {
  const sceneCharacters = getCharactersForScene(scene, project.state.characters);
  const imagePrompt = sanitizeImagePrompt(
    scene.imagePrompt ?? "",
    scene,
    sceneCharacters,
    project.state.visualStyle,
  );

  return {
    ...scene,
    imagePrompt,
  };
}

const FLUX_REQUEST_TIMEOUT_MS = 30 * 60 * 1000;
const fluxDispatcher = new Agent({
  headersTimeout: FLUX_REQUEST_TIMEOUT_MS,
  bodyTimeout: FLUX_REQUEST_TIMEOUT_MS,
});

async function fluxPost<T>(path: string, body: unknown): Promise<T> {
  const response = await undiciFetch(`${FLUX_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    dispatcher: fluxDispatcher,
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<T>;
}

async function serviceReachable(
  url: string,
  path = "/health",
): Promise<boolean> {
  try {
    const response = await fetch(`${url}${path}`, {
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function regeneratePortrait(
  character: StoryCharacter,
  project: ProjectRecord,
): Promise<string> {
  const visualStyle = mergeVisualStyle(project.state.visualStyle);
  const prompt = buildCharacterPortraitPrompt(
    character,
    imagePromptAnimationSuffix(visualStyle.animationStyle),
  );
  const result = await fluxPost<{ imagePath: string }>("/generate", {
    prompt,
    scene_number: 0,
    orientation: visualStyle.orientation,
    seed: characterPortraitSeed(character.id),
    filename_prefix: `character-${character.id}`,
  });
  return result.imagePath;
}

async function regenerateSceneViaFlux(
  scene: SceneScript,
  project: ProjectRecord,
): Promise<SceneScript> {
  const sceneCharacters = getCharactersForScene(scene, project.state.characters);
  const { paths, referenceKind } = resolveSceneReferenceImages(
    scene,
    project.state.characters,
    project.state.castReferenceImagePath ?? undefined,
  );
  const visualStyle = mergeVisualStyle(project.state.visualStyle);

  const result = await fluxPost<{ imagePath: string }>("/generate", {
    prompt: scene.imagePrompt,
    scene_number: scene.sceneNumber,
    orientation: visualStyle.orientation,
    seed: sceneImageSeed(
      scene.sceneNumber,
      sceneCharacters.map((character) => character.id),
    ),
    reference_image_paths: paths,
    reference_kind: referenceKind,
  });

  return {
    ...scene,
    imagePath: result.imagePath,
  };
}

async function pollImageJob(jobId: string): Promise<SceneScript> {
  const deadline = Date.now() + 48 * 60 * 60 * 1000;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const response = await fetch(`${API_BASE}/generate/image/${jobId}`);
    if (!response.ok) {
      throw new Error(await response.text());
    }

    const status = (await response.json()) as {
      status: string;
      scene?: SceneScript;
      error?: string;
    };

    if (status.status === "completed" && status.scene) {
      return status.scene;
    }

    if (status.status === "failed") {
      throw new Error(status.error || "Image generation failed");
    }
  }

  throw new Error("Image generation timed out");
}

async function regenerateSceneImage(
  scene: SceneScript,
  project: ProjectRecord,
): Promise<SceneScript> {
  const response = await fetch(`${API_BASE}/generate/image`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scene,
      characters: project.state.characters,
      visualStyle: project.state.visualStyle,
      castReferenceImagePath: project.state.castReferenceImagePath,
    }),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const job = (await response.json()) as { jobId: string };
  return pollImageJob(job.jobId);
}

async function ensureCastSheet(project: ProjectRecord): Promise<string | undefined> {
  const characters = project.state.characters;
  if (characters.length < 2) {
    return undefined;
  }

  const ordered = characters
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id));
  const signature = [
    "cast-sheet-portrait-lineup-v5",
    "832",
    "832",
    ...ordered.map(
      (character) =>
        `${character.id}:${character.referenceImagePath?.trim() ?? ""}`,
    ),
  ].join("|");

  const hash = deterministicSeed(signature);

  const filenamePrefix = `cast-${hash.toString(16)}`;
  const result = await fluxPost<{ imagePath: string }>("/compose-cast-sheet", {
    reference_image_paths: ordered.map(
      (character) => character.referenceImagePath,
    ),
    filename_prefix: filenamePrefix,
    canvas_width: 832,
    canvas_height: 832,
  });
  return result.imagePath;
}

async function main(): Promise<void> {
  const projectPath = join(
    process.cwd(),
    "storage",
    "projects",
    `${PROJECT_ID}.json`,
  );
  const raw = await readFile(projectPath, "utf-8");
  const project = JSON.parse(raw) as ProjectRecord;

  const sourceScenes = sortScenes(
    project.state.promptedScenes.length > 0
      ? project.state.promptedScenes
      : project.state.scriptScenes,
  );
  const scenesToRefresh =
    SCENE_FILTER.length > 0
      ? sourceScenes.filter((scene) => SCENE_FILTER.includes(scene.sceneNumber))
      : sourceScenes;

  const refreshedPromptMap = new Map<number, SceneScript>();
  for (const scene of scenesToRefresh) {
    refreshedPromptMap.set(scene.sceneNumber, refreshScenePrompts(scene, project));
  }

  project.state.promptedScenes = sortScenes(
    sourceScenes.map(
      (scene) => refreshedPromptMap.get(scene.sceneNumber) ?? scene,
    ),
  );
  project.state.imageScenes = sortScenes(
    (project.state.imageScenes.length > 0
      ? project.state.imageScenes
      : project.state.promptedScenes
    ).map((scene) => {
      const refreshed = refreshedPromptMap.get(scene.sceneNumber);
      return refreshed ? { ...scene, imagePrompt: refreshed.imagePrompt } : scene;
    }),
  );
  project.updatedAt = new Date().toISOString();

  const fluxReady = await serviceReachable(FLUX_BASE);

  if (fluxReady && !SCENES_ONLY) {
    console.log("Regenerating character portraits...");
    const refreshedCharacters: StoryCharacter[] = [];
    for (const character of project.state.characters) {
      const referenceImagePath = await regeneratePortrait(character, project);
      refreshedCharacters.push({ ...character, referenceImagePath });
      console.log(`${character.name}: ${referenceImagePath}`);
    }
    project.state.characters = refreshedCharacters;

    const castReferenceImagePath = await ensureCastSheet(project);
    if (castReferenceImagePath) {
      project.state.castReferenceImagePath = castReferenceImagePath;
      console.log(`Regenerated cast sheet: ${castReferenceImagePath}`);
    }
  } else if (!fluxReady) {
    console.warn("FLUX service unavailable; skipped portrait and scene regeneration.");
  }

  if (fluxReady) {
    for (const scene of scenesToRefresh) {
      const promptScene =
        refreshedPromptMap.get(scene.sceneNumber) ?? scene;
      console.log(`Generating scene ${scene.sceneNumber}...`);
      const generated = await regenerateSceneViaFlux(promptScene, project);
      const index = project.state.imageScenes.findIndex(
        (entry) => entry.sceneNumber === scene.sceneNumber,
      );
      if (index >= 0) {
        project.state.imageScenes[index] = generated;
      } else {
        project.state.imageScenes.push(generated);
      }
      project.state.imageScenes = sortScenes(project.state.imageScenes);
      project.updatedAt = new Date().toISOString();
      await writeFile(projectPath, `${JSON.stringify(project, null, 2)}\n`, "utf-8");
      console.log(`Scene ${scene.sceneNumber}: ${generated.imagePath}`);
    }
  }

  await writeFile(projectPath, `${JSON.stringify(project, null, 2)}\n`, "utf-8");
  console.log(`Updated project ${PROJECT_ID}`);
  for (const scene of project.state.promptedScenes) {
    console.log(
      `Scene ${scene.sceneNumber} (${scene.imagePrompt?.split(/\s+/).length ?? 0} words): ${scene.imagePrompt}`,
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
