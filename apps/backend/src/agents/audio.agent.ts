import { Injectable } from "@nestjs/common";
import type { SceneScript } from "../content-state";
import { TtsService } from "../services/tts.service";

@Injectable()
export class AudioAgent {
  constructor(private readonly tts: TtsService) {}

  async execute(scene: SceneScript): Promise<SceneScript> {
    const narration = scene.narration?.trim();
    if (!narration) {
      throw new Error(
        `Scene ${scene.sceneNumber} narration is required before audio generation`,
      );
    }

    const audioPath = await this.tts.generateAudio(
      narration,
      scene.sceneNumber,
    );

    return {
      ...scene,
      audioPath,
    };
  }
}
