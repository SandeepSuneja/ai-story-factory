import {
  BadRequestException,
  Injectable,
  OnModuleInit,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { FluxService } from "./flux.service";
import { HunyuanService } from "./hunyuan.service";

export interface UploadedVideoFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

export interface UploadedImageFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

@Injectable()
export class MediaUploadService implements OnModuleInit {
  constructor(
    private readonly hunyuan: HunyuanService,
    private readonly flux: FluxService,
  ) {}

  async onModuleInit() {
    await mkdir(this.getVideoStorageDirectory(), { recursive: true });
    await mkdir(this.getImageStorageDirectory(), { recursive: true });
  }

  getVideoStorageDirectory(): string {
    return this.hunyuan.getVideoStorageDirectory();
  }

  getImageStorageDirectory(): string {
    return this.flux.getStorageDirectory();
  }

  async saveSceneVideo(
    sceneNumber: number,
    file: UploadedVideoFile,
  ): Promise<{ filename: string; videoPath: string }> {
    if (!file?.buffer?.length) {
      throw new BadRequestException("Video file is required.");
    }

    if (!file.mimetype.startsWith("video/")) {
      throw new BadRequestException("Uploaded file must be a video.");
    }

    const extension = this.resolveVideoExtension(file.originalname, file.mimetype);
    const filename = `scene-${sceneNumber}-${randomUUID()}${extension}`;
    const outputPath = join(this.getVideoStorageDirectory(), filename);

    await writeFile(outputPath, file.buffer);

    return {
      filename,
      videoPath: `/videos/${filename}`,
    };
  }

  async saveSceneImage(
    sceneNumber: number,
    file: UploadedImageFile,
  ): Promise<{ filename: string; imagePath: string }> {
    if (!file?.buffer?.length) {
      throw new BadRequestException("Image file is required.");
    }

    if (!file.mimetype.startsWith("image/")) {
      throw new BadRequestException("Uploaded file must be an image.");
    }

    const extension = this.resolveImageExtension(file.originalname, file.mimetype);
    const filename = `scene-${sceneNumber}-${randomUUID()}${extension}`;
    const outputPath = join(this.getImageStorageDirectory(), filename);

    await writeFile(outputPath, file.buffer);

    return {
      filename,
      imagePath: `/images/${filename}`,
    };
  }

  async saveCharacterImage(
    characterId: string,
    file: UploadedImageFile,
  ): Promise<{ filename: string; imagePath: string }> {
    if (!file?.buffer?.length) {
      throw new BadRequestException("Image file is required.");
    }

    if (!file.mimetype.startsWith("image/")) {
      throw new BadRequestException("Uploaded file must be an image.");
    }

    const safeId = characterId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 64);
    const extension = this.resolveImageExtension(file.originalname, file.mimetype);
    const filename = `character-${safeId}-${randomUUID()}${extension}`;
    const outputPath = join(this.getImageStorageDirectory(), filename);

    await writeFile(outputPath, file.buffer);

    return {
      filename,
      imagePath: `/images/${filename}`,
    };
  }

  private resolveVideoExtension(originalName: string, mimeType: string): string {
    const fromName = originalName.match(/\.[a-z0-9]+$/i)?.[0]?.toLowerCase();
    if (fromName && [".mp4", ".webm", ".mov", ".m4v"].includes(fromName)) {
      return fromName;
    }

    if (mimeType.includes("webm")) {
      return ".webm";
    }
    if (mimeType.includes("quicktime")) {
      return ".mov";
    }

    return ".mp4";
  }

  private resolveImageExtension(originalName: string, mimeType: string): string {
    const fromName = originalName.match(/\.[a-z0-9]+$/i)?.[0]?.toLowerCase();
    if (fromName && [".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(fromName)) {
      return fromName === ".jpeg" ? ".jpg" : fromName;
    }

    if (mimeType.includes("jpeg")) {
      return ".jpg";
    }
    if (mimeType.includes("webp")) {
      return ".webp";
    }
    if (mimeType.includes("gif")) {
      return ".gif";
    }

    return ".png";
  }
}
