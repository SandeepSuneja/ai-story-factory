import { Injectable } from "@nestjs/common";
import type { SceneScript, SeriesVisualStyle, StoryCharacter } from "../content-state";
import { getCharactersForScene, sceneImageSeed } from "../characters";
import {
  buildSceneBackgroundPrompt,
  resolveSceneCharacterPlacements,
} from "../scene-composition";
import { getGenerationDimensions, mergeVisualStyle } from "../visual-style";
import { FluxService } from "./flux.service";

@Injectable()
export class SceneCompositionService {
  constructor(private readonly flux: FluxService) {}

  async composeSceneImage(
    scene: SceneScript,
    characters: StoryCharacter[],
    visualStyle?: SeriesVisualStyle,
  ): Promise<string> {
    const sceneCharacters = getCharactersForScene(scene, characters);
    const resolvedStyle = mergeVisualStyle(visualStyle);
    const { width, height } = getGenerationDimensions(resolvedStyle.orientation);
    const placements = resolveSceneCharacterPlacements(scene, sceneCharacters);

    return this.flux.composeScene({
      backgroundPrompt: buildSceneBackgroundPrompt(
        scene,
        sceneCharacters,
        visualStyle,
      ),
      placements: placements.map((placement) => {
        const character = sceneCharacters.find(
          (entry) => entry.id === placement.characterId,
        );
        const referenceImagePath = character?.referenceImagePath?.trim();
        if (!referenceImagePath) {
          throw new Error(
            `Character ${placement.characterId} is missing an approved portrait reference`,
          );
        }

        return {
          referenceImagePath,
          xRatio: placement.xRatio,
          baseYRatio: placement.baseYRatio,
          heightRatio: placement.heightRatio,
        };
      }),
      sceneNumber: scene.sceneNumber,
      orientation: resolvedStyle.orientation,
      seed: sceneImageSeed(
        scene.sceneNumber,
        sceneCharacters.map((character) => character.id),
      ),
      canvasWidth: width,
      canvasHeight: height,
    });
  }
}
