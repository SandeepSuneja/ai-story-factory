import { Injectable } from "@nestjs/common";
import type { SceneScript, StoryCharacter, StoryLanguage } from "../content-state";
import {
  buildNarrationFromDialogue,
  ensureSceneDialogue,
  findCharacterBySpeaker,
  getSceneDialogue,
} from "../characters";
import { TtsService } from "../services/tts.service";

@Injectable()
export class AudioAgent {
  constructor(private readonly tts: TtsService) {}

  async execute(
    scene: SceneScript,
    characters: StoryCharacter[],
    language: StoryLanguage = "en",
  ): Promise<SceneScript> {
    const preparedScene = ensureSceneDialogue(scene, characters);
    const dialogue = getSceneDialogue(preparedScene);

    if (dialogue.length === 0) {
      const narration = preparedScene.narration?.trim();
      if (!narration) {
        throw new Error(
          `Scene ${preparedScene.sceneNumber} dialogue or narration is required before audio generation`,
        );
      }

      const fallbackCharacter =
        characters[0] ??
        ({
          id: "narrator",
          name: "Narrator",
          role: "narrator",
          appearance: "",
          voice: "",
        } satisfies StoryCharacter);

      const result = await this.tts.generateDialogueAudio(
        [
          {
            text: narration,
            voice: fallbackCharacter.voice,
            speaker: fallbackCharacter.name,
            characterId: fallbackCharacter.id,
          },
        ],
        preparedScene.sceneNumber,
        language,
      );

      return {
        ...preparedScene,
        audioPath: result.audioPath,
        subtitleCues: result.subtitleCues,
        dialogueSegments: result.dialogueSegments,
        narration,
      };
    }

    const lines = dialogue.map((line) => {
      const character =
        characters.find((entry) => entry.id === line.characterId) ||
        findCharacterBySpeaker(line.speaker ?? line.characterId, characters);

      if (!character) {
        throw new Error(
          `Scene ${preparedScene.sceneNumber} dialogue references unknown character "${line.speaker ?? line.characterId}"`,
        );
      }

      return {
        text: line.text,
        voice: character.voice,
        speaker: character.name,
        characterId: character.id,
      };
    });

    const result = await this.tts.generateDialogueAudio(
      lines,
      preparedScene.sceneNumber,
      language,
    );

    return {
      ...preparedScene,
      audioPath: result.audioPath,
      subtitleCues: result.subtitleCues,
      dialogueSegments: result.dialogueSegments,
      narration: buildNarrationFromDialogue(dialogue, characters),
    };
  }
}
