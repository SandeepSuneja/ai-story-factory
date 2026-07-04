import { Injectable } from "@nestjs/common";
import { join } from "path";
import { inferenceFetch } from "./inference-fetch";
import type { SceneScript } from "../content-state";

interface AssemblyResponse {
  filename: string;
  finalVideoPath: string;
  sceneCount: number;
  durationSeconds: number;
}

@Injectable()
export class AssemblyService {
  private readonly serviceUrl =
    process.env.ASSEMBLY_SERVICE_URL ?? "http://127.0.0.1:7863";

  getFinalVideoStorageDirectory(): string {
    return (
      process.env.VIDEO_STORAGE_DIR ??
      join(process.cwd(), "storage", "videos")
    );
  }

  private resolveMediaFilename(pathValue: string): string {
    const normalized = pathValue.replace(/\\/g, "/");
    const filename = normalized.split("/").pop();
    if (!filename) {
      throw new Error(`Invalid media path: ${pathValue}`);
    }
    return filename;
  }

  private async assertServiceReachable(): Promise<void> {
    let response: Awaited<ReturnType<typeof inferenceFetch>>;
    try {
      response = await inferenceFetch(`${this.serviceUrl}/health`);
    } catch (error) {
      throw new Error(
        this.describeFetchFailure(
          "Assembly service is not reachable",
          error,
        ),
      );
    }

    if (!response.ok) {
      throw new Error(
        `Assembly health check failed with status ${response.status}`,
      );
    }
  }

  private describeFetchFailure(context: string, error: unknown): string {
    const code =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof (error as NodeJS.ErrnoException).code === "string"
        ? (error as NodeJS.ErrnoException).code
        : undefined;

    if (code === "ECONNREFUSED") {
      return (
        `${context}. Assembly service is not running — start it with: ` +
        "cd apps/backend/assembly-service && python server.py"
      );
    }

    const detail = error instanceof Error ? error.message : String(error);
    return `${context}: ${detail}`;
  }

  async assembleFinalVideo(
    scenes: SceneScript[],
    projectName?: string,
  ): Promise<string> {
    await this.assertServiceReachable();

    const payload = {
      project_name: projectName,
      scenes: scenes.map((scene) => ({
        scene_number: scene.sceneNumber,
        video_filename: this.resolveMediaFilename(
          scene.upscaledVideoPath ?? scene.videoPath ?? "",
        ),
        audio_filename: this.resolveMediaFilename(scene.audioPath ?? ""),
        narration: scene.narration,
        subtitle_cues: scene.subtitleCues?.map((cue) => ({
          start: cue.start,
          end: cue.end,
          text: cue.text,
        })),
        duration_seconds: scene.duration,
      })),
    };

    const response = await inferenceFetch(`${this.serviceUrl}/assemble`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(
        message || `Assembly service failed with status ${response.status}`,
      );
    }

    const result = (await response.json()) as AssemblyResponse;
    return result.finalVideoPath;
  }
}
