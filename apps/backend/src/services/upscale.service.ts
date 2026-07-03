import { Injectable } from "@nestjs/common";
import { unlink } from "fs/promises";
import { join } from "path";
import { inferenceFetch } from "./inference-fetch";

interface UpscaleVideoResponse {
  filename: string;
  videoPath: string;
  width: number;
  height: number;
}

@Injectable()
export class UpscaleService {
  private readonly serviceUrl =
    process.env.UPSCALE_SERVICE_URL ?? "http://127.0.0.1:7864";

  getVideoStorageDirectory(): string {
    return (
      process.env.VIDEO_STORAGE_DIR ??
      join(process.cwd(), "storage", "videos")
    );
  }

  resolveVideoFilename(videoPath: string): string {
    const normalized = videoPath.replace(/\\/g, "/");
    const parts = normalized.split("/");
    const filename = parts[parts.length - 1];
    if (!filename) {
      throw new Error(`Invalid video path: ${videoPath}`);
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
          "Video upscale service is not reachable",
          error,
        ),
      );
    }

    if (!response.ok) {
      throw new Error(
        `Upscale health check failed with status ${response.status}`,
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
        `${context}. Start it with: ` +
        "cd apps/backend/upscale-service && python server.py"
      );
    }

    const detail = error instanceof Error ? error.message : String(error);
    return `${context}: ${detail}`;
  }

  async upscaleVideo(
    videoPath: string,
    sceneNumber: number,
  ): Promise<string> {
    await this.assertServiceReachable();

    const response = await inferenceFetch(`${this.serviceUrl}/upscale`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        video_filename: this.resolveVideoFilename(videoPath),
        scene_number: sceneNumber,
      }),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(
        message || `Upscale service failed with status ${response.status}`,
      );
    }

    const result = (await response.json()) as UpscaleVideoResponse;
    return result.videoPath;
  }

  async deleteVideoFile(videoPath: string): Promise<void> {
    const filename = this.resolveVideoFilename(videoPath);
    const filePath = join(this.getVideoStorageDirectory(), filename);

    try {
      await unlink(filePath);
    } catch (error) {
      const code =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof (error as NodeJS.ErrnoException).code === "string"
          ? (error as NodeJS.ErrnoException).code
          : undefined;

      if (code !== "ENOENT") {
        throw error;
      }
    }
  }
}
