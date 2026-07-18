import { Injectable, Logger } from "@nestjs/common";

import { mkdir } from "fs/promises";

import type { SceneScript, SeriesVisualStyle, StoryCharacter } from "../content-state";

import {

  getCharactersForScene,

  resolveSceneReferenceImages,

  sceneImageSeed,

} from "../characters";

import {

  buildTierASceneImagePrompt,

  buildTierBKontextPrompt,

  ensureAllSceneCharactersInTierAPrompt,

  shouldUseKontextForScene,

  TIER_A_FLUX_IMAGE_PROMPT_MAX_WORDS,

  TIER_A_SDXL_IMAGE_PROMPT_MAX_WORDS,

} from "../scene-image-prompt";

import {

  shouldUseSdxlForScenes,

  shouldUseSdxlImg2imgForScene,

} from "../scene-generation";

import { FluxService } from "../services/flux.service";

import { SdxlService } from "../services/sdxl.service";

import { CharacterLoraService } from "../services/character-lora.service";

import { CastSheetService } from "../services/cast-sheet.service";

import { mergeVisualStyle } from "../visual-style";



@Injectable()

export class ImageAgent {

  private readonly logger = new Logger(ImageAgent.name);



  constructor(

    private readonly flux: FluxService,

    private readonly sdxl: SdxlService,

    private readonly characterLoraService: CharacterLoraService,

    private readonly castSheetService: CastSheetService,

  ) {}

  private buildFluxSceneImagePrompt(
    scene: SceneScript,
    sceneCharacters: StoryCharacter[],
    visualStyle?: SeriesVisualStyle,
  ): string {
    const raw = buildTierASceneImagePrompt(
      scene,
      sceneCharacters,
      visualStyle,
      TIER_A_FLUX_IMAGE_PROMPT_MAX_WORDS,
    );
    return ensureAllSceneCharactersInTierAPrompt(
      raw,
      sceneCharacters,
      TIER_A_FLUX_IMAGE_PROMPT_MAX_WORDS,
    );
  }

  async execute(

    scene: SceneScript,

    visualStyle?: SeriesVisualStyle,

    characters: StoryCharacter[] = [],

    castReferenceImagePath?: string,

    masterSceneImagePath?: string,

    regenerate = false,

  ): Promise<SceneScript> {

    const storageDir = shouldUseSdxlForScenes()

      ? this.sdxl.getStorageDirectory()

      : this.flux.getStorageDirectory();

    await mkdir(storageDir, { recursive: true });



    const sceneCharacters = getCharactersForScene(scene, characters);

    const resolvedStyle = mergeVisualStyle(visualStyle);

    const orientation = resolvedStyle.orientation;

    const seed = regenerate

      ? Math.floor(Math.random() * 2_147_483_647)

      : sceneImageSeed(

          scene.sceneNumber,

          sceneCharacters.map((character) => character.id),

        );

    if (regenerate) {

      this.logger.log(

        `Regenerating scene ${scene.sceneNumber} with random seed ${seed}`,

      );

    }



    if (shouldUseSdxlForScenes()) {

      return this.executeSdxlScene(

        scene,

        sceneCharacters,

        visualStyle,

        orientation,

        seed,

        masterSceneImagePath,

      );

    }



    return this.executeFluxScene(

      scene,

      sceneCharacters,

      characters,

      visualStyle,

      resolvedStyle,

      orientation,

      seed,

      castReferenceImagePath,

      masterSceneImagePath,

    );

  }



