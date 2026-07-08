import type {
  AddKnowledgeDocumentsRequest,
  AskKnowledgeResponse,
  CreateKnowledgeSourceRequest,
  KnowledgeHealthResponse,
  KnowledgeSourceRecord,
  KnowledgeSourceSummary,
  SearchKnowledgeResponse,
} from '../types/knowledge';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

async function requestJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export function getKnowledgeHealth(): Promise<KnowledgeHealthResponse> {
  return requestJson('/knowledge/health');
}

export function listKnowledgeSources(): Promise<KnowledgeSourceSummary[]> {
  return requestJson('/knowledge');
}

export function createKnowledgeSource(
  body: CreateKnowledgeSourceRequest,
): Promise<KnowledgeSourceRecord> {
  return requestJson('/knowledge', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function deleteKnowledgeSource(id: string): Promise<void> {
  return requestJson(`/knowledge/${id}`, { method: 'DELETE' });
}

export function addKnowledgeDocuments(
  id: string,
  body: AddKnowledgeDocumentsRequest,
): Promise<KnowledgeSourceRecord> {
  return requestJson(`/knowledge/${id}/documents`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function uploadKnowledgeDocument(
  id: string,
  file: File,
  title?: string,
): Promise<KnowledgeSourceRecord> {
  const formData = new FormData();
  formData.append('file', file);
  if (title?.trim()) {
    formData.append('title', title.trim());
  }

  const response = await fetch(`${API_BASE}/knowledge/${id}/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Upload failed with status ${response.status}`);
  }

  return response.json() as Promise<KnowledgeSourceRecord>;
}

export function searchKnowledgeSource(
  id: string,
  query: string,
  topK = 6,
): Promise<SearchKnowledgeResponse> {
  return requestJson(`/knowledge/${id}/search`, {
    method: 'POST',
    body: JSON.stringify({ query, topK }),
  });
}

export function askKnowledgeSource(
  id: string,
  question: string,
  topK = 6,
): Promise<AskKnowledgeResponse> {
  return requestJson(`/knowledge/${id}/ask`, {
    method: 'POST',
    body: JSON.stringify({ question, topK }),
  });
}
