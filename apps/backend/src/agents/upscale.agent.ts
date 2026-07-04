import { Injectable } from "@nestjs/common";
import type { SceneScript, SeriesVisualStyle } from "../content-state";
import { UpscaleService } from "../services/upscale.service";
import { mergeVisualStyle } from "../visual-style";

@Injectable()
export class UpscaleAgent {
  constructor(private readonly upscale: UpscaleService) {}

  async execute(
    scene: SceneScript,
    visualStyle?: SeriesVisualStyle,
  ): Promise<SceneScript> {
    const videoPath = scene.videoPath?.trim();
    if (!videoPath) {
      throw new Error(
        `Scene ${scene.sceneNumber} video is required before upscaling`,
      );
    }

    const orientation = mergeVisualStyle(visualStyle).orientation;
    const upscaledVideoPath = await this.upscale.upscaleVideo(
      videoPath,
      scene.sceneNumber,
      orientation,
    );

    await this.upscale.deleteVideoFile(videoPath);

    const { videoPath: _removed, ...rest } = scene;

    return {
      ...rest,
      upscaledVideoPath,
    };
  }
}
