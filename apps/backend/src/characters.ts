import type {
  DialogueLine,
  SceneScript,
  StoryCharacter,
  StoryLanguage,
} from "./content-state";

export type { DialogueLine, StoryCharacter };

const EN_EDGE_VOICES = [
  "en-US-AriaNeural",
  "en-US-GuyNeural",
  "en-US-JennyNeural",
  "en-US-DavisNeural",
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
  _language: StoryLanguage,
  index: number,
  backend: "edge" | "kokoro" = "edge",
): string {
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

  const referenceImagePath = String(value.referenceImagePath ?? "").trim() || undefined;
  const portraitPrompt = String(value.portraitPrompt ?? "").trim() || undefined;
  const visualIdentityTag =
    String(value.visualIdentityTag ?? "").trim() || undefined;
  const loraPath = String(value.loraPath ?? "").trim() || undefined;

  return {
    id,
    name,
    role,
    appearance,
    voice,
    referenceImagePath,
    portraitPrompt,
    visualIdentityTag,
    loraPath,
  };
}

export function normalizeCharacters(
  raw: unknown,
  language: StoryLanguage,
): StoryCharacter[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("Character model output is not a JSON array.");
  }

  const characters = raw.map((entry, index) =>
    normalizeCharacterRecord(entry, index, language),
  );

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
  const narration = scene.narration?.toLowerCase() ?? "";
  for (const character of characters) {
    const name = character.name.trim().toLowerCase();
    if (!name) {
      continue;
    }
    if (visual.includes(name) || narration.includes(name)) {
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
    return characters;
  }

  const selected = presentIds
    .map((id) => characters.find((character) => character.id === id))
    .filter((character): character is StoryCharacter => Boolean(character));

  return selected.length > 0 ? selected : characters;
}

/** Pick one portrait for IP-Adapter: prefer the speaking character, else first present. */
export function getPrimarySceneReferenceCharacter(
  scene: SceneScript,
  characters: StoryCharacter[],
): StoryCharacter | null {
  const sceneCharacters = getCharactersForScene(scene, characters);
  if (sceneCharacters.length === 0) {
    return null;
  }

  const speakingIds = new Set(
    getSceneDialogue(scene)
      .map((line) => line.characterId)
      .filter(Boolean),
  );

  return (
    sceneCharacters.find((character) => speakingIds.has(character.id)) ??
    sceneCharacters[0]
  );
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

const PORTRAIT_STYLE_PREFIX =
  /^\s*(?:2[dD]\s+cel-shaded|3[dD]\s+(?:animated|cgi))\s*[;:,]?\s*/i;

const PORTRAIT_VISUAL_PATTERN =
  /\b(long|flowing|white|silver|beard|bearded|clean-shaven|shaved|shikha|topknot|robes|robe|crown|flowers|hair|saffron|brown|golden|celestial|ethereal|radiant|armor|staff|headpiece|skin|eyes|bun|braided|adorned|garment|draped|tilak|bindi|young|youthful|elderly|aged|neatly|dark|black|blonde|blue|indigo|mustache|moustache|ornate|patterns)\b/i;

function stripPortraitStyleSuffix(appearance: string): string {
  return appearance.replace(PORTRAIT_STYLE_PREFIX, "").trim();
}

function simplifyPortraitClause(sentence: string): string {
  return sentence
    .replace(/^He\s+(wears|has|carries)\s+/i, "")
    .replace(/^His\s+/i, "")
    .replace(/^She\s+(wears|has|carries)\s+/i, "")
    .replace(/^Her\s+/i, "")
    .replace(/\.$/, "")
    .trim();
}

/** Pull clothing, hair, and other visual traits from the full appearance text. */
export function buildPortraitAppearanceSummary(
  appearance: string,
  maxWords = 36,
): string {
  const cleaned = stripPortraitStyleSuffix(appearance);
  const sentences = cleaned.split(/(?<=[.!?])\s+/).filter(Boolean);

  if (sentences.length === 0) {
    return cleaned;
  }

  const ranked = sentences
    .map((sentence, index) => {
      const hasVisualDetail = PORTRAIT_VISUAL_PATTERN.test(sentence);
      const mentionsAttire = /\b(wears|wearing|adorned|draped|robed)\b/i.test(
        sentence,
      );
      let score = 0;
      if (hasVisualDetail) {
        score += 10;
      }
      if (mentionsAttire) {
        score += 6;
      }
      if (/\b(hands|posture|gestures|listening|meditation)\b/i.test(sentence)) {
        score -= 8;
      }
      if (index === 0 && !hasVisualDetail) {
        score -= 4;
      }
      return { sentence, index, score };
    })
    .sort((left, right) => right.score - left.score || left.index - right.index);

  const parts: string[] = [];
  let wordCount = 0;

  for (const { sentence, score } of ranked) {
    if (wordCount >= maxWords) {
      break;
    }
    if (parts.length > 0 && score <= 0) {
      continue;
    }

    const clause = simplifyPortraitClause(sentence);
    if (!clause) {
      continue;
    }

    const words = clause.split(/\s+/).filter(Boolean);
    const remaining = maxWords - wordCount;
    if (words.length <= remaining) {
      parts.push(clause);
      wordCount += words.length;
    } else {
      parts.push(words.slice(0, remaining).join(" "));
      wordCount = maxWords;
    }
  }

  if (parts.length > 0) {
    return parts.join(", ");
  }

  return compressCharacterAppearance(cleaned);
}

const APPEARANCE_STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "with",
  "and",
  "his",
  "her",
  "their",
  "who",
  "that",
  "this",
  "figure",
  "character",
  "wears",
  "wearing",
  "has",
  "have",
  "shows",
  "showing",
  "simple",
  "soft",
  "calm",
  "peaceful",
  "expressive",
  "clean",
  "cohesive",
  "2d",
  "3d",
  "cel-shaded",
  "cel",
  "shaded",
  "cgi",
  "cartoon",
  "animated",
  "illustration",
]);

