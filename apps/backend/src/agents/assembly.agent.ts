import { Injectable } from "@nestjs/common";
import type { SceneScript } from "../content-state";
import { AssemblyService } from "../services/assembly.service";

function resolveAssemblyVideoPath(scene: SceneScript): string {
  return scene.upscaledVideoPath?.trim() || scene.videoPath?.trim() || "";
}

@Injectable()
export class AssemblyAgent {
  constructor(private readonly assembly: AssemblyService) {}

  async execute(
    scenes: SceneScript[],
    projectName?: string,
  ): Promise<string> {
    const orderedScenes = [...scenes].sort(
      (left, right) => left.sceneNumber - right.sceneNumber,
    );

    for (const scene of orderedScenes) {
      if (!resolveAssemblyVideoPath(scene)) {
        throw new Error(
          `Scene ${scene.sceneNumber} upscaled video is required before assembly`,
        );
      }
      if (!scene.audioPath?.trim()) {
        throw new Error(
          `Scene ${scene.sceneNumber} audio is required before assembly`,
        );
      }
      if (!scene.narration?.trim()) {
        throw new Error(
          `Scene ${scene.sceneNumber} narration is required for subtitles`,
        );
      }
    }

    return this.assembly.assembleFinalVideo(orderedScenes, projectName);
  }
}
