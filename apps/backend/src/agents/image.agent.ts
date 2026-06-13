import { Injectable } from "@nestjs/common";
import { mkdir } from "fs/promises";
import { join } from "path";
import type { SceneScript } from "../content-state";
import { FluxService } from "../services/flux.service";

@Injectable()
export class ImageAgent {
  constructor(private readonly flux: FluxService) {}

  async execute(scene: SceneScript): Promise<SceneScript> {
    if (!scene.videoPrompt) {
      throw new Error("Video prompt is required before image generation");
    }

    await mkdir(this.flux.getStorageDirectory(), { recursive: true });

    const imagePath = await this.flux.generateImage(
      scene.videoPrompt,
      scene.sceneNumber,
    );

    return {
      ...scene,
      imagePrompt: scene.videoPrompt,
      imagePath,
    };
  }
}
