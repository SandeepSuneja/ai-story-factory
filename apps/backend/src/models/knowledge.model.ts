export interface RetrievedChunkDto {
  id: string;
  text: string;
  score: number;
  documentTitle?: string;
  metadata?: Record<string, unknown>;
}

export interface KnowledgeSourceRecord {
  id: string;
  name: string;
  description: string;
  collectionId: string;
  documentCount: number;
  chunkCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeSourceSummary {
  id: string;
  name: string;
  description: string;
  documentCount: number;
  chunkCount: number;
  updatedAt: string;
}

export class CreateKnowledgeSourceRequestDto {
  name: string;
  description?: string;
}

export class AddKnowledgeDocumentsRequestDto {
  documents: Array<{
    id?: string;
    title?: string;
    text: string;
    metadata?: Record<string, unknown>;
  }>;
}

export class SearchKnowledgeRequestDto {
  query: string;
  topK?: number;
}

export class SearchKnowledgeResponseDto {
  sourceId: string;
  sourceName: string;
  query: string;
  hits: RetrievedChunkDto[];
}

export class AskKnowledgeRequestDto {
  question: string;
  topK?: number;
}

export class AskKnowledgeResponseDto {
  answer: string;
  sourceId: string;
  sourceName: string;
  question: string;
  hits: RetrievedChunkDto[];
}
