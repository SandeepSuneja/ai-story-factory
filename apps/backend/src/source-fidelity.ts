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
  sequential?: boolean;
}

function chunkOrderKey(chunk: RetrievedChunk): [string, number, string] {
  const metadata = chunk.metadata ?? {};
  const documentId = String(metadata.document_id ?? '');
  const chunkIndex = Number(metadata.chunk_index ?? 0);
  return [documentId, Number.isFinite(chunkIndex) ? chunkIndex : 0, chunk.id];
}

export function sortChunksInSourceOrder(
  chunks: RetrievedChunk[],
): RetrievedChunk[] {
  return [...chunks].sort((left, right) => {
    const leftKey = chunkOrderKey(left);
    const rightKey = chunkOrderKey(right);
    for (let index = 0; index < leftKey.length; index += 1) {
      if (leftKey[index] < rightKey[index]) {
        return -1;
      }
      if (leftKey[index] > rightKey[index]) {
        return 1;
      }
    }
    return 0;
  });
}

export function sourceFidelityRules(): string {
  return `SOURCE FIDELITY RULES (mandatory when source material is provided):
- The SOURCE MATERIAL excerpts below are authoritative canon. Follow them exactly.
- Do NOT invent new plot points, characters, places, miracles, or dialogue absent from the source.
- Do NOT modernize, remix, parody, or substitute alternate versions (e.g. keep Ramayana events as written, not random fantasy).
- Preserve the narrative order of the source — do not skip, merge, or reorder major beats.
- When unsure, quote or closely paraphrase the source instead of guessing.
- If the source does not mention something, omit it rather than making it up.`;
}

export function formatSourceMaterialBlock(context: SourceFidelityContext): string {
  if (context.chunks.length === 0) {
    return '';
  }

  const orderedChunks = context.sequential
    ? sortChunksInSourceOrder(context.chunks)
    : context.chunks;

  const excerpts = orderedChunks
    .map((chunk, index) => {
      const label = context.sequential
        ? `Passage ${index + 1} (source order)`
        : chunk.documentTitle?.trim() || `Excerpt ${index + 1}`;
      return `[${label}]\n${chunk.text.trim()}`;
    })
    .join('\n\n');

  const orderNote = context.sequential
    ? '\nPassages are listed in the original source order. Follow this order when writing the story and script.'
    : '';

  return `${sourceFidelityRules()}${orderNote}

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
  return `Generate one story concept that adapts the SOURCE MATERIAL.
- The concept must stay faithful to the source — no invented twists or modern substitutions.
- Return only the idea.`;
}

export function storyRequirementsWithSource(): string {
  return `Requirements:
- Adapt ALL events present in the SOURCE MATERIAL excerpts, in the same order as the passages
- Keep canonical character names and outcomes
- Include every named character required by the source; there is no upper limit
- Characters may speak through natural dialogue drawn from or faithful to the source
- There is no word limit — cover the full source narrative without omitting major beats
- Strong emotional through-line without inventing a twist ending
- Do not add characters or events absent from the source
- Do not reorder, merge, or skip source passages`;
}

export function scriptRulesWithSource(): string {
  return `- Scene content must reflect ONLY the retrieved source excerpts and approved story
- Scenes must follow the same sequence as the source passages and approved story — scene 1 first, then scene 2, and so on
- Do not reorder, merge, or skip narrative beats from the source
- Do not add new plot beats, characters, or dialogue absent from the source
- Prefer direct or close paraphrase of source dialogue when available
- Each dialogue line may be up to 35 words — use fuller quotes from the source rather than one-sentence summaries
- Prefer one scene per source beat with richer dialogue over splitting one beat into many micro-scenes`;
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
