import type { SceneScript, SeriesVisualStyle, StoryCharacter } from "./content-state";
import {
  buildCompactSceneCompositionHint,
  classifySceneImageTemplate,
} from "./scene-image";
import { mergeVisualStyle } from "./visual-style";

export interface SceneCharacterPlacement {
  characterId: string;
  xRatio: number;
  baseYRatio: number;
  heightRatio: number;
}

export function shouldComposeScene1(
  _sceneNumber: number,
  _sceneCharacterCount: number,
  _animationStyle: SeriesVisualStyle["animationStyle"],
): boolean {
  return false;
}

/** FLUX background pass — empty environment only; characters are composited separately. */
export function buildSceneBackgroundPrompt(
  scene: SceneScript,
  sceneCharacters: StoryCharacter[],
  visualStyle?: SeriesVisualStyle,
): string {
  const resolvedStyle = mergeVisualStyle(visualStyle);
  const composition = buildCompactSceneCompositionHint(
    scene,
    sceneCharacters,
  );
  const styleTag =
    resolvedStyle.animationStyle === "3d"
      ? "3D cel animation background plate"
      : "2D cel-shaded forest illustration background plate";

  return [
    "Serene ancient forest glade, mossy ground, soft golden sunlight through trees, wide landscape",
    "Empty clearing with open space for two robed sages",
    composition.replace(/\b(Valmiki|Narada)\b/gi, "figure"),
    styleTag,
    "no people, no characters, no figures, empty scene",
  ]
    .filter(Boolean)
    .join(". ");
}

function characterMentionedAsSeated(
  character: StoryCharacter,
  scene: SceneScript,
): boolean {
  const visual = scene.visualDescription.toLowerCase();
  const name = character.name.toLowerCase();
  const seatedPattern = new RegExp(
    `${name}[^.]{0,48}\\b(sit|seated|cross-legged|meditat)`,
    "i",
  );
  if (seatedPattern.test(visual)) {
    return true;
  }

  return /\bsit[^.]{0,32}\bcross-legged\b/i.test(visual) && name === "valmiki";
}

export function resolveSceneCharacterPlacements(
  scene: SceneScript,
  sceneCharacters: StoryCharacter[],
): SceneCharacterPlacement[] {
  const template = classifySceneImageTemplate(scene);
  const seated = sceneCharacters.filter((character) =>
    characterMentionedAsSeated(character, scene),
  );
  const standing = sceneCharacters.filter(
    (character) => !seated.includes(character),
  );

  if (seated.length > 0 && standing.length > 0) {
    const left = seated[0] ?? sceneCharacters[0];
    const right =
      standing.find((character) => character.id !== left.id) ??
      sceneCharacters.find((character) => character.id !== left.id) ??
      sceneCharacters[1];

    return [
      {
        characterId: left.id,
        xRatio: 0.3,
        baseYRatio: 0.92,
        heightRatio: 0.42,
      },
      {
        characterId: right.id,
        xRatio: 0.7,
        baseYRatio: 0.94,
        heightRatio: 0.52,
      },
    ];
  }

  if (template === "reverence") {
    return sceneCharacters.slice(0, 2).map((character, index) => ({
      characterId: character.id,
      xRatio: index === 0 ? 0.38 : 0.66,
      baseYRatio: 0.9,
      heightRatio: index === 0 ? 0.4 : 0.48,
    }));
  }

  return sceneCharacters.slice(0, 2).map((character, index) => ({
    characterId: character.id,
    xRatio: index === 0 ? 0.32 : 0.68,
    baseYRatio: 0.91,
    heightRatio: index === 0 ? 0.44 : 0.48,
  }));
}