const APPEARANCE_PRIORITY = new Set([
  "elderly",
  "young",
  "aged",
  "celestial",
  "ethereal",
  "radiant",
  "golden",
  "white",
  "black",
  "brown",
  "blonde",
  "blue",
  "indigo",
  "saffron",
  "beard",
  "bearded",
  "bald",
  "long",
  "short",
  "flowing",
  "robes",
  "armor",
  "outfit",
  "skin",
  "eyes",
  "hair",
  "staff",
  "crown",
  "sage",
  "prince",
  "princess",
  "warrior",
]);

export function buildDistinctiveAppearanceTag(
  appearance: string,
  maxWords = 8,
): string {
  const compressed = compressCharacterAppearance(appearance);
  const tokens = compressed
    .replace(/[,;]/g, " ")
    .split(/\s+/)
    .map((token) => token.replace(/^[^a-z0-9-]+|[^a-z0-9-]+$/gi, ""))
    .filter(Boolean);

  const ranked = tokens
    .map((token, index) => {
      const lower = token.toLowerCase();
      let score = 0;
      if (APPEARANCE_PRIORITY.has(lower)) {
        score += 4;
      }
      if (/^\d/.test(token)) {
        score -= 2;
      }
      if (token.length >= 5) {
        score += 1;
      }
      if (APPEARANCE_STOPWORDS.has(lower)) {
        score -= 5;
      }
      return { token, index, score };
    })
    .sort((left, right) => right.score - left.score || left.index - right.index);

  const selected: string[] = [];
  const seen = new Set<string>();

  for (const entry of ranked) {
    const key = entry.token.toLowerCase();
    if (seen.has(key) || APPEARANCE_STOPWORDS.has(key)) {
      continue;
    }
    seen.add(key);
    selected.push(entry.token);
    if (selected.length >= maxWords) {
      break;
    }
  }

  if (selected.length === 0) {
    return tokens.slice(0, maxWords).join(" ");
  }

  return selected.join(" ");
}

export function truncateToWordCount(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) {
    return text.trim();
  }
  return words
    .slice(0, maxWords)
    .join(" ")
    .replace(/[,;:\-–—]+$/, "")
    .trim();
}

/** Compact visual traits for scene prompts (not the first-sentence style prefix). */
export function buildSceneAppearanceTag(
  appearance: string,
  maxWords = 8,
): string {
  const summary = buildPortraitAppearanceSummary(appearance, 32)
    .replace(/\b2[dD]\s+cel-shaded\b/gi, "")
    .replace(/\b3[dD]\s+(animated|cgi)\b/gi, "")
    .trim();

  if (!summary) {
    return buildDistinctiveAppearanceTag(appearance, maxWords);
  }

  return truncateToWordCount(summary, maxWords);
}

