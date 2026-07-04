import type { SceneScript, StoryLanguage } from "./content-state";

export interface StoryCharacter {
  id: string;
  name: string;
  role: string;
  appearance: string;
  voice: string;
}

export interface DialogueLine {
  characterId: string;
  speaker?: string;
  text: string;
}

export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

const EN_EDGE_VOICES = [
  "en-US-AriaNeural",
  "en-US-GuyNeural",
  "en-US-JennyNeural",
  "en-US-DavisNeural",
] as const;

const HI_EDGE_VOICES = [
  "hi-IN-SwaraNeural",
  "hi-IN-MadhurNeural",
  "hi-IN-AnanyaNeural",
  "hi-IN-AaravNeural",
] as const;

const KOKORO_VOICES = ["af_heart", "am_adam", "af_bella", "am_michael"] as const;

export function slugifyCharacterId(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "character";
}

export function defaultVoiceForCharacter(
  language: StoryLanguage,
  index: number,
  backend: "edge" | "kokoro" = "edge",
): string {
  if (language === "hi") {
    return HI_EDGE_VOICES[index % HI_EDGE_VOICES.length];
  }

  if (backend === "kokoro") {
    return KOKORO_VOICES[index % KOKORO_VOICES.length];
  }

  return EN_EDGE_VOICES[index % EN_EDGE_VOICES.length];
}

function normalizeCharacterRecord(
  raw: unknown,
  index: number,
  language: StoryLanguage,
): StoryCharacter {
  if (!raw || typeof raw !== "object") {
    throw new Error(`Character ${index + 1} is invalid.`);
  }

  const value = raw as Record<string, unknown>;
  const name = String(value.name ?? value.id ?? `Character ${index + 1}`).trim();
  const id = slugifyCharacterId(String(value.id ?? name));
  const role = String(value.role ?? "supporting").trim() || "supporting";
  const appearance = String(value.appearance ?? value.description ?? "").trim();
  const voice =
    String(value.voice ?? "").trim() ||
    defaultVoiceForCharacter(language, index);

  if (!name || !appearance) {
    throw new Error(`Character ${index + 1} is missing name or appearance.`);
  }

  return { id, name, role, appearance, voice };
}

export function normalizeCharacters(
  raw: unknown,
  language: StoryLanguage,
): StoryCharacter[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("Character model output is not a JSON array.");
  }

  const characters = raw
    .slice(0, 6)
    .map((entry, index) => normalizeCharacterRecord(entry, index, language));

  const ids = new Set<string>();
  return characters.map((character, index) => {
    let id = character.id || slugifyCharacterId(character.name);
    if (ids.has(id)) {
      id = `${id}-${index + 1}`;
    }
    ids.add(id);
    return { ...character, id };
  });
}

export function findCharacterBySpeaker(
  speaker: string,
  characters: StoryCharacter[],
): StoryCharacter | undefined {
  const normalized = speaker.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  return characters.find(
    (character) =>
      character.id.toLowerCase() === normalized ||
      character.name.trim().toLowerCase() === normalized,
  );
}

export function getCharacterMap(
  characters: StoryCharacter[],
): Map<string, StoryCharacter> {
  const map = new Map<string, StoryCharacter>();
  for (const character of characters) {
    map.set(character.id, character);
    map.set(character.name.trim().toLowerCase(), character);
  }
  return map;
}

export function normalizeDialogueLine(
  raw: unknown,
  characters: StoryCharacter[],
): DialogueLine | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const value = raw as Record<string, unknown>;
  const text = String(value.text ?? "").trim();
  if (!text) {
    return null;
  }

  const explicitId = String(value.characterId ?? "").trim();
  const speaker = String(value.speaker ?? value.character ?? explicitId).trim();
  const matched =
    (explicitId && characters.find((c) => c.id === explicitId)) ||
    findCharacterBySpeaker(speaker, characters);

  if (!matched) {
    return {
      characterId: slugifyCharacterId(speaker || "narrator"),
      speaker: speaker || "Narrator",
      text,
    };
  }

  return {
    characterId: matched.id,
    speaker: matched.name,
    text,
  };
}

export function getSceneDialogue(scene: SceneScript): DialogueLine[] {
  if (!Array.isArray(scene.dialogue)) {
    return [];
  }

  return scene.dialogue
    .map((line) => ({
      characterId: line.characterId,
      speaker: line.speaker,
      text: line.text.trim(),
    }))
    .filter((line) => line.text.length > 0);
}

