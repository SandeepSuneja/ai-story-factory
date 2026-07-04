import { Injectable } from "@nestjs/common";
import { join } from "path";
import type { DialogueSegment, SubtitleCue } from "../content-state";
import { inferenceFetch } from "./inference-fetch";

export interface DialogueAudioLine {
  text: string;
  voice: string;
  speaker: string;
  characterId?: string;
}

interface TtsGenerateResponse {
  filename: string;
  audioPath: string;
  backend: string;
  durationSeconds: number;
}

interface TtsDialogueResponse {
  filename: string;
  audioPath: string;
  backend: string;
  durationSeconds: number;
  subtitleCues: SubtitleCue[];
  dialogueSegments: DialogueSegment[];
}

@Injectable()
export class TtsService {
  private readonly serviceUrl =
    process.env.TTS_SERVICE_URL ?? "http://127.0.0.1:7862";

  getStorageDirectory(): string {
    return (
      process.env.AUDIO_STORAGE_DIR ??
      join(process.cwd(), "storage", "audio")
    );
  }

  private async assertServiceReachable(): Promise<void> {
    let response: Awaited<ReturnType<typeof inferenceFetch>>;
    try {
      response = await inferenceFetch(`${this.serviceUrl}/health`);
    } catch (error) {
      throw new Error(
        this.describeFetchFailure(
          "TTS service is not reachable",
          error,
        ),
      );
    }

    if (!response.ok) {
      throw new Error(
        `TTS health check failed with status ${response.status}`,
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
        `${context}. TTS service is not running — start it with: ` +
        "cd apps/backend/tts-service && python server.py"
      );
    }

    const detail = error instanceof Error ? error.message : String(error);
    return `${context}: ${detail}`;
  }

  async generateAudio(
    text: string,
    sceneNumber: number,
    language = "en",
  ): Promise<string> {
    await this.assertServiceReachable();

    const response = await inferenceFetch(`${this.serviceUrl}/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        scene_number: sceneNumber,
        language,
      }),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(
        message || `TTS service failed with status ${response.status}`,
      );
    }

    const result = (await response.json()) as TtsGenerateResponse;
    return result.audioPath;
  }

  async generateDialogueAudio(
    lines: DialogueAudioLine[],
    sceneNumber: number,
    language = "en",
  ): Promise<{
    audioPath: string;
    subtitleCues: SubtitleCue[];
    dialogueSegments: DialogueSegment[];
  }> {
    await this.assertServiceReachable();

    const response = await inferenceFetch(`${this.serviceUrl}/generate/dialogue`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        scene_number: sceneNumber,
        language,
        lines,
      }),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(
        message || `TTS dialogue service failed with status ${response.status}`,
      );
    }

    const result = (await response.json()) as TtsDialogueResponse;
    return {
      audioPath: result.audioPath,
      subtitleCues: result.subtitleCues,
      dialogueSegments: result.dialogueSegments ?? [],
    };
  }
}
