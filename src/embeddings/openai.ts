import OpenAI from 'openai';
import { EmbeddingProvider } from './embedding-provider.js';

export interface OpenAIEmbeddingOptions {
  apiKey?: string;
  baseURL?: string;
  /** Default: 'text-embedding-3-small' (1536-dim). */
  model?: string;
}

/**
 * Opt-in, API-key embedding provider. Higher quality than the local default
 * at the cost of a network round-trip and an API key. The local provider
 * stays the zero-config default; this is for users who already pay OpenAI.
 */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly id: string;
  private client: OpenAI;
  private model: string;

  constructor(options: OpenAIEmbeddingOptions = {}) {
    this.model = options.model ?? 'text-embedding-3-small';
    this.id = `openai:${this.model}`;
    this.client = new OpenAI({ apiKey: options.apiKey, baseURL: options.baseURL });
  }

  async embed(text: string): Promise<number[]> {
    const res = await this.client.embeddings.create({ model: this.model, input: text });
    return res.data[0].embedding;
  }
}
