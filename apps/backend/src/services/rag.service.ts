import { Injectable } from '@nestjs/common';
import { inferenceFetch } from './inference-fetch';
import type { RetrievedChunkDto } from '../models/knowledge.model';

interface RagCollectionResponse {
  id: string;
  name: string;
  description: string;
  document_count: number;
  chunk_count: number;
}

interface RagSearchHit {
  id: string;
  text: string;
  score: number;
  metadata?: Record<string, unknown>;
}

interface RagSearchResponse {
  collection_id: string;
  query: string;
  hits: RagSearchHit[];
}

@Injectable()
export class RagService {
  private readonly serviceUrl =
    process.env.RAG_SERVICE_URL ?? 'http://127.0.0.1:8091';

  async isHealthy(): Promise<boolean> {
    try {
      const response = await inferenceFetch(`${this.serviceUrl}/health`, {
        method: 'GET',
      });
      if (!response.ok) {
        return false;
      }
      const payload = (await response.json()) as { status?: string };
      return payload.status === 'ok';
    } catch {
      return false;
    }
  }

  async createCollection(
    name: string,
    description = '',
  ): Promise<RagCollectionResponse> {
    return this.postJson<RagCollectionResponse>('/collections', {
      name,
      description,
    });
  }

  async getCollection(collectionId: string): Promise<RagCollectionResponse> {
    return this.getJson<RagCollectionResponse>(`/collections/${collectionId}`);
  }

  async deleteCollection(collectionId: string): Promise<void> {
    const response = await inferenceFetch(
      `${this.serviceUrl}/collections/${collectionId}`,
      { method: 'DELETE' },
    );
    if (!response.ok && response.status !== 404) {
      const message = await response.text();
      throw new Error(
        message || `RAG delete failed with status ${response.status}`,
      );
    }
  }

  async indexDocuments(
    collectionId: string,
    documents: Array<{
      id?: string;
      title?: string;
      text: string;
      metadata?: Record<string, unknown>;
    }>,
  ): Promise<RagCollectionResponse> {
    return this.postJson<RagCollectionResponse>(
      `/collections/${collectionId}/documents`,
      { documents },
    );
  }

  async uploadDocument(
    collectionId: string,
    filename: string,
    content: Buffer,
    title?: string,
  ): Promise<RagCollectionResponse> {
    const text = content.toString('utf8');
    return this.indexDocuments(collectionId, [
      {
        title: title?.trim() || filename,
        text,
        metadata: { source_filename: filename },
      },
    ]);
  }

  async search(
    collectionId: string,
    query: string,
    topK = 6,
  ): Promise<RetrievedChunkDto[]> {
    const result = await this.postJson<RagSearchResponse>('/search', {
      collection_id: collectionId,
      query,
      top_k: topK,
    });

    return result.hits.map((hit) => ({
      id: hit.id,
      text: hit.text,
      score: hit.score,
      documentTitle:
        typeof hit.metadata?.document_title === 'string'
          ? hit.metadata.document_title
          : undefined,
      metadata: hit.metadata,
    }));
  }

  private async getJson<T>(path: string): Promise<T> {
    const response = await inferenceFetch(`${this.serviceUrl}${path}`, {
      method: 'GET',
    });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(
        message || `RAG request failed with status ${response.status}`,
      );
    }
    return (await response.json()) as T;
  }

  private async postJson<T>(path: string, body: unknown): Promise<T> {
    const response = await inferenceFetch(`${this.serviceUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(
        message || `RAG request failed with status ${response.status}`,
      );
    }
    return (await response.json()) as T;
  }
}
