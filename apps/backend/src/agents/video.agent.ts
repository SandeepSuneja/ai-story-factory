import { Injectable } from "@nestjs/common";
import { mkdir } from "fs/promises";
import type { SceneScript, SeriesVisualStyle } from "../content-state";
import { buildSpeakingMotionHint } from "../characters";
import { HunyuanService } from "../services/hunyuan.service";
import { mergeVisualStyle } from "../visual-style";

const MAX_VIDEO_WORDS = 45;

@Injectable()
export class VideoAgent {
  constructor(private readonly hunyuan: HunyuanService) {}

  async execute(
    scene: SceneScript,
    visualStyle?: SeriesVisualStyle,
  ): Promise<SceneScript> {
    const imagePath = scene.imagePath?.trim();
    if (!imagePath) {
      throw new Error(
        `Scene ${scene.sceneNumber} image is required before video generation`,
      );
    }

    const motionPrompt = this.buildMotionPrompt(scene);
    const orientation = mergeVisualStyle(visualStyle).orientation;

    await mkdir(this.hunyuan.getVideoStorageDirectory(), { recursive: true });

    const videoPath = await this.hunyuan.generateVideo(
      motionPrompt,
      scene.sceneNumber,
      imagePath,
      scene.duration,
      orientation,
    );

    return {
      ...scene,
      videoPath,
    };
  }

  private buildMotionPrompt(scene: SceneScript): string {
    const speakingHint = buildSpeakingMotionHint(scene);
    const videoPrompt = scene.videoPrompt?.trim();
    if (videoPrompt) {
      return this.appendSpeakingHint(
        this.compactForWan(videoPrompt, scene.duration, scene.visualDescription),
        speakingHint,
      );
    }

    const visual = scene.visualDescription?.trim();
    if (visual) {
      const hint =
        scene.duration <= 4
          ? "Very slow subtle motion."
          : "Slow smooth continuous motion.";
      return this.appendSpeakingHint(
        `${hint} ${visual}. Gentle cinematic camera push-in.`,
        speakingHint,
      );
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

  private appendSpeakingHint(prompt: string, speakingHint: string): string {
    if (!speakingHint) {
      return prompt;
    }

    const combined = `${prompt} ${speakingHint}`.replace(/\s+/g, " ").trim();
    const words = combined.split(/\s+/).filter(Boolean);
    if (words.length <= MAX_VIDEO_WORDS) {
      return combined;
    }

    return words.slice(0, MAX_VIDEO_WORDS).join(" ").replace(/[,;:\-–—]+$/, "");
  }
}
