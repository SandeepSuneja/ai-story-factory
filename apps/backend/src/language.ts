import type { StoryLanguage, VideoGenerationMode } from './content-state';

export function normalizeStoryLanguage(value?: string): StoryLanguage {
  return value === 'hi' ? 'hi' : 'en';
}

export function languageLabel(language: StoryLanguage): string {
  return language === 'hi' ? 'Hindi' : 'English';
}

export function languageOutputRule(language: StoryLanguage): string {
  if (language === 'hi') {
    return 'Write ALL output in Hindi using Devanagari script (हिन्दी). Do not use English except unavoidable proper nouns or brand names.';
  }

  return 'Write all output in English.';
}

export function imagePromptLanguageRule(language: StoryLanguage): string {
  if (language === 'hi') {
    return 'Write imagePrompt in English (required for the image model) but accurately depict the Hindi scene, characters, and setting. Translate character appearance traits to concise English tags in imagePrompt only.';
  }

  return 'Write imagePrompt in English.';
}

export function videoPromptLanguageRule(
  language: StoryLanguage,
  _videoMode: VideoGenerationMode,
): string {
  if (language === 'hi') {
    return 'Write videoPrompt in English (required for video models). Motion should match the Hindi scene described in narration and visualDescription.';
  }

  return 'Write videoPrompt in English.';
}