/** Structured identity traits for scene prompts — hair, age, robes, and divine markers. */
export function buildSceneCharacterIdentityTag(
  appearance: string,
  maxWords = 12,
): string {
  const cleaned = stripPortraitStyleSuffix(appearance);
  const lower = cleaned.toLowerCase();
  const traits: string[] = [];

  if (/\b(elderly|aged)\b/.test(lower)) {
    traits.push("elderly");
  }
  if (/\b(young|youthful|young-looking)\b/.test(lower)) {
    traits.push("young");
  }
  if (/\b(long|flowing)\b[^.]{0,40}\b(hair|locks)\b/.test(lower)) {
    traits.push("long flowing hair");
  } else if (/\b(shaved|shaven|tonsured|shikha|topknot)\b/.test(lower)) {
    traits.push("shaved head with topknot");
  }
  if (/\b(long|thick|full|white)\b[^.]{0,30}\b(beard|mustache)\b/.test(lower)) {
    traits.push("long white beard");
  } else if (
    /\b(clean-shaven|no beard)\b/.test(lower) ||
    (/\b(young|youthful)\b/.test(lower) && !/\bbeard\b/.test(lower))
  ) {
    traits.push("clean-shaven");
  }
  const robeMatch =
    cleaned.match(/\brobes?\s+in\s+([^.;]+)/i) ??
    cleaned.match(
      /\b(deep blue and gold|earthy tones|saffron|orange|blue and gold)[^.;]*/i,
    );
  if (robeMatch) {
    const robeText = (robeMatch[1]?.trim() ?? robeMatch[0].trim())
      .split(/,\s*/)[0]
      .trim();
    traits.push(truncateToWordCount(robeText, 5));
  }
  if (/\b(glowing|radiant|celestial|ethereal|divine)\b/.test(lower)) {
    traits.push("radiant divine aura");
  }
  if (/\b(golden|soft golden|glowing)\b[^.]{0,40}\beyes?\b/.test(lower) ||
    /\beyes?\b[^.]{0,40}\b(golden|glow)\b/.test(lower)) {
    traits.push("golden glowing eyes");
  }
  if (/\b(weathered)\b/.test(lower)) {
    traits.push("weathered skin");
  }

  if (traits.length >= 3) {
    return traits.slice(0, maxWords).join(", ");
  }

  return buildSceneAppearanceTag(appearance, maxWords);
}

/** Scene prompts prefer the locked tag from the approved portrait. */
export function buildSceneCharacterTagForPrompt(
  character: StoryCharacter,
  maxWords = 8,
): string {
  const locked = character.visualIdentityTag?.trim();
  if (locked) {
    return truncateToWordCount(locked, maxWords);
  }
  return buildSceneCharacterIdentityTag(character.appearance, maxWords);
}

export function buildSceneImageGuardrails(): string {
  return "no glasses, no spectacles, no eyeglasses, no modern accessories, ancient Indian Vedic forest";
}

export function buildReferencePortraitLockHint(
  scene: SceneScript,
  characters: StoryCharacter[],
): string {
  const primary = getPrimarySceneReferenceCharacter(scene, characters);
  if (!primary) {
    return "";
  }
  return `${primary.name} must match approved reference portrait exactly`;
}

export function deterministicSeed(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 2_147_483_646 || 1;
}

export function characterPortraitSeed(characterId: string): number {
  return deterministicSeed(`portrait:${characterId}`);
}

export function sceneImageSeed(sceneNumber: number, characterIds: string[]): number {
  return deterministicSeed(
    `scene:${sceneNumber}:${characterIds.slice().sort().join(",")}`,
  );
}

export function buildCharacterPortraitPrompt(
  character: StoryCharacter,
  animationSuffix: string,
): string {
  const traits =
    character.visualIdentityTag?.trim() ||
    buildSceneCharacterIdentityTag(character.appearance, 12);
  return [
    `${character.name}, ${character.role}`,
    traits,
    "character portrait, 3/4 view, plain cream background",
    "soft 2D Indian mythological illustration, same line weight as series character bible",
    animationSuffix,
  ]
    .filter(Boolean)
    .join(", ");
}

export function buildCharacterFullBodyPrompt(
  character: StoryCharacter,
  animationSuffix: string,
): string {
  // Do not inject appearance text — it often contradicts the approved portrait
  // (e.g. profile says "long beard" while the portrait is clean-shaven).
  // The portrait reference image is the source of truth for identity.
  return [
    `${character.name}`,
    "full body character reference",
    "extend the reference portrait into a full standing figure",
    "identical face skin tone hairstyle and outfit colors as reference portrait",
    "do not change facial features or hair from the reference",
    "head to toe visible",
    "standing neutral pose",
    "front facing",
    "feet visible",
    "plain soft background",
    animationSuffix,
  ]
    .filter(Boolean)
    .join(", ");
}

export function characterFullBodySeed(characterId: string): number {
  return deterministicSeed(`fullbody:${characterId}`);
}

