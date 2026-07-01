import type {
  CreateProjectRequest,
  Project,
  ProjectSummary,
  UpdateProjectRequest,
} from '../types/project';

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

export function listProjects(): Promise<ProjectSummary[]> {
  return requestJson('/projects');
}

export function getProject(id: string): Promise<Project> {
  return requestJson(`/projects/${id}`);
}

export function createProject(
  body: CreateProjectRequest = {},
): Promise<Project> {
  return requestJson('/projects', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateProject(
  id: string,
  body: UpdateProjectRequest,
): Promise<Project> {
  return requestJson(`/projects/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export function deleteProject(id: string): Promise<void> {
  return requestJson(`/projects/${id}`, {
    method: 'DELETE',
  });
}
