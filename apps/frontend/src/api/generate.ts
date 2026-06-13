import type {
  GenerateContentRequest,
  GenerateContentResponse,
} from '../types/content';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

export async function generateContent(
  request: GenerateContentRequest
): Promise<GenerateContentResponse> {
  const response = await fetch(`${API_BASE}/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  return response.json() as Promise<GenerateContentResponse>;
}
