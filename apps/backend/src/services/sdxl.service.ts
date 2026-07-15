import { Injectable } from "@nestjs/common";
import { join } from "path";
import type { SeriesOrientation } from "../content-state";
import { sdxlInferenceFetch } from "./inference-fetch";
import { getGenerationDimensions } from "../visual-style";

interface SdxlGenerateResponse {
  filename: string;
  imagePath: string;
}

export interface SdxlLoraSpec {
  loraPath: string;
  adapterName?: string;
  scale?: number;
}

export interface SdxlGenerateImageOptions {
  prompt: string;
  sceneNumber: number;
  orientation?: SeriesOrientation;
  seed?: number;
  loras?: SdxlLoraSpec[];
  filenamePrefix?: string;
}

export interface SdxlGenerateFromImageOptions {
  prompt: string;
  sceneNumber: number;
  sourceImagePath: string;
  orientation?: SeriesOrientation;
  seed?: number;
  strength?: number;
  loras?: SdxlLoraSpec[];
  filenamePrefix?: string;
}

export interface SdxlTrainLoraOptions {
  characterId: string;
  portraitImagePath: string;
  instancePrompt: string;
  appearance: string;
}

export interface SdxlTrainLoraResponse {
  loraPath: string;
  metaPath: string;
  characterId: string;
}

@Injectable()
export class SdxlService {
  private readonly serviceUrl =
    process.env.SDXL_SERVICE_URL ?? "http://127.0.0.1:7865";

  getStorageDirectory(): string {
    return (
      process.env.IMAGE_STORAGE_DIR ??
      join(process.cwd(), "storage", "images")
    );
  }

  getLoraStorageDirectory(): string {
    return (
      process.env.LORA_STORAGE_DIR ??
      join(process.cwd(), "storage", "loras")
    );
  }

  async generateImage(options: SdxlGenerateImageOptions): Promise<string> {
    const orientation = options.orientation ?? "landscape";
    const { width, height } = getGenerationDimensions(orientation);
    const response = await sdxlInferenceFetch(`${this.serviceUrl}/generate`, {
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
        filename_prefix: options.filenamePrefix,
        loras: (options.loras ?? []).map((lora) => ({
          lora_path: lora.loraPath,
          adapter_name: lora.adapterName,
          scale: lora.scale,
        })),
      }),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(
        message || `SDXL service failed with status ${response.status}`,
      );
    }

    const result = (await response.json()) as SdxlGenerateResponse;
    return result.imagePath;
  }

  async generateFromImage(
    options: SdxlGenerateFromImageOptions,
  ): Promise<string> {
    const orientation = options.orientation ?? "landscape";
    const { width, height } = getGenerationDimensions(orientation);
    const response = await sdxlInferenceFetch(
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
          strength: options.strength,
          filename_prefix: options.filenamePrefix,
          loras: (options.loras ?? []).map((lora) => ({
            lora_path: lora.loraPath,
            adapter_name: lora.adapterName,
            scale: lora.scale,
          })),
        }),
      },
    );

    if (!response.ok) {
      const message = await response.text();
      throw new Error(
        message ||
          `SDXL img2img generation failed with status ${response.status}`,
      );
    }

    const result = (await response.json()) as SdxlGenerateResponse;
    return result.imagePath;
  }

  async trainLora(
    options: SdxlTrainLoraOptions,
  ): Promise<SdxlTrainLoraResponse> {
    const response = await sdxlInferenceFetch(`${this.serviceUrl}/train-lora`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        character_id: options.characterId,
        portrait_image_path: options.portraitImagePath,
        instance_prompt: options.instancePrompt,
        appearance: options.appearance,
      }),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(
        message || `SDXL LoRA training failed with status ${response.status}`,
      );
    }

    return (await response.json()) as SdxlTrainLoraResponse;
  }
}
