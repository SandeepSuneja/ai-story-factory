import { Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "crypto";
import type {
  SceneScript,
  SeriesVisualStyle,
  StoryCharacter,
} from "../content-state";
import { ImageAgent } from "../agents/image.agent";

export type ImageJobStatus = "queued" | "running" | "completed" | "failed";

export interface ImageJobRecord {
  id: string;
  status: ImageJobStatus;
  sceneNumber: number;
  scene?: SceneScript;
  error?: string;
  startedAt: number;
  updatedAt: number;
}

@Injectable()
export class ImageJobService {
  private readonly jobs = new Map<string, ImageJobRecord>();

  constructor(private readonly imageAgent: ImageAgent) {}

  start(
    scene: SceneScript,
    visualStyle?: SeriesVisualStyle,
    characters: StoryCharacter[] = [],
    castReferenceImagePath?: string,
    masterSceneImagePath?: string,
    regenerate = false,
  ): ImageJobRecord {
    const id = randomUUID();
    const record: ImageJobRecord = {
      id,
      status: "queued",
      sceneNumber: scene.sceneNumber,
      startedAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.jobs.set(id, record);
    void this.run(
      id,
      scene,
      visualStyle,
      characters,
      castReferenceImagePath,
      masterSceneImagePath,
      regenerate,
    );
    return record;
  }

  get(id: string): ImageJobRecord {
    const record = this.jobs.get(id);
    if (!record) {
      throw new NotFoundException(`Image job not found: ${id}`);
    }
    return record;
  }

  private async run(
    id: string,
    scene: SceneScript,
    visualStyle?: SeriesVisualStyle,
    characters: StoryCharacter[] = [],
    castReferenceImagePath?: string,
    masterSceneImagePath?: string,
    regenerate = false,
  ): Promise<void> {
    const record = this.jobs.get(id);
    if (!record) {
      return;
    }

    record.status = "running";
    record.updatedAt = Date.now();

    try {
      const result = await this.imageAgent.execute(
        scene,
        visualStyle,
        characters,
        castReferenceImagePath,
        masterSceneImagePath,
        regenerate,
      );
      record.status = "completed";
      record.scene = result;
      record.updatedAt = Date.now();
    } catch (error) {
      record.status = "failed";
      record.error =
        error instanceof Error ? error.message : "Image generation failed";
      record.updatedAt = Date.now();
    }
  }
}
