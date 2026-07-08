export interface RetrievedChunk {
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

export interface CreateKnowledgeSourceRequest {
  name: string;
  description?: string;
}

export interface AddKnowledgeDocumentsRequest {
  documents: Array<{
    id?: string;
    title?: string;
    text: string;
    metadata?: Record<string, unknown>;
  }>;
}

export interface SearchKnowledgeResponse {
  sourceId: string;
  sourceName: string;
  query: string;
  hits: RetrievedChunk[];
}

export interface AskKnowledgeResponse {
  answer: string;
  sourceId: string;
  sourceName: string;
  question: string;
  hits: RetrievedChunk[];
}

export interface KnowledgeHealthResponse {
  status: 'ok' | 'degraded';
  rag: boolean;
}
