import { Injectable } from "@nestjs/common";
import OpenAI from "openai";

@Injectable()
export class OpenAIService {
  private client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });

  async generate(prompt: string) {
    const response = await this.client.responses.create({
      model: "gpt-3.5-turbo",
      input: prompt
    });

    return response.output_text;
  }
}