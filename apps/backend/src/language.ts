import type { StoryLanguage } from './content-state';

export function normalizeStoryLanguage(_value?: string): StoryLanguage {
  return 'en';
}

/** Idea, story, narration, visual descriptions, character profiles, prompts metadata. */
export function contentLanguageRule(): string {
  return 'Write all content in English: idea, story prose, scene narration, dialogue, visualDescription, character names, roles, and appearance fields.';
}

export function dialogueLanguageRule(_language: StoryLanguage): string {
  return 'Write dialogue.text in English.';
}

export function imagePromptLanguageRule(_language: StoryLanguage): string {
  return 'Write imagePrompt in English.';
}

export function videoPromptLanguageRule(
  _language: StoryLanguage,
  _videoMode: import('./content-state').VideoGenerationMode,
): string {
  return 'Write videoPrompt in English.';
}
