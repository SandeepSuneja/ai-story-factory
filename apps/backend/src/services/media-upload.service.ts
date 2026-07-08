import {
  BadRequestException,
  Injectable,
  OnModuleInit,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { HunyuanService } from "./hunyuan.service";

export interface UploadedVideoFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

@Injectable()
export class MediaUploadService implements OnModuleInit {
  constructor(private readonly hunyuan: HunyuanService) {}

  async onModuleInit() {
    await mkdir(this.getVideoStorageDirectory(), { recursive: true });
  }

  getVideoStorageDirectory(): string {
    return this.hunyuan.getVideoStorageDirectory();
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

    const extension = this.resolveExtension(file.originalname, file.mimetype);
    const filename = `scene-${sceneNumber}-${randomUUID()}${extension}`;
    const outputPath = join(this.getVideoStorageDirectory(), filename);

    await writeFile(outputPath, file.buffer);

    return {
      filename,
      videoPath: `/videos/${filename}`,
    };
  }

  private resolveExtension(originalName: string, mimeType: string): string {
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
}
