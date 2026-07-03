import { Injectable } from "@nestjs/common";
import { join } from "path";
import { fluxInferenceFetch } from "./inference-fetch";

interface FluxGenerateResponse {
  filename: string;
  imagePath: string;
}

@Injectable()
export class FluxService {
  private readonly serviceUrl =
    process.env.FLUX_SERVICE_URL ?? "http://127.0.0.1:7860";

  getStorageDirectory(): string {
    return (
      process.env.IMAGE_STORAGE_DIR ??
      join(process.cwd(), "storage", "images")
    );
  }

  async generateImage(prompt: string, sceneNumber: number): Promise<string> {
    const response = await fluxInferenceFetch(`${this.serviceUrl}/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        scene_number: sceneNumber,
      }),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(
        message || `FLUX service failed with status ${response.status}`,
      );
    }

    const result = (await response.json()) as FluxGenerateResponse;
    return result.imagePath;
  }
}
