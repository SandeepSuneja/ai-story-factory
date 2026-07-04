import type {
  CreateSeriesRequest,
  Series,
  SeriesSummary,
  UpdateSeriesRequest,
} from '../types/series';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

async function requestJson<TResponse>(
  path: string,
  init?: RequestInit,
): Promise<TResponse> {
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
    return undefined as TResponse;
  }

  return response.json() as Promise<TResponse>;
}

export function listSeries(): Promise<SeriesSummary[]> {
  return requestJson('/series');
}

export function getSeries(id: string): Promise<Series> {
  return requestJson(`/series/${id}`);
}

export function createSeries(body: CreateSeriesRequest = {}): Promise<Series> {
  return requestJson('/series', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateSeries(
  id: string,
  body: UpdateSeriesRequest,
): Promise<Series> {
  return requestJson(`/series/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export function deleteSeries(id: string): Promise<void> {
  return requestJson(`/series/${id}`, {
    method: 'DELETE',
  });
}
