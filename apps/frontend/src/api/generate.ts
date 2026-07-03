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
  UploadVideoResponse,
  StartVideoJobResponse,
  VideoJobStatusResponse,
  StartImageJobResponse,
  ImageJobStatusResponse,
  UpscaleVideoRequest,
  UpscaleVideoResponse,
} from '../types/content';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';
const VIDEO_POLL_MS = 5_000;
const IMAGE_POLL_MS = 5_000;
const VIDEO_JOB_TIMEOUT_MS = 48 * 60 * 60 * 1000;
const IMAGE_JOB_TIMEOUT_MS = 48 * 60 * 60 * 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

async function getJson<TResponse>(path: string): Promise<TResponse> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
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

export async function uploadSceneVideo(
  sceneNumber: number,
  file: File,
): Promise<UploadVideoResponse> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('scene_number', String(sceneNumber));

  const response = await fetch(`${API_BASE}/upload/video`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Upload failed with status ${response.status}`);
  }

  return response.json() as Promise<UploadVideoResponse>;
}

export async function generateImage(
  request: GenerateImageRequest,
): Promise<GenerateImageResponse> {
  const job = await postJson<StartImageJobResponse>(
    '/generate/image',
    request,
  );
  const deadline = Date.now() + IMAGE_JOB_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await sleep(IMAGE_POLL_MS);
    const status = await getJson<ImageJobStatusResponse>(
      `/generate/image/${job.jobId}`,
    );

    if (status.status === 'completed' && status.scene) {
      return { scene: status.scene };
    }

    if (status.status === 'failed') {
      throw new Error(status.error || 'Image generation failed');
    }
  }

  throw new Error(
    'Image generation timed out after 48 hours. Check the FLUX service terminal for progress.',
  );
}

export async function generateVideo(
  request: GenerateVideoRequest,
): Promise<GenerateVideoResponse> {
  const job = await postJson<StartVideoJobResponse>(
    '/generate/video',
    request,
  );
  const deadline = Date.now() + VIDEO_JOB_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await sleep(VIDEO_POLL_MS);
    const status = await getJson<VideoJobStatusResponse>(
      `/generate/video/${job.jobId}`,
    );

    if (status.status === 'completed' && status.scene) {
      return { scene: status.scene };
    }

    if (status.status === 'failed') {
      throw new Error(status.error || 'Video generation failed');
    }
  }

  throw new Error(
    'Video generation timed out after 48 hours. Check the Wan service terminal for progress.',
  );
}

export function upscaleScene(
  request: UpscaleVideoRequest,
): Promise<UpscaleVideoResponse> {
  return postJson('/generate/upscale', request);
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
