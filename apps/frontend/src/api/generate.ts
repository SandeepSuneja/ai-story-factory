import type {
  GenerateCharacterProfileRequest,
  GenerateCharacterProfileResponse,
  GenerateIdeaRequest,
  GenerateIdeaResponse,
  GenerateImageRequest,
  GenerateImageResponse,
  GenerateVideoRequest,
  GenerateVideoResponse,
  GenerateAudioRequest,
  GenerateAudioResponse,
  AssembleVideoRequest,
  AssembleVideoResponse,
  GeneratePromptRequest,
  GeneratePromptResponse,
  GenerateScriptRequest,
  GenerateScriptResponse,
  GenerateStoryRequest,
  GenerateStoryResponse,
} from '../types/content';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

async function postJson<TResponse>(
  path: string,
  body: unknown,
): Promise<TResponse> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  return response.json() as Promise<TResponse>;
}

export function generateIdea(
  request: GenerateIdeaRequest,
): Promise<GenerateIdeaResponse> {
  return postJson('/generate/idea', request);
}

export function generateStory(
  request: GenerateStoryRequest,
): Promise<GenerateStoryResponse> {
  return postJson('/generate/story', request);
}

export function generateScript(
  request: GenerateScriptRequest,
): Promise<GenerateScriptResponse> {
  return postJson('/generate/script', request);
}

export function generateCharacterProfile(
  request: GenerateCharacterProfileRequest,
): Promise<GenerateCharacterProfileResponse> {
  return postJson('/generate/character/profile', request);
}

export function generatePrompt(
  request: GeneratePromptRequest,
): Promise<GeneratePromptResponse> {
  return postJson('/generate/prompt', request);
}

export function generateImage(
  request: GenerateImageRequest,
): Promise<GenerateImageResponse> {
  return postJson('/generate/image', request);
}

export function generateVideo(
  request: GenerateVideoRequest,
): Promise<GenerateVideoResponse> {
  return postJson('/generate/video', request);
}

export function generateAudio(
  request: GenerateAudioRequest,
): Promise<GenerateAudioResponse> {
  return postJson('/generate/audio', request);
}

export function assembleVideo(
  request: AssembleVideoRequest,
): Promise<AssembleVideoResponse> {
  return postJson('/generate/assembly', request);
}
