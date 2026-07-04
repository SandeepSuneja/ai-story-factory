import type { SceneScript, StoryCharacter, StoryLanguage } from '../types/content';

export function defaultVoiceForCharacter(
  language: StoryLanguage,
  index: number,
): string {
  const enVoices = [
    'en-US-AriaNeural',
    'en-US-GuyNeural',
    'en-US-JennyNeural',
    'en-US-DavisNeural',
  ];
  const hiVoices = [
    'hi-IN-SwaraNeural',
    'hi-IN-MadhurNeural',
    'hi-IN-AnanyaNeural',
    'hi-IN-AaravNeural',
  ];
  const pool = language === 'hi' ? hiVoices : enVoices;
  return pool[index % pool.length];
}

export function migrateLegacyCharacterAppearance(
  characterAppearance: string | null | undefined,
  language: StoryLanguage,
): StoryCharacter[] {
  const appearance = characterAppearance?.trim();
  if (!appearance) {
    return [];
  }

  return [
    {
      id: 'main',
      name: 'Main character',
      role: 'protagonist',
      appearance,
      voice: defaultVoiceForCharacter(language, 0),
    },
  ];
}

export function getCharacterName(
  characterId: string,
  characters: StoryCharacter[],
): string {
  return (
    characters.find((character) => character.id === characterId)?.name ??
    characterId
  );
}

export function getSceneDialogue(scene: SceneScript) {
  return scene.dialogue ?? [];
}

export function formatSceneDialogue(scene: SceneScript, characters: StoryCharacter[]): string {
  const dialogue = getSceneDialogue(scene);
  if (dialogue.length === 0) {
    return scene.narration;
  }

  return dialogue
    .map((line) => {
      const name = line.speaker ?? getCharacterName(line.characterId, characters);
      return `${name}: ${line.text}`;
    })
    .join('\n');
}

export function resolveProjectCharacters(
  state: {
    characters?: StoryCharacter[];
    characterAppearance?: string | null;
    storyLanguage?: StoryLanguage;
  },
): StoryCharacter[] {
  if (state.characters && state.characters.length > 0) {
    return state.characters;
  }

  return migrateLegacyCharacterAppearance(
    state.characterAppearance,
    state.storyLanguage ?? 'en',
  );
}
