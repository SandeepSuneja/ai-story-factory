import { Injectable } from "@nestjs/common";
import { mkdir } from "fs/promises";
import { join } from "path";
import type { SceneScript, SeriesVisualStyle } from "../content-state";
import { FluxService } from "../services/flux.service";
import { mergeVisualStyle } from "../visual-style";

@Injectable()
export class ImageAgent {
  constructor(private readonly flux: FluxService) {}

  async execute(
    scene: SceneScript,
    visualStyle?: SeriesVisualStyle,
  ): Promise<SceneScript> {
    const prompt = scene.imagePrompt?.trim() || scene.videoPrompt?.trim();
    if (!prompt) {
      throw new Error("Image prompt is required before image generation");
    }

    await mkdir(this.flux.getStorageDirectory(), { recursive: true });

    const orientation = mergeVisualStyle(visualStyle).orientation;
    const imagePath = await this.flux.generateImage(
      prompt,
      scene.sceneNumber,
      orientation,
    );

    return {
      ...scene,
      imagePrompt: prompt,
      imagePath,
    };
  }
}
