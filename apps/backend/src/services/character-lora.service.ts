import { createHash } from "crypto";
import { Injectable, Logger } from "@nestjs/common";
import { access, readFile } from "fs/promises";
import { join } from "path";
import type { StoryCharacter } from "../content-state";
import { buildSceneCharacterIdentityTag } from "../characters";
import { shouldTrainCharacterLoras } from "../scene-generation";
import { SdxlService, type SdxlLoraSpec } from "./sdxl.service";

interface LoraMeta {
  appearanceHash: string;
  instancePrompt?: string;
  defaultScale?: number;
}

@Injectable()
export class CharacterLoraService {
  private readonly logger = new Logger(CharacterLoraService.name);

  constructor(private readonly sdxl: SdxlService) {}

  private loraFilename(characterId: string): string {
    return `character-${characterId}.safetensors`;
  }

  private loraMetaFilename(characterId: string): string {
    return `character-${characterId}.lora.meta.json`;
  }

  private appearanceHash(character: StoryCharacter): string {
    return createHash("sha256")
      .update(character.appearance)
      .digest("hex")
      .slice(0, 16);
  }

  private canonicalLoraPath(characterId: string): string {
    return `/loras/${this.loraFilename(characterId)}`;
  }

  private async loraFileExists(characterId: string): Promise<boolean> {
    try {
      await access(
        join(
          this.sdxl.getLoraStorageDirectory(),
          this.loraFilename(characterId),
        ),
      );
      return true;
    } catch {
      return false;
    }
  }

  private async readLoraMeta(characterId: string): Promise<LoraMeta | null> {
    try {
      const raw = await readFile(
        join(
          this.sdxl.getLoraStorageDirectory(),
          this.loraMetaFilename(characterId),
        ),
        "utf-8",
      );
      const parsed = JSON.parse(raw) as LoraMeta;
      if (typeof parsed.appearanceHash !== "string") {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  private buildInstancePrompt(character: StoryCharacter): string {
    const tag =
      character.visualIdentityTag?.trim() ||
      buildSceneCharacterIdentityTag(character.appearance, 10);
    return `${character.name}, ${tag}, 2D cel-shaded animation character`;
  }

  private defaultLoraScale(): number {
    const raw = process.env.SDXL_LORA_DEFAULT_SCALE?.trim();
    const parsed = raw ? Number.parseFloat(raw) : Number.NaN;
    return Number.isFinite(parsed) ? parsed : 0.85;
  }

  /** Lower scale when stacking multiple character LoRAs to reduce identity merge/clones. */
  private multiLoraScale(): number {
    const raw = process.env.SDXL_LORA_MULTI_SCALE?.trim();
    const parsed = raw ? Number.parseFloat(raw) : Number.NaN;
    return Number.isFinite(parsed) ? parsed : 0.55;
  }

  async ensureLora(character: StoryCharacter): Promise<StoryCharacter> {
    if (!shouldTrainCharacterLoras()) {
      return character;
    }

    const portraitPath = character.referenceImagePath?.trim();
    if (!portraitPath) {
      return character;
    }

    const hash = this.appearanceHash(character);
    const storedMeta = await this.readLoraMeta(character.id);
    const hasCurrentLora =
      (await this.loraFileExists(character.id)) &&
      storedMeta?.appearanceHash === hash;

    if (hasCurrentLora) {
      this.logger.log(
        `Reusing existing SDXL LoRA for ${character.name} (${character.id})`,
      );
      return {
        ...character,
        loraPath: this.canonicalLoraPath(character.id),
      };
    }

    this.logger.log(`Training SDXL LoRA for ${character.name} (${character.id})`);

    const result = await this.sdxl.trainLora({
      characterId: character.id,
      portraitImagePath: portraitPath,
      instancePrompt: this.buildInstancePrompt(character),
      appearance: character.appearance,
    });

    return {
      ...character,
      loraPath: result.loraPath,
    };
  }

  async ensureLoras(characters: StoryCharacter[]): Promise<StoryCharacter[]> {
    const updated: StoryCharacter[] = [];
    for (const character of characters) {
      try {
        updated.push(await this.ensureLora(character));
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        this.logger.error(
          `LoRA ensure failed for ${character.name} (${character.id}): ${message}`,
        );
        // Keep going so one character (e.g. Valmiki) does not block Narada.
        updated.push(character);
      }
    }
    return updated;
  }

  resolveLorasForScene(characters: StoryCharacter[]): SdxlLoraSpec[] {
    const withLora = characters.filter((character) =>
      character.loraPath?.trim(),
    );
    const scale =
      withLora.length > 1 ? this.multiLoraScale() : this.defaultLoraScale();
    return withLora.map((character) => ({
      loraPath: character.loraPath!.trim(),
      adapterName: `char_${character.id.replace(/[^a-z0-9_-]/gi, "_")}`,
      scale,
    }));
  }
}