export function buildCastSheetPrompt(
  characters: StoryCharacter[],
  animationSuffix: string,
): string {
  const lineup = characters
    .map(
      (character) =>
        `${character.name} full body: ${buildSceneAppearanceTag(character.appearance, 12)}`,
    )
    .join("; ");

  return [
    "Character reference sheet",
    "full body lineup",
    "characters side by side",
    "neutral standing pose",
    "same art style and scale",
    "plain soft background",
    lineup,
    animationSuffix,
  ]
    .filter(Boolean)
    .join(", ");
}

export function castSheetSeed(characterIds: string[]): number {
  return deterministicSeed(`cast:${characterIds.slice().sort().join(",")}`);
}

export type SceneReferenceKind =
  | "cast_sheet"
  | "face_sheet"
  | "portrait"
  | "portrait_extension"
  | "master_scene"
  | "none";

export function resolveSceneReferenceImages(
  scene: SceneScript,
  characters: StoryCharacter[],
  castReferenceImagePath?: string,
): { paths: string[]; referenceKind: SceneReferenceKind } {
  const mode = (process.env.FLUX_SCENE_REFERENCE_MODE ?? "cast_sheet").trim();
  const sceneCharacters = getCharactersForScene(scene, characters);

  if (mode === "off") {
    return { paths: [], referenceKind: "none" };
  }

  const castPath = castReferenceImagePath?.trim();
  if (
    mode === "cast_sheet" &&
    castPath &&
    sceneCharacters.length >= 2
  ) {
    return { paths: [castPath], referenceKind: "cast_sheet" };
  }

  const primary = getPrimarySceneReferenceCharacter(scene, characters);
  if (primary?.referenceImagePath?.trim()) {
    return {
      paths: [primary.referenceImagePath],
      referenceKind: "portrait",
    };
  }

  return { paths: [], referenceKind: "none" };
}

export function formatCharactersForPrompt(
  characters: StoryCharacter[],
): string {
  if (characters.length === 0) {
    return "No characters assigned to this scene.";
  }

  return characters
    .map(
      (character) =>
        `${character.name} (${character.role}): ${buildSceneCharacterTagForPrompt(character, 14)}`,
    )
    .join("\n");
}

export function buildCompactCharacterTags(characters: StoryCharacter[]): string {
  return characters
    .map(
      (character) =>
        `${character.name}: ${buildSceneCharacterTagForPrompt(character, 12)}`,
    )
    .join("; ");
}

export function characterNamesMissingFromPrompt(
  prompt: string,
  characters: StoryCharacter[],
): StoryCharacter[] {
  const lowered = prompt.toLowerCase();
  return characters.filter(
    (character) => !lowered.includes(character.name.trim().toLowerCase()),
  );
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
    const key = character.name.trim().toLowerCase();
    const previous = byName.get(key);
    if (previous?.referenceImagePath && !character.referenceImagePath) {
      byName.set(key, {
        ...character,
        referenceImagePath: previous.referenceImagePath,
        portraitPrompt: character.portraitPrompt ?? previous.portraitPrompt,
        visualIdentityTag:
          character.visualIdentityTag ?? previous.visualIdentityTag,
        loraPath: character.loraPath ?? previous.loraPath,
      });
      continue;
    }
    if (previous?.visualIdentityTag && !character.visualIdentityTag) {
      byName.set(key, {
        ...character,
        portraitPrompt: character.portraitPrompt ?? previous.portraitPrompt,
        visualIdentityTag: previous.visualIdentityTag,
        loraPath: character.loraPath ?? previous.loraPath,
      });
      continue;
    }
    if (previous?.loraPath && !character.loraPath) {
      byName.set(key, {
        ...character,
        portraitPrompt: character.portraitPrompt ?? previous.portraitPrompt,
        loraPath: previous.loraPath,
      });
      continue;
    }
    byName.set(key, {
      ...character,
      portraitPrompt: character.portraitPrompt ?? previous?.portraitPrompt,
    });
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

  const artDirection = visualStyle.artDirection?.trim() ?? "";
  const artDirectionLooksPhotoreal =
    /\b(photoreal|photo-real|live.action|photograph)\b/i.test(artDirection);
  const artDirectionLine =
    visualStyle.animationStyle === "2d" && artDirectionLooksPhotoreal
      ? ""
      : artDirection
        ? `Art direction: ${artDirection}`
        : "";

  const parts = [
    visualStyle.orientation
      ? `Orientation: ${visualStyle.orientation === "portrait" ? "vertical 9:16 portrait" : "horizontal 16:9 landscape"}`
      : "",
    animationHint,
    visualStyle.framing ? `Framing: ${visualStyle.framing}` : "",
    visualStyle.colorPalette ? `Palette: ${visualStyle.colorPalette}` : "",
    artDirectionLine,
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
