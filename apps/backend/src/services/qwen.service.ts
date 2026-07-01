import { Injectable } from "@nestjs/common";
import { inferenceFetch } from "./inference-fetch";

interface QwenGenerateOptions {
  maxTokens?: number;
}

interface QwenGenerateResponse {
  text: string;
}

@Injectable()
export class QwenService {
  private readonly serviceUrl =
    process.env.QWEN_SERVICE_URL ?? "http://127.0.0.1:8090";

  async generate(
    prompt: string,
    options: QwenGenerateOptions = {},
  ): Promise<string> {
    const response = await inferenceFetch(`${this.serviceUrl}/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
      }),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(
        message || `Qwen service failed with status ${response.status}`,
      );
    }

    const result = (await response.json()) as QwenGenerateResponse;
    return result.text;
  }
}
