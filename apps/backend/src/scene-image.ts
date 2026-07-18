import type { SceneScript, SeriesVisualStyle, StoryCharacter } from "./content-state";
import { getSpeakingCharacters } from "./characters";
import { mergeVisualStyle } from "./visual-style";

export type SceneImageTemplate =
  | "dialogue_two_shot"
  | "meditation_dialogue"
  | "listener_focus"
  | "reverence"
  | "quiet_meditation";

/** Episode blocking setups from the Ramayana revision plan. */
export type EpisodeSceneSetup =
  | "two_shot_dialogue"
  | "narada_hero"
  | "valmiki_reaction"
  | "wide_outro";

export function classifyEpisodeSceneSetup(scene: SceneScript): EpisodeSceneSetup {
  const visual = scene.visualDescription.toLowerCase();
  const hasDialogue =
    Array.isArray(scene.dialogue) && scene.dialogue.length > 0;

  if (
    !hasDialogue &&
    /meditat|quiet|golden light fades|wide shot both/i.test(visual)
  ) {
    return "wide_outro";
  }

  if (/\bbow|bows deeply\b/i.test(visual)) {
    return "valmiki_reaction";
  }

  if (
    /\bmedium-close|rim light|luminous wise eyes|soft-focus left|narada medium/i.test(
      visual,
    )
  ) {
    return "narada_hero";
  }

  return "two_shot_dialogue";
}

export function buildUnifiedForestAnchor(): string {
  return "single unified forest clearing at dawn, one continuous background, no split panel";
}

export function classifySceneImageTemplate(scene: SceneScript): SceneImageTemplate {
  const visual = scene.visualDescription.toLowerCase();
  const speakers = getSpeakingCharacters(scene);

  if (speakers.length === 0) {
    return /meditat|quiet|still|contemplation/i.test(visual)
      ? "quiet_meditation"
      : "dialogue_two_shot";
  }

  if (/\bbow|reverence|gratitude|bows deeply\b/i.test(visual)) {
    return "reverence";
  }

  if (
    /\b(meditat|eyes closed|deep contemplation|fully absorbed)\b/i.test(visual)
  ) {
    return "meditation_dialogue";
  }

  if (
    /\b(listen|listening|intent|absorbed)\b/i.test(visual) &&
    speakers.length === 1
  ) {
    return "listener_focus";
  }

  return "dialogue_two_shot";
}

export function buildSceneCompositionHint(
  scene: SceneScript,
  sceneCharacters: StoryCharacter[],
  visualStyle?: SeriesVisualStyle,
): string {
  const template = classifySceneImageTemplate(scene);
  const speakers = getSpeakingCharacters(scene);
  const names = sceneCharacters.map((character) => character.name);
  const framing =
    mergeVisualStyle(visualStyle).framing.split(/[,.]/)[0]?.trim() ??
    "Eye-level cinematic framing";

  switch (template) {
    case "quiet_meditation":
      return `${framing}. Both characters seated in quiet meditation, serene forest atmosphere.`;
    case "reverence":
      return `${framing}. One character bowing with deep reverence, the other standing calm and radiant.`;
    case "meditation_dialogue":
      if (speakers.length === 1) {
        return `${framing}. ${speakers[0]} speaking while ${names.filter((name) => name !== speakers[0]).join(" and ") || "companion"} listens, forest clearing with banyan tree.`;
      }
      return `${framing}. Seated sage and standing celestial sage, sacred forest clearing.`;
    case "listener_focus":
      return `${framing}. ${speakers[0]} speaking expressively, other character listening attentively, both fully visible.`;
    case "dialogue_two_shot":
    default:
      return `${framing}. Two-shot composition, ${names.join(" and ")} both fully visible in sacred forest setting.`;
  }
}

export function buildContextualTalkingImageHint(scene: SceneScript): string {
  const speakers = getSpeakingCharacters(scene);
  if (speakers.length === 0) {
    return "";
  }

  const visual = scene.visualDescription.toLowerCase();

  if (/\bbow|reverence|bows deeply\b/i.test(visual)) {
    return speakers.length === 1
      ? `${speakers[0]} speaking reverently with head bowed, eyes downcast.`
      : `${speakers.join(" and ")} in reverent conversation.`;
  }

  if (/\b(meditat|eyes closed|deep contemplation|fully absorbed)\b/i.test(visual)) {
    return speakers.length === 1
      ? `${speakers[0]} speaks softly with eyes closed, serene meditative expression, lips slightly parted.`
      : `${speakers.join(" and ")} converse with calm meditative expressions.`;
  }

  if (/\b(listen|listening|intent)\b/i.test(visual) && speakers.length === 1) {
    return `${speakers[0]} speaking with engaged expression, mouth slightly open, listener attentive.`;
  }

  if (speakers.length === 1) {
    return `${speakers[0]} mid-conversation, mouth slightly open, engaged expression.`;
  }

  return `${speakers.join(" and ")} in conversation, natural speaking expressions.`;
}

/** Short composition phrase for Tier A scene prompts (~5–12 words). */
export function buildCompactSceneCompositionHint(
  scene: SceneScript,
  sceneCharacters: StoryCharacter[],
): string {
  const setup = classifyEpisodeSceneSetup(scene);
  const names = sceneCharacters.map((character) => character.name);
  const valmiki = names.find((name) => /valmiki/i.test(name)) ?? names[0];
  const narada =
    names.find((name) => /narada/i.test(name)) ??
    names.find((name) => name !== valmiki) ??
    names[1];

  switch (setup) {
    case "wide_outro":
      return names.length >= 2
        ? `wide shot, ${valmiki} and ${narada} seated under banyan, light fading`
        : "wide meditation outro, forest clearing";
    case "valmiki_reaction":
      return names.length >= 2
        ? `${valmiki} bowing left foreground, ${narada} upper right, unified forest`
        : "reverence bow, sacred banyan tree";
    case "narada_hero":
      return names.length >= 2
        ? `${narada} medium-close right, ${valmiki} soft-focus left under banyan`
        : "celestial sage hero shot, forest background";
    case "two_shot_dialogue":
    default:
      return names.length >= 2
        ? `${valmiki} seated left on stone, ${narada} standing right with staff`
        : "two-shot dialogue, forest clearing";
  }
}
