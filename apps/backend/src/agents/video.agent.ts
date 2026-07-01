import { Injectable } from "@nestjs/common";
import { mkdir } from "fs/promises";
import type { SceneScript } from "../content-state";
import { HunyuanService } from "../services/hunyuan.service";

@Injectable()
export class VideoAgent {
  constructor(private readonly hunyuan: HunyuanService) {}

  async execute(scene: SceneScript): Promise<SceneScript> {
    const imagePath = scene.imagePath?.trim();
    if (!imagePath) {
      throw new Error(
        `Scene ${scene.sceneNumber} image is required before video generation`,
      );
    }

    const motionPrompt = this.buildMotionPrompt(scene);

    await mkdir(this.hunyuan.getVideoStorageDirectory(), { recursive: true });

    const videoPath = await this.hunyuan.generateVideo(
      motionPrompt,
      scene.sceneNumber,
      imagePath,
      scene.duration,
    );

    return {
      ...scene,
      videoPath,
    };
  }

  private buildMotionPrompt(scene: SceneScript): string {
    const videoPrompt = scene.videoPrompt?.trim();
    if (videoPrompt) {
      return this.compactForVideo(videoPrompt, scene.visualDescription);
    }

    const visual = scene.visualDescription?.trim();
    if (visual) {
      return `Cinematic widescreen 720x480 shot. ${visual}. Slow smooth camera motion, dramatic lighting, natural movement.`;
    }

    throw new Error(
      `Scene ${scene.sceneNumber} needs a video prompt or visual description for video generation`,
    );
  }

  private compactForVideo(videoPrompt: string, visualDescription?: string): string {
    const stripped = videoPrompt
      .replace(/\*\*Character:\*\*[\s\S]*?(?=\*\*Scene:\*\*|Scene:|$)/gi, "")
      .replace(/Character appearance:[\s\S]*?(?=Scene visual:|Scene:|$)/gi, "")
      .replace(/\*\*Scene:\*\*/gi, "")
      .replace(/\s+/g, " ")
      .trim();

    if (stripped) {
      return stripped;
    }

    const visual = visualDescription?.trim();
    if (visual) {
      return `Cinematic widescreen 720x480 shot. ${visual}. Slow smooth camera motion, dramatic lighting, natural movement.`;
    }

    return videoPrompt.trim();
  }
}
