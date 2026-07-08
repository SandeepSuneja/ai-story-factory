import { Injectable } from '@nestjs/common';
import type { SceneScript } from '../content-state';
import type { RetrievedChunkDto } from '../models/knowledge.model';
import {
  formatSourceMaterialBlock,
  type SourceFidelityContext,
} from '../source-fidelity';
import { KnowledgeService } from './knowledge.service';
import { RagService } from './rag.service';

@Injectable()
export class RetrievalService {
  constructor(
    private readonly ragService: RagService,
    private readonly knowledgeService: KnowledgeService,
  ) {}

  async buildContext(
    knowledgeSourceId: string | null | undefined,
    query: string,
    topK = 6,
  ): Promise<SourceFidelityContext | undefined> {
    if (!knowledgeSourceId?.trim() || !query.trim()) {
      return undefined;
    }

    const source = await this.knowledgeService.getSource(knowledgeSourceId);
    const hits = await this.ragService.search(
      source.collectionId,
      query,
      topK,
    );

    return {
      sourceId: source.id,
      sourceName: source.name,
      query: query.trim(),
      chunks: hits.map((hit) => ({
        id: hit.id,
        text: hit.text,
        score: hit.score,
        documentTitle: hit.documentTitle,
        metadata: hit.metadata,
      })),
    };
  }

  formatContext(context: SourceFidelityContext): string {
    return formatSourceMaterialBlock(context);
  }

  async searchSource(
    knowledgeSourceId: string,
    query: string,
    topK = 6,
  ): Promise<{
    sourceId: string;
    sourceName: string;
    query: string;
    hits: RetrievedChunkDto[];
  }> {
    const source = await this.knowledgeService.getSource(knowledgeSourceId);
    const hits = await this.ragService.search(
      source.collectionId,
      query,
      topK,
    );
    return {
      sourceId: source.id,
      sourceName: source.name,
      query: query.trim(),
      hits,
    };
  }

  buildSceneQuery(scene: SceneScript): string {
    const dialogue = (scene.dialogue ?? [])
      .map((line) => `${line.speaker ?? 'Speaker'}: ${line.text}`)
      .join('\n');
    return [
      scene.narration,
      scene.visualDescription,
      dialogue,
    ]
      .filter(Boolean)
      .join('\n');
  }
}
