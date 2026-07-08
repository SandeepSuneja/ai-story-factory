import type { SceneScript, SeriesVisualStyle, StoryCharacter } from "./content-state";
import { getSpeakingCharacters } from "./characters";
import { mergeVisualStyle } from "./visual-style";

export type SceneImageTemplate =
  | "dialogue_two_shot"
  | "meditation_dialogue"
  | "listener_focus"
  | "reverence"
  | "quiet_meditation";

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
