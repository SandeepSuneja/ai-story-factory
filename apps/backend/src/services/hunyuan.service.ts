import { Injectable } from "@nestjs/common";
import { join } from "path";
import { inferenceFetch, videoInferenceFetch } from "./inference-fetch";

interface HunyuanGenerateResponse {
  filename: string;
  videoPath: string;
}

interface HunyuanHealthResponse {
  status: string;
  model?: string;
  detail?: string;
}

@Injectable()
export class HunyuanService {
  private readonly serviceUrl =
    process.env.HUNYUAN_SERVICE_URL ?? "http://127.0.0.1:7861";

  getImageStorageDirectory(): string {
    return (
      process.env.IMAGE_STORAGE_DIR ??
      join(process.cwd(), "storage", "images")
    );
  }

  getVideoStorageDirectory(): string {
    return (
      process.env.VIDEO_STORAGE_DIR ??
      join(process.cwd(), "storage", "videos")
    );
  }

  resolveImageFilename(imagePath: string): string {
    const normalized = imagePath.replace(/\\/g, "/");
    const parts = normalized.split("/");
    const filename = parts[parts.length - 1];
    if (!filename) {
      throw new Error(`Invalid image path: ${imagePath}`);
    }
    return filename;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async assertServiceReachable(): Promise<void> {
    const pollMs = 5_000;
    const startupDeadline = Date.now() + 2 * 60 * 1000;
    const loadDeadline = Date.now() + 30 * 60 * 1000;
    let sawServer = false;
    let lastError: unknown;

    while (Date.now() < loadDeadline) {
      try {
        const response = await inferenceFetch(`${this.serviceUrl}/health`);

        if (response.status === 503) {
          const body = (await response.json().catch(() => ({}))) as {
            detail?: string;
          };
          throw new Error(
            `Wan2.1 model failed to load: ${body.detail ?? response.statusText}`,
          );
        }

        if (!response.ok) {
          throw new Error(
            `Wan2.1 health check failed with status ${response.status}`,
          );
        }

        sawServer = true;
        const body = (await response.json()) as HunyuanHealthResponse;
        if (body.status === "ok") {
          return;
        }

        if (body.status === "loading" || body.status === "starting") {
          await this.sleep(pollMs);
          continue;
        }

        throw new Error(
          `Wan2.1 service reported unexpected status: ${body.status}`,
        );
      } catch (error) {
        lastError = error;
        if (error instanceof Error && error.message.startsWith("Wan2.1")) {
          throw error;
        }

        const code = this.extractErrorCode(error);
        if (code === "ECONNREFUSED") {
          const deadline = sawServer ? loadDeadline : startupDeadline;
          if (Date.now() >= deadline) {
            break;
          }
          await this.sleep(pollMs);
          continue;
        }

        throw new Error(
          this.describeFetchFailure(
            "Wan2.1 service is not reachable",
            error,
          ),
        );
      }
    }

    if (!sawServer) {
      throw new Error(
        this.describeFetchFailure(
          "Wan2.1 service is not reachable",
          lastError,
        ),
      );
    }

    throw new Error(
      "Wan2.1 service is still loading the model. " +
        "First startup can take 15+ minutes on 12 GB VRAM — " +
        "keep the video service terminal open and retry shortly.",
    );
  }

  private extractErrorCode(error: unknown): string | undefined {
    let current: unknown = error;

    for (let depth = 0; depth < 6 && current; depth++) {
      if (
        typeof current === "object" &&
        current !== null &&
        "code" in current &&
        typeof (current as NodeJS.ErrnoException).code === "string"
      ) {
        return (current as NodeJS.ErrnoException).code;
      }

      if (current instanceof Error && "cause" in current) {
        current = current.cause;
        continue;
      }

      break;
    }

    return undefined;
  }

  private describeFetchFailure(context: string, error: unknown): string {
    const code = this.extractErrorCode(error);

    if (code === "ECONNREFUSED") {
      return (
        `${context}. Wan2.1 service is not running — start it with: ` +
        "cd apps/backend/hunyuan-service && python server.py"
      );
    }

    if (code === "ECONNRESET" || code === "UND_ERR_SOCKET") {
      return (
        `${context}. The Wan2.1 process closed the connection mid-request — ` +
        "it usually crashed from GPU out-of-memory. " +
        "Stop FLUX and Qwen GPU usage, restart the video service, then retry with fewer frames/steps."
      );
    }

    if (
      code === "UND_ERR_HEADERS_TIMEOUT" ||
      code === "UND_ERR_BODY_TIMEOUT"
    ) {
      return (
        `${context}. NestJS timed out waiting for Wan2.1. ` +
        "Restart NestJS after pulling the latest code, " +
        "or set HUNYUAN_BODY_TIMEOUT_MS=172800000 (48 h) in apps/backend/.env."
      );
    }

    const detail = error instanceof Error ? error.message : String(error);
    return `${context}: ${detail}`;
  }

  async generateVideo(
    prompt: string,
    sceneNumber: number,
    imagePath: string,
    durationSeconds?: number,
  ): Promise<string> {
    await this.assertServiceReachable();

    let response: Awaited<ReturnType<typeof videoInferenceFetch>>;
    try {
      response = await videoInferenceFetch(`${this.serviceUrl}/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          scene_number: sceneNumber,
          image_filename: this.resolveImageFilename(imagePath),
          duration_seconds: durationSeconds,
        }),
      });
    } catch (error) {
      throw new Error(
        this.describeFetchFailure("Wan2.1 request failed", error),
      );
    }

    if (!response.ok) {
      const message = await response.text();
      throw new Error(
        message || `Wan2.1 service failed with status ${response.status}`,
      );
    }

    const result = (await response.json()) as HunyuanGenerateResponse;
    return result.videoPath;
  }
}
