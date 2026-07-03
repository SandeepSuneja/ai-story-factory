import { Injectable } from "@nestjs/common";
import { mkdir } from "fs/promises";
import { join } from "path";
import type { SceneScript } from "../content-state";
import { FluxService } from "../services/flux.service";

@Injectable()
export class ImageAgent {
  constructor(private readonly flux: FluxService) {}

  async execute(scene: SceneScript): Promise<SceneScript> {
    const prompt = scene.imagePrompt?.trim() || scene.videoPrompt?.trim();
    if (!prompt) {
      throw new Error("Image prompt is required before image generation");
    }

    await mkdir(this.flux.getStorageDirectory(), { recursive: true });

    const imagePath = await this.flux.generateImage(prompt, scene.sceneNumber);

    return {
      ...scene,
      imagePrompt: prompt,
      imagePath,
    };
  }
}