export function linkScriptDialogue(
  script: SceneScript[],
  characters: StoryCharacter[],
): SceneScript[] {
  return script.map((scene) => linkSceneDialogue(scene, characters));
}

export function linkSceneDialogue(
  scene: SceneScript,
  characters: StoryCharacter[],
): SceneScript {
  const dialogue = (scene.dialogue ?? [])
    .map((line) => normalizeDialogueLine(line, characters))
    .filter((line): line is DialogueLine => line !== null);

  const linkedDialogue = dialogue.map((line) => {
    const matched = findCharacterBySpeaker(
      line.speaker ?? line.characterId,
      characters,
    );
    if (!matched) {
      return line;
    }
    return {
      characterId: matched.id,
      speaker: matched.name,
      text: line.text,
    };
  });

  const presentCharacterIds = collectPresentCharacterIds(scene, linkedDialogue, characters);
  const narration =
    scene.narration?.trim() ||
    buildNarrationFromDialogue(linkedDialogue, characters);

  return {
    ...scene,
    dialogue: linkedDialogue,
    presentCharacterIds,
    narration,
  };
}

export function collectPresentCharacterIds(
  scene: SceneScript,
  dialogue: DialogueLine[],
  characters: StoryCharacter[],
): string[] {
  const ids = new Set<string>();

  for (const line of dialogue) {
    if (line.characterId) {
      ids.add(line.characterId);
    }
  }

  if (Array.isArray(scene.presentCharacterIds)) {
    for (const id of scene.presentCharacterIds) {
      if (id.trim()) {
        ids.add(id.trim());
      }
    }
  }

  const visual = scene.visualDescription.toLowerCase();
  for (const character of characters) {
    if (visual.includes(character.name.trim().toLowerCase())) {
      ids.add(character.id);
    }
  }

  return [...ids];
}

export function buildNarrationFromDialogue(
  dialogue: DialogueLine[],
  characters: StoryCharacter[],
): string {
  if (dialogue.length === 0) {
    return "";
  }

  const map = getCharacterMap(characters);
  return dialogue
    .map((line) => {
      const character =
        map.get(line.characterId) ||
        (line.speaker ? map.get(line.speaker.trim().toLowerCase()) : undefined);
      const label = character?.name ?? line.speaker ?? line.characterId;
      return `${label}: ${line.text}`;
    })
    .join("\n");
}

export function getCharactersForScene(
  scene: SceneScript,
  characters: StoryCharacter[],
): StoryCharacter[] {
  const presentIds = collectPresentCharacterIds(
    scene,
    getSceneDialogue(scene),
    characters,
  );

  if (presentIds.length === 0) {
    return characters.slice(0, Math.min(2, characters.length));
  }

  const selected = presentIds
    .map((id) => characters.find((character) => character.id === id))
    .filter((character): character is StoryCharacter => Boolean(character));

  return selected.length > 0 ? selected : characters;
}

export function compressCharacterAppearance(appearance: string): string {
  const trimmed = appearance.trim();
  const firstSentence = trimmed.split(/[.!?]/)[0]?.trim() ?? trimmed;
  const words = firstSentence.split(/\s+/).filter(Boolean);
  if (words.length <= 14) {
    return firstSentence;
  }
  return words.slice(0, 14).join(" ").replace(/[,;:\-–—]+$/, "").trim();
}

export function formatCharactersForPrompt(
  characters: StoryCharacter[],
): string {
  return characters
    .map(
      (character) =>
        `${character.name} (${character.role}): ${compressCharacterAppearance(character.appearance)}`,
    )
    .join("\n");
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
      id: "main",
      name: "Main character",
      role: "protagonist",
      appearance,
      voice: defaultVoiceForCharacter(language, 0),
    },
  ];
}

export function collectSpeakersFromScript(script: SceneScript[]): string[] {
  const speakers = new Set<string>();

  for (const scene of script) {
    for (const line of scene.dialogue ?? []) {
      const speaker = line.speaker?.trim() || line.characterId?.trim();
      if (speaker) {
        speakers.add(speaker);
      }
    }
  }

  return [...speakers];
}

export function findStoredCharacterByName(
  name: string,
  library: StoryCharacter[],
): StoryCharacter | undefined {
  const normalized = name.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  return library.find(
    (character) =>
      character.name.trim().toLowerCase() === normalized ||
      character.id === slugifyCharacterId(name),
  );
}

