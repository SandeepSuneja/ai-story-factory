import { Injectable } from "@nestjs/common";
import { mkdir } from "fs/promises";
import type { SceneScript } from "../content-state";
import { HunyuanService } from "../services/hunyuan.service";

const MAX_VIDEO_WORDS = 45;

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
      return this.compactForWan(videoPrompt, scene.duration, scene.visualDescription);
    }

    const visual = scene.visualDescription?.trim();
    if (visual) {
      const hint =
        scene.duration <= 4
          ? "Very slow subtle motion."
          : "Slow smooth continuous motion.";
      return `${hint} ${visual}. Gentle cinematic camera push-in.`;
    }

    throw new Error(
      `Scene ${scene.sceneNumber} needs a video prompt or visual description for video generation`,
    );
  }

  private compactForWan(
    videoPrompt: string,
    duration: number,
    visualDescription?: string,
  ): string {
    const stripped = videoPrompt
      .replace(/\*\*Character:\*\*[\s\S]*?(?=\*\*Scene:\*\*|Scene:|$)/gi, "")
      .replace(/Character appearance:[\s\S]*?(?=Scene visual:|Scene:|$)/gi, "")
      .replace(/\*\*Scene:\*\*/gi, "")
      .replace(
        /\b(morph(?:ing|s)?|dissolv(?:e|ing|es)|explod(?:e|ing|es)|clone|duplicate|multiple versions?|on-screen text|subtitle|caption|television screen|walking backwards|teleport)\b/gi,
        "",
      )
      .replace(/\s+/g, " ")
      .trim();

    const words = stripped.split(/\s+/).filter(Boolean);
    const compact =
      words.length > MAX_VIDEO_WORDS
        ? words.slice(0, MAX_VIDEO_WORDS).join(" ").replace(/[,;:\-–—]+$/, "")
        : stripped;

    if (compact) {
      return compact;
    }

    const visual = visualDescription?.trim();
    if (visual) {
      const hint =
        duration <= 4
          ? "Very slow subtle motion."
          : "Slow smooth continuous motion.";
      return `${hint} Gentle push-in. ${visual}`;
    }

    return videoPrompt.trim();
  }
}