  private async executeSdxlScene(

    scene: SceneScript,

    sceneCharacters: StoryCharacter[],

    visualStyle: SeriesVisualStyle | undefined,

    orientation: SeriesVisualStyle["orientation"],

    seed: number,

    masterSceneImagePath?: string,

  ): Promise<SceneScript> {

    const loras = this.characterLoraService.resolveLorasForScene(sceneCharacters);

    const masterPath = masterSceneImagePath?.trim();



    if (shouldUseSdxlImg2imgForScene(scene.sceneNumber, masterPath)) {

      const prompt = buildTierBKontextPrompt(

        scene,

        sceneCharacters,

        visualStyle,

      );



      const imagePath = await this.sdxl.generateFromImage({

        prompt,

        sceneNumber: scene.sceneNumber,

        sourceImagePath: masterPath!,

        orientation,

        seed,

        loras,

      });



      return {

        ...scene,

        imagePrompt: prompt,

        imagePath,

      };

    }



    const prompt =

      scene.sceneNumber === 1

        ? buildTierASceneImagePrompt(

            scene,

            sceneCharacters,

            visualStyle,

            TIER_A_SDXL_IMAGE_PROMPT_MAX_WORDS,

          )

        : scene.imagePrompt?.trim() ||

          buildTierASceneImagePrompt(

            scene,

            sceneCharacters,

            visualStyle,

            TIER_A_SDXL_IMAGE_PROMPT_MAX_WORDS,

          ) ||

          scene.videoPrompt?.trim();



    if (!prompt) {

      throw new Error("Image prompt is required before image generation");

    }



    const imagePath = await this.sdxl.generateImage({

      prompt,

      sceneNumber: scene.sceneNumber,

      orientation,

      seed,

      loras,

    });



    return {

      ...scene,

      imagePrompt: prompt,

      imagePath,

    };

  }



  private async executeFluxScene(

    scene: SceneScript,

    sceneCharacters: StoryCharacter[],

    characters: StoryCharacter[],

    visualStyle: SeriesVisualStyle | undefined,

    resolvedStyle: SeriesVisualStyle,

    orientation: SeriesVisualStyle["orientation"],

    seed: number,

    castReferenceImagePath?: string,

    masterSceneImagePath?: string,

  ): Promise<SceneScript> {

    if (shouldUseKontextForScene(scene.sceneNumber, masterSceneImagePath)) {

      const prompt = buildTierBKontextPrompt(

        scene,

        sceneCharacters,

        visualStyle,

      );



      try {

        const imagePath = await this.flux.generateFromImage({

          prompt,

          sceneNumber: scene.sceneNumber,

          sourceImagePath: masterSceneImagePath!.trim(),

          orientation,

          seed,

        });



        return {

          ...scene,

          imagePrompt: prompt,

          imagePath,

        };

      } catch (error) {

        this.logger.warn(

          `Kontext generation failed for scene ${scene.sceneNumber}; falling back to master-scene IP-Adapter: ${

            error instanceof Error ? error.message : String(error)

          }`,

        );

      }

    }



    const prompt =

      scene.sceneNumber === 1

        ? this.buildFluxSceneImagePrompt(scene, sceneCharacters, visualStyle)

        : scene.imagePrompt?.trim() ||

          this.buildFluxSceneImagePrompt(scene, sceneCharacters, visualStyle) ||

          scene.videoPrompt?.trim();

    if (!prompt) {

      throw new Error("Image prompt is required before image generation");

    }



    let resolvedCastReference = castReferenceImagePath;

    if (!resolvedCastReference?.trim() && characters.length >= 2) {

      resolvedCastReference = await this.castSheetService.ensureCastSheet(

        characters,

        visualStyle,

      );

    }



    let referenceImagePaths: string[];

    let referenceKind: ReturnType<typeof resolveSceneReferenceImages>["referenceKind"];



    const masterPath = masterSceneImagePath?.trim();

    if (scene.sceneNumber > 1 && masterPath) {

      referenceImagePaths = [masterPath];

      referenceKind = "master_scene";

    } else {

      ({ paths: referenceImagePaths, referenceKind } =

        resolveSceneReferenceImages(

          scene,

          characters,

          resolvedCastReference,

        ));

    }



    const imagePath = await this.flux.generateImage({

      prompt,

      sceneNumber: scene.sceneNumber,

      orientation,

      seed,

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