export function mergeCharacterLibraries(
  existing: StoryCharacter[],
  incoming: StoryCharacter[],
): StoryCharacter[] {
  const byName = new Map<string, StoryCharacter>();

  for (const character of existing) {
    byName.set(character.name.trim().toLowerCase(), character);
  }

  for (const character of incoming) {
    byName.set(character.name.trim().toLowerCase(), character);
  }

  return [...byName.values()];
}

export function resolveCharactersFromLibrary(
  script: SceneScript[],
  library: StoryCharacter[],
): {
  reused: StoryCharacter[];
  missingSpeakers: string[];
} {
  const speakers = collectSpeakersFromScript(script);
  const reused: StoryCharacter[] = [];
  const missingSpeakers: string[] = [];
  const seen = new Set<string>();

  for (const speaker of speakers) {
    const key = speaker.trim().toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    const match = findStoredCharacterByName(speaker, library);
    if (match) {
      reused.push(match);
    } else {
      missingSpeakers.push(speaker);
    }
  }

  return { reused, missingSpeakers };
}

export function formatVisualStyleForPrompt(
  visualStyle?: {
    orientation?: string;
    animationStyle?: string;
    framing?: string;
    colorPalette?: string;
    artDirection?: string;
  },
): string {
  if (!visualStyle) {
    return "";
  }

  const animationHint =
    visualStyle.animationStyle === "3d"
      ? "Style: 3D animated CGI, stylized cartoon rendering, not live-action photorealistic"
      : visualStyle.animationStyle === "2d"
        ? "Style: 2D animated illustration, cel-shaded, expressive line art, not live-action photorealistic"
        : "";

  const parts = [
    visualStyle.orientation
      ? `Orientation: ${visualStyle.orientation === "portrait" ? "vertical 9:16 portrait" : "horizontal 16:9 landscape"}`
      : "",
    animationHint,
    visualStyle.framing ? `Framing: ${visualStyle.framing}` : "",
    visualStyle.colorPalette ? `Palette: ${visualStyle.colorPalette}` : "",
    visualStyle.artDirection ? `Art direction: ${visualStyle.artDirection}` : "",
  ].filter(Boolean);

  return parts.join("\n");
}

export function inferDialogueFromNarration(narration: string): DialogueLine[] {
  const lines = narration
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const dialogue: DialogueLine[] = [];

  for (const line of lines) {
    const match = line.match(/^([^:]{1,40}):\s*(.+)$/);
    if (match) {
      const speaker = match[1].trim();
      dialogue.push({
        characterId: slugifyCharacterId(speaker),
        speaker,
        text: match[2].trim(),
      });
      continue;
    }

    if (dialogue.length === 0 && line) {
      dialogue.push({
        characterId: "narrator",
        speaker: "Narrator",
        text: line,
      });
    }
  }

  return dialogue;
}

export function ensureSceneDialogue(
  scene: SceneScript,
  characters: StoryCharacter[] = [],
): SceneScript {
  const existing = getSceneDialogue(scene);
  if (existing.length > 0) {
    return scene;
  }

  const inferred = inferDialogueFromNarration(scene.narration?.trim() ?? "");
  if (inferred.length === 0) {
    return scene;
  }

  return linkSceneDialogue(
    {
      ...scene,
      dialogue: inferred,
    },
    characters,
  );
}

export function getSpeakingCharacters(scene: SceneScript): string[] {
  const names = new Set<string>();
  for (const line of getSceneDialogue(scene)) {
    const label = line.speaker ?? line.characterId;
    if (label.trim()) {
      names.add(label.trim());
    }
  }
  return [...names];
}

export function buildSpeakingMotionHint(scene: SceneScript): string {
  const speakers = getSpeakingCharacters(scene);
  if (speakers.length === 0) {
    return "";
  }

  if (speakers.length === 1) {
    return `${speakers[0]} speaks with subtle lip movement, natural jaw motion, and small conversational gestures.`;
  }

  return `${speakers.join(" and ")} converse with subtle lip movement, natural expressions, and gentle head turns while speaking.`;
}

export function buildTalkingImageHint(scene: SceneScript): string {
  const speakers = getSpeakingCharacters(scene);
  if (speakers.length === 0) {
    return "";
  }

  if (speakers.length === 1) {
    return `${speakers[0]} mid-conversation, mouth slightly open, engaged expression.`;
  }

  return `${speakers.join(" and ")} in conversation, natural speaking expressions.`;
}
