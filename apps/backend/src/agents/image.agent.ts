import { Injectable } from "@nestjs/common";
import { mkdir } from "fs/promises";
import type { SceneScript, SeriesVisualStyle, StoryCharacter } from "../content-state";
import {
  getCharactersForScene,
  resolveSceneReferenceImages,
  sceneImageSeed,
} from "../characters";
import { FluxService } from "../services/flux.service";
import { CastSheetService } from "../services/cast-sheet.service";
import { mergeVisualStyle } from "../visual-style";

@Injectable()
export class ImageAgent {
  constructor(
    private readonly flux: FluxService,
    private readonly castSheetService: CastSheetService,
  ) {}

  async execute(
    scene: SceneScript,
    visualStyle?: SeriesVisualStyle,
    characters: StoryCharacter[] = [],
    castReferenceImagePath?: string,
  ): Promise<SceneScript> {
    const prompt = scene.imagePrompt?.trim() || scene.videoPrompt?.trim();
    if (!prompt) {
      throw new Error("Image prompt is required before image generation");
    }

    await mkdir(this.flux.getStorageDirectory(), { recursive: true });

    let resolvedCastReference = castReferenceImagePath;
    if (!resolvedCastReference?.trim() && characters.length >= 2) {
      resolvedCastReference = await this.castSheetService.ensureCastSheet(
        characters,
        visualStyle,
      );
    }

    const sceneCharacters = getCharactersForScene(scene, characters);
    const { paths: referenceImagePaths, referenceKind } =
      resolveSceneReferenceImages(
        scene,
        characters,
        resolvedCastReference,
      );

    const orientation = mergeVisualStyle(visualStyle).orientation;
    const imagePath = await this.flux.generateImage({
      prompt,
      sceneNumber: scene.sceneNumber,
      orientation,
      seed: sceneImageSeed(
        scene.sceneNumber,
        sceneCharacters.map((character) => character.id),
      ),
      referenceImagePaths,
      referenceKind,
    });

    return {
      ...scene,
      imagePrompt: prompt,
      imagePath,
    };
  }
}
