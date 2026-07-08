import { Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { SceneScript, SeriesVisualStyle } from "../content-state";
import { VideoAgent } from "../agents/video.agent";

export type VideoJobStatus = "queued" | "running" | "completed" | "failed";

export interface VideoJobRecord {
  id: string;
  status: VideoJobStatus;
  sceneNumber: number;
  scene?: SceneScript;
  error?: string;
  startedAt: number;
  updatedAt: number;
}

@Injectable()
export class VideoJobService {
  private readonly jobs = new Map<string, VideoJobRecord>();

  constructor(private readonly videoAgent: VideoAgent) {}

  start(scene: SceneScript, visualStyle?: SeriesVisualStyle): VideoJobRecord {
    const id = randomUUID();
    const record: VideoJobRecord = {
      id,
      status: "queued",
      sceneNumber: scene.sceneNumber,
      startedAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.jobs.set(id, record);
    void this.run(id, scene, visualStyle);
    return record;
  }

  get(id: string): VideoJobRecord {
    const record = this.jobs.get(id);
    if (!record) {
      throw new NotFoundException(`Video job not found: ${id}`);
    }
    return record;
  }

  private async run(
    id: string,
    scene: SceneScript,
    visualStyle?: SeriesVisualStyle,
  ): Promise<void> {
    const record = this.jobs.get(id);
    if (!record) {
      return;
    }

    record.status = "running";
    record.updatedAt = Date.now();

    try {
      const result = await this.videoAgent.execute(scene, visualStyle);
      record.status = "completed";
      record.scene = result;
      record.updatedAt = Date.now();
    } catch (error) {
      record.status = "failed";
      record.error =
        error instanceof Error ? error.message : "Video generation failed";
      record.updatedAt = Date.now();
    }
  }
}
