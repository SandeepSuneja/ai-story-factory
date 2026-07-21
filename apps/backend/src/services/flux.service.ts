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

export interface FluxGenerateFromImageOptions {
  prompt: string;
  sceneNumber: number;
  sourceImagePath: string;
  orientation?: SeriesOrientation;
  seed?: number;
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

export interface FluxComposeFaceReferenceSheetOptions {
  referenceImagePaths: string[];
  filenamePrefix?: string;
  canvasWidth?: number;
  canvasHeight?: number;
}

export interface FluxComposeSceneOptions {
  backgroundPrompt: string;
  placements: Array<{
    referenceImagePath: string;
    xRatio: number;
    baseYRatio: number;
    heightRatio: number;
  }>;
  sceneNumber: number;
  orientation?: SeriesOrientation;
  seed?: number;
  canvasWidth?: number;
  canvasHeight?: number;
  filenamePrefix?: string;
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

  async generateFromImage(
    options: FluxGenerateFromImageOptions,
  ): Promise<string> {
    const orientation = options.orientation ?? "landscape";
    const { width, height } = getGenerationDimensions(orientation);
    const response = await fluxInferenceFetch(
      `${this.serviceUrl}/generate-from-image`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: options.prompt,
          scene_number: options.sceneNumber,
          source_image_path: options.sourceImagePath,
          orientation,
          width,
          height,
          seed: options.seed,
          filename_prefix: options.filenamePrefix,
        }),
      },
    );

    if (!response.ok) {
      const message = await response.text();
      throw new Error(
        message ||
          `FLUX Kontext generation failed with status ${response.status}`,
      );
    }

    const result = (await response.json()) as FluxGenerateResponse;
    return result.imagePath;
  }

  async composeScene(options: FluxComposeSceneOptions): Promise<string> {
    const orientation = options.orientation ?? "landscape";
    const { width, height } =
      options.canvasWidth && options.canvasHeight
        ? { width: options.canvasWidth, height: options.canvasHeight }
        : getGenerationDimensions(orientation);

    const response = await fluxInferenceFetch(`${this.serviceUrl}/compose-scene`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        background_prompt: options.backgroundPrompt,
        placements: options.placements.map((placement) => ({
          reference_image_path: placement.referenceImagePath,
          x_ratio: placement.xRatio,
          base_y_ratio: placement.baseYRatio,
          height_ratio: placement.heightRatio,
        })),
        scene_number: options.sceneNumber,
        orientation,
        width,
        height,
        seed: options.seed,
        filename_prefix: options.filenamePrefix,
      }),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(
        message || `FLUX scene compose failed with status ${response.status}`,
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

  async composeFaceReferenceSheet(
    options: FluxComposeFaceReferenceSheetOptions,
  ): Promise<string> {
    const response = await fluxInferenceFetch(
      `${this.serviceUrl}/compose-face-reference-sheet`,
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
        message ||
          `FLUX face reference sheet compose failed with status ${response.status}`,
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
