import { Injectable } from "@nestjs/common";
import { join } from "path";
import type { SeriesOrientation } from "../content-state";
import type { SceneReferenceKind } from "../characters";
import { fluxInferenceFetch } from "./inference-fetch";
import { getGenerationDimensions } from "../visual-style";

interface FluxGenerateResponse {
  filename: string;
  imagePath: string;
}

export interface FluxGenerateImageOptions {
  prompt: string;
  sceneNumber: number;
  orientation?: SeriesOrientation;
  seed?: number;
  referenceImagePaths?: string[];
  referenceKind?: SceneReferenceKind;
  filenamePrefix?: string;
}

export interface FluxExtendPortraitFullBodyOptions {
  portraitImagePath: string;
  filenamePrefix?: string;
  canvasWidth?: number;
  canvasHeight?: number;
}

export interface FluxComposeCastSheetOptions {
  referenceImagePaths: string[];
  filenamePrefix?: string;
  canvasWidth?: number;
  canvasHeight?: number;
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

  async generateImage(options: FluxGenerateImageOptions): Promise<string> {
    const orientation = options.orientation ?? "landscape";
    const { width, height } = getGenerationDimensions(orientation);
    const response = await fluxInferenceFetch(`${this.serviceUrl}/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: options.prompt,
        scene_number: options.sceneNumber,
        orientation,
        width,
        height,
        seed: options.seed,
        reference_image_paths: options.referenceImagePaths ?? [],
        reference_kind: options.referenceKind ?? "none",
        filename_prefix: options.filenamePrefix,
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

  async extendPortraitFullBody(
    options: FluxExtendPortraitFullBodyOptions,
  ): Promise<string> {
    const response = await fluxInferenceFetch(
      `${this.serviceUrl}/extend-portrait-fullbody`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          portrait_image_path: options.portraitImagePath,
          filename_prefix: options.filenamePrefix,
          canvas_width: options.canvasWidth,
          canvas_height: options.canvasHeight,
        }),
      },
    );

    if (!response.ok) {
      const message = await response.text();
      throw new Error(
        message ||
          `Portrait full-body extension failed with status ${response.status}`,
      );
    }

    const result = (await response.json()) as FluxGenerateResponse;
    return result.imagePath;
  }

  async composeCastSheet(
    options: FluxComposeCastSheetOptions,
  ): Promise<string> {
    const response = await fluxInferenceFetch(
      `${this.serviceUrl}/compose-cast-sheet`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reference_image_paths: options.referenceImagePaths,
          filename_prefix: options.filenamePrefix,
          canvas_width: options.canvasWidth,
          canvas_height: options.canvasHeight,
        }),
      },
    );

    if (!response.ok) {
      const message = await response.text();
      throw new Error(
        message || `FLUX cast-sheet compose failed with status ${response.status}`,
      );
    }

    const result = (await response.json()) as FluxGenerateResponse;
    return result.imagePath;
  }
}
