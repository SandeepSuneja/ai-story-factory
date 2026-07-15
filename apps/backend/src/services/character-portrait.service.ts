import { Injectable } from "@nestjs/common";
import { access, readFile, writeFile } from "fs/promises";
import { join } from "path";
import type { SeriesVisualStyle, StoryCharacter } from "../content-state";
import {
  buildSceneCharacterIdentityTag,
  buildCharacterPortraitPrompt,
  characterPortraitSeed,
  deterministicSeed,
} from "../characters";
import { imagePromptAnimationSuffix, mergeVisualStyle } from "../visual-style";
import { FluxService } from "./flux.service";

interface PortraitMeta {
  appearanceHash: number;
  visualIdentityTag?: string;
}

@Injectable()
export class CharacterPortraitService {
  constructor(private readonly flux: FluxService) {}

  private portraitFilename(characterId: string): string {
    return `character-${characterId}.png`;
  }

  private portraitMetaFilename(characterId: string): string {
    return `character-${characterId}.png.meta.json`;
  }

  private appearanceHash(character: StoryCharacter): number {
    return deterministicSeed(character.appearance);
  }

  private async portraitFileExists(filename: string): Promise<boolean> {
    try {
      await access(join(this.flux.getStorageDirectory(), filename));
      return true;
    } catch {
      return false;
    }
  }

  private async readPortraitMeta(
    characterId: string,
  ): Promise<PortraitMeta | null> {
    try {
      const raw = await readFile(
        join(
          this.flux.getStorageDirectory(),
          this.portraitMetaFilename(characterId),
        ),
        "utf-8",
      );
      const parsed = JSON.parse(raw) as PortraitMeta;
      if (typeof parsed.appearanceHash !== "number") {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  private async writePortraitMeta(
    characterId: string,
    appearanceHash: number,
    visualIdentityTag: string,
  ): Promise<void> {
    await writeFile(
      join(
        this.flux.getStorageDirectory(),
        this.portraitMetaFilename(characterId),
      ),
      JSON.stringify({
        appearanceHash,
        visualIdentityTag,
      } satisfies PortraitMeta),
      "utf-8",
    );
  }

  async generatePortrait(
    character: StoryCharacter,
    visualStyle?: SeriesVisualStyle,
  ): Promise<string> {
    const resolvedStyle = mergeVisualStyle(visualStyle);
    const prompt = buildCharacterPortraitPrompt(
      character,
      imagePromptAnimationSuffix(resolvedStyle.animationStyle),
    );

    return this.flux.generateImage({
      prompt,
      sceneNumber: 0,
      orientation: resolvedStyle.orientation,
      seed: characterPortraitSeed(character.id),
      filenamePrefix: `character-${character.id}`,
    });
  }

  async ensurePortraits(
    characters: StoryCharacter[],
    visualStyle?: SeriesVisualStyle,
  ): Promise<StoryCharacter[]> {
    const updated: StoryCharacter[] = [];

    for (const character of characters) {
      const filename = this.portraitFilename(character.id);
      const canonicalPath = `/images/${filename}`;
      const hash = this.appearanceHash(character);
      const storedMeta = await this.readPortraitMeta(character.id);
      const hasCurrentPortrait =
        (await this.portraitFileExists(filename)) &&
        storedMeta?.appearanceHash === hash;

      if (hasCurrentPortrait) {
        const visualIdentityTag =
          storedMeta?.visualIdentityTag?.trim() ||
          buildSceneCharacterIdentityTag(character.appearance, 10);
        updated.push({
          ...character,
          referenceImagePath: canonicalPath,
          visualIdentityTag,
        });
        continue;
      }

      const visualIdentityTag = buildSceneCharacterIdentityTag(
        character.appearance,
        10,
      );
      const referenceImagePath = await this.generatePortrait(
        character,
        visualStyle,
      );
      await this.writePortraitMeta(character.id, hash, visualIdentityTag);
      updated.push({
        ...character,
        referenceImagePath,
        visualIdentityTag,
      });
    }

    return updated;
  }
}
