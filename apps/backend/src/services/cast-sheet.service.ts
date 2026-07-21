import { Injectable } from "@nestjs/common";
import { access, readFile, writeFile } from "fs/promises";
import { join } from "path";
import type { SeriesVisualStyle, StoryCharacter } from "../content-state";
import { deterministicSeed } from "../characters";
import { FluxService } from "./flux.service";
import { getGenerationDimensions, mergeVisualStyle } from "../visual-style";

interface CastSheetMeta {
  castHash: number;
  source: "portrait-lineup";
}

interface FullBodyMeta {
  sourceSignature: number;
  method: "portrait-extension-v2";
}

const FULL_BODY_METHOD = "portrait-extension-v2" as const;

const FULLBODY_CANVAS_WIDTH = Number.parseInt(
  process.env.FLUX_FULLBODY_WIDTH ?? "480",
  10,
) || 480;
const FULLBODY_CANVAS_HEIGHT = Number.parseInt(
  process.env.FLUX_FULLBODY_HEIGHT ?? "832",
  10,
) || 832;
const CAST_SHEET_CANVAS_WIDTH = Number.parseInt(
  process.env.FLUX_CAST_SHEET_WIDTH ?? "832",
  10,
) || 832;
const CAST_SHEET_CANVAS_HEIGHT = Number.parseInt(
  process.env.FLUX_CAST_SHEET_HEIGHT ?? "832",
  10,
) || 832;

@Injectable()
export class CastSheetService {
  constructor(private readonly flux: FluxService) {}

  private appearanceHash(character: StoryCharacter): number {
    return deterministicSeed(character.appearance);
  }

  private fullBodySourceSignature(character: StoryCharacter): number {
    return deterministicSeed(
      [
        FULL_BODY_METHOD,
        character.id,
        this.appearanceHash(character),
        character.referenceImagePath?.trim() ?? "",
        String(FULLBODY_CANVAS_WIDTH),
        String(FULLBODY_CANVAS_HEIGHT),
      ].join("|"),
    );
  }

  private castHash(characters: StoryCharacter[]): number {
    const signature = [
      "cast-sheet-portrait-lineup-v5",
      String(CAST_SHEET_CANVAS_WIDTH),
      String(CAST_SHEET_CANVAS_HEIGHT),
      ...characters
        .slice()
        .sort((left, right) => left.id.localeCompare(right.id))
        .map(
          (character) =>
            `${character.id}:${character.referenceImagePath?.trim() ?? ""}`,
        ),
    ].join("|");

    return deterministicSeed(signature);
  }

  private castFilename(castHash: number): string {
    return `cast-${castHash.toString(16)}.png`;
  }

  private castMetaFilename(castHash: number): string {
    return `cast-${castHash.toString(16)}.png.meta.json`;
  }

  private fullBodyFilename(characterId: string): string {
    return `character-fullbody-${characterId}.png`;
  }

  private fullBodyMetaFilename(characterId: string): string {
    return `character-fullbody-${characterId}.png.meta.json`;
  }

  private async fileExists(filename: string): Promise<boolean> {
    try {
      await access(join(this.flux.getStorageDirectory(), filename));
      return true;
    } catch {
      return false;
    }
  }

  private async readCastMeta(castHash: number): Promise<CastSheetMeta | null> {
    try {
      const raw = await readFile(
        join(this.flux.getStorageDirectory(), this.castMetaFilename(castHash)),
        "utf-8",
      );
      return JSON.parse(raw) as CastSheetMeta;
    } catch {
      return null;
    }
  }

  private async writeCastMeta(castHash: number): Promise<void> {
    await writeFile(
      join(this.flux.getStorageDirectory(), this.castMetaFilename(castHash)),
      JSON.stringify({
        castHash,
        source: "portrait-lineup",
      } satisfies CastSheetMeta),
      "utf-8",
    );
  }

  private async readFullBodyMeta(
    characterId: string,
  ): Promise<FullBodyMeta | null> {
    try {
      const raw = await readFile(
        join(
          this.flux.getStorageDirectory(),
          this.fullBodyMetaFilename(characterId),
        ),
        "utf-8",
      );
      return JSON.parse(raw) as FullBodyMeta;
    } catch {
      return null;
    }
  }

  private async writeFullBodyMeta(
    characterId: string,
    sourceSignature: number,
  ): Promise<void> {
    await writeFile(
      join(
        this.flux.getStorageDirectory(),
        this.fullBodyMetaFilename(characterId),
      ),
      JSON.stringify({
        sourceSignature,
        method: FULL_BODY_METHOD,
      } satisfies FullBodyMeta),
      "utf-8",
    );
  }

