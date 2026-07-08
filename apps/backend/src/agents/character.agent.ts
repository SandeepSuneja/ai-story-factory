import { Injectable } from "@nestjs/common";
import type { SceneScript, StoryLanguage, StoryCharacter } from "../content-state";
import {
  collectSpeakersFromScript,
  defaultVoiceForCharacter,
  findStoredCharacterByName,
  linkScriptDialogue,
  mergeCharacterLibraries,
  normalizeCharacters,
  resolveCharactersFromLibrary,
} from "../characters";
import { contentLanguageRule } from "../language";
import {
  appendSourceMaterial,
  characterRulesWithSource,
  type SourceFidelityContext,
} from "../source-fidelity";
import { QwenService } from "../services/qwen.service";

export interface CharacterProfileResult {
  characters: StoryCharacter[];
  script: SceneScript[];
  reusedCharacters: string[];
  newCharacters: StoryCharacter[];
}

function stripModelWrappers(text: string): string {
  let cleaned = text.trim();
  cleaned = cleaned.replace(
    /<\s*redacted_thinking\s*>[\s\S]*?<\s*\/\s*redacted_thinking\s*>/gi,
    "",
  );
  cleaned = cleaned.replace(/[\s\S]*?<\/think>/gi, "");
  cleaned = cleaned.replace(/^<\s*think\s*>[\s\S]*?(?=\[|{)/i, "");
  return cleaned.trim();
}

function extractJsonArray(text: string): string {
  const cleaned = stripModelWrappers(text);
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : cleaned;

  const start = candidate.indexOf("[");
  const end = candidate.lastIndexOf("]");
  if (start !== -1 && end !== -1 && end > start) {
    return candidate.slice(start, end + 1);
  }

  if (start !== -1) {
    return candidate.slice(start);
  }

  return candidate;
}

function formatExistingCharactersBlock(characters: StoryCharacter[]): string {
  if (characters.length === 0) {
    return "None yet.";
  }

  return characters
    .map(
      (character) =>
        `- ${character.name} (${character.role}): ${character.appearance}`,
    )
    .join("\n");
}

@Injectable()
export class CharacterAgent {
  constructor(private readonly ai: QwenService) {}

  async executeProfile(
    story: string,
    script: SceneScript[],
    language: StoryLanguage = "en",
    libraryCharacters: StoryCharacter[] = [],
    sourceContext?: SourceFidelityContext,
  ): Promise<CharacterProfileResult> {
    const library = mergeCharacterLibraries([], libraryCharacters);
    const { reused, missingSpeakers } = resolveCharactersFromLibrary(
      script,
      library,
    );
    const speakers = collectSpeakersFromScript(script);

    if (speakers.length > 0 && missingSpeakers.length === 0 && reused.length > 0) {
      return {
        characters: reused,
        script: linkScriptDialogue(script, reused),
        reusedCharacters: reused.map((character) => character.name),
        newCharacters: [],
      };
    }

    if (missingSpeakers.length > 0 && library.length > 0) {
      const generated = await this.generateMissingCharacters(
        story,
        script,
        language,
        library,
        missingSpeakers,
        sourceContext,
      );
      const characters = mergeCharacterLibraries(reused, generated);
      return {
        characters,
        script: linkScriptDialogue(script, characters),
        reusedCharacters: reused.map((character) => character.name),
        newCharacters: generated,
      };
    }

    const generated = await this.generateAllCharacters(
      story,
      script,
      language,
      library,
      speakers,
      sourceContext,
    );
    const characters = mergeCharacterLibraries(reused, generated);

    return {
      characters,
      script: linkScriptDialogue(script, characters),
      reusedCharacters: reused.map((character) => character.name),
      newCharacters: generated.filter(
        (character) =>
          !reused.some(
            (existing) =>
              existing.name.trim().toLowerCase() ===
              character.name.trim().toLowerCase(),
          ),
      ),
    };
  }

  private async generateMissingCharacters(
    story: string,
    script: SceneScript[],
    language: StoryLanguage,
    library: StoryCharacter[],
    missingSpeakers: string[],
    sourceContext?: SourceFidelityContext,
  ): Promise<StoryCharacter[]> {
    const scenesSummary = this.buildScenesSummary(script);
    const sourceRules = sourceContext ? `\n${characterRulesWithSource()}` : "";
    const prompt = appendSourceMaterial(
      `
Read the story and script, then define ONLY the new characters listed below.

Existing series characters (reuse exactly — do NOT redefine):
${formatExistingCharactersBlock(library)}

New characters to define now: ${missingSpeakers.join(", ")}

Requirements:
- Define ONLY the new characters listed above
- Match the display name exactly to the script speaker name
- Each new character needs a stable visual design that fits the existing series cast
- appearance must be written in English for AI image generation
- Match the selected animation style (2D cel-shaded or 3D CGI cartoon) in every appearance description
- Keep each appearance 60-90 words${sourceRules}
${contentLanguageRule()}

Return ONLY valid JSON in this exact shape:
[
  {
    "id": "slug",
    "name": "Display Name",
    "role": "supporting",
    "appearance": "English visual description"
  }
]

Story:
${story}

Script scenes:
${scenesSummary}
`,
      sourceContext,
    );

    return this.requestCharacters(prompt, language, library.length);
  }

  private async generateAllCharacters(
    story: string,
    script: SceneScript[],
    language: StoryLanguage,
    library: StoryCharacter[],
    speakers: string[],
    sourceContext?: SourceFidelityContext,
  ): Promise<StoryCharacter[]> {
    const scenesSummary = this.buildScenesSummary(script);
    const speakerHint =
      speakers.length > 0
        ? `Speaking characters to define: ${speakers.join(", ")}`
        : "Identify every distinct named character from the story and script.";

    const libraryHint =
      library.length > 0
        ? `
Existing series characters already stored by name (reuse these exact designs when the same name appears; define only if missing):
${formatExistingCharactersBlock(library)}`
        : "";

    const sourceRules = sourceContext ? `\n${characterRulesWithSource()}` : "";
    const prompt = appendSourceMaterial(
      `
Read the story and script scenes, then define every distinct character who speaks or appears on screen.

Requirements:
- Define a profile for every distinct character who speaks or appears in the script, regardless of count
- Each character needs a stable visual design that stays identical across every video in the series
- appearance must be written in English for AI image generation (age, gender, ethnicity, face, hair, outfit, accessories)
- Match the selected animation style (2D cel-shaded or 3D CGI cartoon) in every appearance description
- Assign each character a short lowercase id slug and a display name that matches script dialogue speakers
- ${speakerHint}
- Keep each appearance 60-90 words${sourceRules}
${libraryHint}
${contentLanguageRule()}

Return ONLY valid JSON in this exact shape:
[
  {
    "id": "maya",
    "name": "Maya",
    "role": "protagonist",
    "appearance": "English visual description for image generation"
  }
]

Story:
${story}

Script scenes:
${scenesSummary}
`,
      sourceContext,
    );

    const generated = await this.requestCharacters(prompt, language, library.length);

    return generated.map((character) => {
      const existing = findStoredCharacterByName(character.name, library);
      return existing ?? character;
    });
  }

  private buildScenesSummary(script: SceneScript[]): string {
    return script
      .map((scene) => {
        const dialogueText = (scene.dialogue ?? [])
          .map((line) => `${line.speaker ?? line.characterId}: ${line.text}`)
          .join(" | ");
        return `Scene ${scene.sceneNumber}: ${scene.visualDescription}${
          dialogueText ? ` — Dialogue: ${dialogueText}` : ""
        }`;
      })
      .join("\n");
  }

  private async requestCharacters(
    prompt: string,
    language: StoryLanguage,
    voiceOffset: number,
  ): Promise<StoryCharacter[]> {
    const attempts = [
      prompt,
      `${prompt}

Your previous answer was invalid JSON. Reply again with ONLY the JSON array.`,
    ];

    let lastError: Error | null = null;

    for (const attempt of attempts) {
      try {
        const text = await this.ai.generate(attempt);
        const jsonText = extractJsonArray(text);
        const parsed = normalizeCharacters(JSON.parse(jsonText), language);

        return parsed.map((character, index) => ({
          ...character,
          voice:
            character.voice ||
            defaultVoiceForCharacter(language, voiceOffset + index),
        }));
      } catch (error) {
        lastError =
          error instanceof Error
            ? error
            : new Error("Failed to parse character JSON.");
      }
    }

    throw lastError ?? new Error("Failed to generate character profiles.");
  }
}
