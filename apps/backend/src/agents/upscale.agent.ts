import { Injectable } from "@nestjs/common";
import type { SceneScript } from "../content-state";
import { UpscaleService } from "../services/upscale.service";

@Injectable()
export class UpscaleAgent {
  constructor(private readonly upscale: UpscaleService) {}

  async execute(scene: SceneScript): Promise<SceneScript> {
    const videoPath = scene.videoPath?.trim();
    if (!videoPath) {
      throw new Error(
        `Scene ${scene.sceneNumber} video is required before upscaling`,
      );
    }

    const upscaledVideoPath = await this.upscale.upscaleVideo(
      videoPath,
      scene.sceneNumber,
    );

    await this.upscale.deleteVideoFile(videoPath);

    const { videoPath: _removed, ...rest } = scene;

    return {
      ...rest,
      upscaledVideoPath,
    };
  }
}