  private sortedCharacters(characters: StoryCharacter[]): StoryCharacter[] {
    return characters
      .slice()
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  async ensureFullBodyReference(
    character: StoryCharacter,
  ): Promise<string> {
    const portraitPath = character.referenceImagePath?.trim();
    if (!portraitPath) {
      throw new Error(
        `Character ${character.name} is missing a portrait reference before full-body generation`,
      );
    }

    const sourceSignature = this.fullBodySourceSignature(character);
    const filename = this.fullBodyFilename(character.id);
    const canonicalPath = `/images/${filename}`;
    const storedMeta = await this.readFullBodyMeta(character.id);
    const hasCurrentFullBody =
      storedMeta?.method === FULL_BODY_METHOD &&
      storedMeta.sourceSignature === sourceSignature &&
      (await this.fileExists(filename));

    if (hasCurrentFullBody) {
      return canonicalPath;
    }

    const imagePath = await this.flux.extendPortraitFullBody({
      portraitImagePath: portraitPath,
      filenamePrefix: `character-fullbody-${character.id}`,
      canvasWidth: FULLBODY_CANVAS_WIDTH,
      canvasHeight: FULLBODY_CANVAS_HEIGHT,
    });

    await this.writeFullBodyMeta(character.id, sourceSignature);
    return imagePath;
  }

  async ensureCastSheet(
    characters: StoryCharacter[],
    _visualStyle?: SeriesVisualStyle,
  ): Promise<string | undefined> {
    if (characters.length < 2) {
      return undefined;
    }

    const ordered = this.sortedCharacters(characters);
    if (ordered.some((character) => !character.referenceImagePath?.trim())) {
      return undefined;
    }

    const hash = this.castHash(characters);
    const filename = this.castFilename(hash);
    const canonicalPath = `/images/${filename}`;
    const storedMeta = await this.readCastMeta(hash);
    const hasCurrentCastSheet =
      storedMeta?.source === "portrait-lineup" &&
      storedMeta.castHash === hash &&
      (await this.fileExists(filename));

    if (hasCurrentCastSheet) {
      return canonicalPath;
    }

    const portraitPaths = ordered.map(
      (character) => character.referenceImagePath!.trim(),
    );

    const imagePath = await this.flux.composeCastSheet({
      referenceImagePaths: portraitPaths,
      filenamePrefix: `cast-${hash.toString(16)}`,
      canvasWidth: CAST_SHEET_CANVAS_WIDTH,
      canvasHeight: CAST_SHEET_CANVAS_HEIGHT,
    });

    await this.writeCastMeta(hash);
    return imagePath;
  }

  private faceSheetHash(
    characters: StoryCharacter[],
    canvasWidth: number,
    canvasHeight: number,
  ): number {
    const signature = [
      "face-sheet-portrait-lineup-v1",
      String(canvasWidth),
      String(canvasHeight),
      ...this.sortedCharacters(characters).map(
        (character) =>
          `${character.id}:${character.referenceImagePath?.trim() ?? ""}:${character.visualIdentityTag?.trim() ?? ""}`,
      ),
    ].join("|");
    return deterministicSeed(signature);
  }

  private faceSheetFilename(faceHash: number): string {
    return `face-${faceHash.toString(16)}.png`;
  }

  async ensureFaceReferenceSheet(
    characters: StoryCharacter[],
    visualStyle?: SeriesVisualStyle,
  ): Promise<string | undefined> {
    if (characters.length < 2) {
      return undefined;
    }

    const ordered = this.sortedCharacters(characters);
    if (ordered.some((character) => !character.referenceImagePath?.trim())) {
      return undefined;
    }

    const { width, height } = getGenerationDimensions(
      mergeVisualStyle(visualStyle).orientation,
    );
    const hash = this.faceSheetHash(characters, width, height);
    const filename = this.faceSheetFilename(hash);
    const canonicalPath = `/images/${filename}`;

    if (await this.fileExists(filename)) {
      return canonicalPath;
    }

    const portraitPaths = ordered.map(
      (character) => character.referenceImagePath!.trim(),
    );

    const imagePath = await this.flux.composeFaceReferenceSheet({
      referenceImagePaths: portraitPaths,
      filenamePrefix: `face-${hash.toString(16)}`,
      canvasWidth: width,
      canvasHeight: height,
    });

    return imagePath;
  }
}
