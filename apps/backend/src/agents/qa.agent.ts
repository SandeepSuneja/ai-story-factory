import { Injectable } from '@nestjs/common';
import type { RetrievedChunkDto } from '../models/knowledge.model';
import { formatSourceMaterialBlock, type SourceFidelityContext } from '../source-fidelity';
import { QwenService } from '../services/qwen.service';

@Injectable()
export class QaAgent {
  constructor(private readonly ai: QwenService) {}

  async answer(
    question: string,
    sourceName: string,
    hits: RetrievedChunkDto[],
  ): Promise<string> {
    const context: SourceFidelityContext = {
      sourceId: 'qa',
      sourceName,
      query: question.trim(),
      chunks: hits.map((hit) => ({
        id: hit.id,
        text: hit.text,
        score: hit.score,
        documentTitle: hit.documentTitle,
        metadata: hit.metadata,
      })),
    };

    const sourceBlock = formatSourceMaterialBlock(context);
    const prompt = `You are a question-answering assistant for canonical source material.

Answer the user's question using ONLY the retrieved source excerpts below.
- If the answer is not supported by the excerpts, say you cannot find it in the source.
- Quote or closely paraphrase the source.
- Do not invent events, characters, or dialogue.

QUESTION:
${question.trim()}

${sourceBlock}

Return only the answer.`;

    return this.ai.generate(prompt, { maxTokens: 1024 });
  }
}
