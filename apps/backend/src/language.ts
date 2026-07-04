import type { StoryLanguage, VideoGenerationMode } from './content-state';

export function normalizeStoryLanguage(value?: string): StoryLanguage {
  return value === 'hi' ? 'hi' : 'en';
}

export function languageLabel(language: StoryLanguage): string {
  return language === 'hi' ? 'Hindi dialogue' : 'English';
}

/** Idea, story, narration, visual descriptions, character profiles, prompts metadata. */
export function contentLanguageRule(): string {
  return 'Write all narrative content in English: idea, story prose, scene narration, visualDescription, character names, roles, and appearance fields.';
}

/** Spoken lines only — the one place Hindi is allowed when storyLanguage is hi. */
export function dialogueLanguageRule(language: StoryLanguage): string {
  if (language === 'hi') {
    return 'Write ONLY dialogue.text (character spoken lines) in Hindi using Devanagari script (हिन्दी). Keep narration and visualDescription in English.';
  }

  return 'Write dialogue.text in English.';
}

/** @deprecated Prefer contentLanguageRule() or dialogueLanguageRule() explicitly. */
export function languageOutputRule(language: StoryLanguage): string {
  if (language === 'hi') {
    return `${contentLanguageRule()}\n${dialogueLanguageRule(language)}`;
  }

  return 'Write all output in English.';
}

export function imagePromptLanguageRule(_language: StoryLanguage): string {
  return 'Write imagePrompt in English.';
}

export function videoPromptLanguageRule(
  _language: StoryLanguage,
  _videoMode: VideoGenerationMode,
): string {
  return 'Write videoPrompt in English.';
}
