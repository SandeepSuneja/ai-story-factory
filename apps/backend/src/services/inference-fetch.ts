import { Agent, fetch } from "undici";

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_VIDEO_TIMEOUT_MS = 48 * 60 * 60 * 1000;
const DEFAULT_FLUX_TIMEOUT_MS = 48 * 60 * 60 * 1000;
const DEFAULT_SDXL_TIMEOUT_MS = 48 * 60 * 60 * 1000;

function readTimeoutMs(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return parsed;
}

function createInferenceAgent(options: {
  headersTimeoutMs: number;
  bodyTimeoutMs: number;
}): Agent {
  return new Agent({
    connectTimeout: 30_000,
    headersTimeout: options.headersTimeoutMs,
    bodyTimeout: options.bodyTimeoutMs,
  });
}

const inferenceAgent = createInferenceAgent({
  headersTimeoutMs: readTimeoutMs(
    "INFERENCE_HEADERS_TIMEOUT_MS",
    DEFAULT_TIMEOUT_MS,
  ),
  bodyTimeoutMs: readTimeoutMs(
    "INFERENCE_BODY_TIMEOUT_MS",
    DEFAULT_TIMEOUT_MS,
  ),
});

const videoInferenceAgent = createInferenceAgent({
  headersTimeoutMs: readTimeoutMs(
    "HUNYUAN_HEADERS_TIMEOUT_MS",
    readTimeoutMs(
      "INFERENCE_HEADERS_TIMEOUT_MS",
      DEFAULT_VIDEO_TIMEOUT_MS,
    ),
  ),
  bodyTimeoutMs: readTimeoutMs(
    "HUNYUAN_BODY_TIMEOUT_MS",
    readTimeoutMs("INFERENCE_BODY_TIMEOUT_MS", DEFAULT_VIDEO_TIMEOUT_MS),
  ),
});

const fluxInferenceAgent = createInferenceAgent({
  headersTimeoutMs: readTimeoutMs(
    "FLUX_HEADERS_TIMEOUT_MS",
    readTimeoutMs(
      "INFERENCE_HEADERS_TIMEOUT_MS",
      DEFAULT_FLUX_TIMEOUT_MS,
    ),
  ),
  bodyTimeoutMs: readTimeoutMs(
    "FLUX_BODY_TIMEOUT_MS",
    readTimeoutMs("INFERENCE_BODY_TIMEOUT_MS", DEFAULT_FLUX_TIMEOUT_MS),
  ),
});

type InferenceFetchInit = NonNullable<Parameters<typeof fetch>[1]>;

export function inferenceFetch(
  url: string | URL,
  init?: InferenceFetchInit,
): ReturnType<typeof fetch> {
  return fetch(url, {
    ...init,
    dispatcher: inferenceAgent,
  });
}

export function videoInferenceFetch(
  url: string | URL,
  init?: InferenceFetchInit,
): ReturnType<typeof fetch> {
  return fetch(url, {
    ...init,
    dispatcher: videoInferenceAgent,
  });
}

export function fluxInferenceFetch(
  url: string | URL,
  init?: InferenceFetchInit,
): ReturnType<typeof fetch> {
  return fetch(url, {
    ...init,
    dispatcher: fluxInferenceAgent,
  });
}

const sdxlInferenceAgent = createInferenceAgent({
  headersTimeoutMs: readTimeoutMs(
    "SDXL_HEADERS_TIMEOUT_MS",
    readTimeoutMs(
      "INFERENCE_HEADERS_TIMEOUT_MS",
      DEFAULT_SDXL_TIMEOUT_MS,
    ),
  ),
  bodyTimeoutMs: readTimeoutMs(
    "SDXL_BODY_TIMEOUT_MS",
    readTimeoutMs("INFERENCE_BODY_TIMEOUT_MS", DEFAULT_SDXL_TIMEOUT_MS),
  ),
});

export function sdxlInferenceFetch(
  url: string | URL,
  init?: InferenceFetchInit,
): ReturnType<typeof fetch> {
  return fetch(url, {
    ...init,
    dispatcher: sdxlInferenceAgent,
  });
}
