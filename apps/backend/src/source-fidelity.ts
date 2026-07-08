export interface RetrievedChunk {
  id: string;
  text: string;
  score: number;
  documentTitle?: string;
  metadata?: Record<string, unknown>;
}

export interface SourceFidelityContext {
  sourceId: string;
  sourceName: string;
  query: string;
  chunks: RetrievedChunk[];
}

export function sourceFidelityRules(): string {
  return `SOURCE FIDELITY RULES (mandatory when source material is provided):
- The SOURCE MATERIAL excerpts below are authoritative canon. Follow them exactly.
- Do NOT invent new plot points, characters, places, miracles, or dialogue absent from the source.
- Do NOT modernize, remix, parody, or substitute alternate versions (e.g. keep Ramayana events as written, not random fantasy).
- You may shorten, select scenes, and restructure for short video — but never alter core facts, names, or outcomes.
- When unsure, quote or closely paraphrase the source instead of guessing.
- If the source does not mention something, omit it rather than making it up.`;
}

export function formatSourceMaterialBlock(context: SourceFidelityContext): string {
  if (context.chunks.length === 0) {
    return '';
  }

  const excerpts = context.chunks
    .map((chunk, index) => {
      const label = chunk.documentTitle?.trim() || `Excerpt ${index + 1}`;
      return `[${label}]\n${chunk.text.trim()}`;
    })
    .join('\n\n');

  return `${sourceFidelityRules()}

SOURCE: ${context.sourceName}
RETRIEVED EXCERPTS:
${excerpts}`;
}

export function appendSourceMaterial(
  prompt: string,
  context?: SourceFidelityContext,
): string {
  const block = context ? formatSourceMaterialBlock(context) : '';
  if (!block.trim()) {
    return prompt;
  }
  return `${prompt.trim()}

${block}`;
}

export function ideaInstructionsWithSource(): string {
  return `Generate one short-video story concept that adapts the SOURCE MATERIAL.
- Pick a specific episode or arc from the source that fits the topic/focus.
- The concept must stay faithful to the source — no invented twists or modern substitutions.
- Return only the idea.`;
}

export function storyRequirementsWithSource(): string {
  return `Requirements:
- Adapt ONLY events present in the SOURCE MATERIAL excerpts
- Keep canonical character names and outcomes
- Include every named character required by the source excerpt; there is no upper limit
- Characters may speak through natural dialogue drawn from or faithful to the source
- Target about 400 words
- Strong emotional through-line without inventing a twist ending
- Do not add characters or events absent from the source`;
}

export function scriptRulesWithSource(): string {
  return `- Scene content must reflect ONLY the retrieved source excerpts and approved story
- Do not add new plot beats, characters, or dialogue absent from the source
- Prefer direct or close paraphrase of source dialogue when available`;
}

export function characterRulesWithSource(): string {
  return `- Character names, roles, and descriptions must match the source canon
- Do not invent new protagonists or rename canonical figures
- Appearance may be stylized for animation but must remain recognizable to the source character`;
}

export function promptRulesWithSource(): string {
  return `- Visual prompts must depict scenes faithful to the source story
- Do not add props, settings, or characters not supported by the scene and source material`;
}
