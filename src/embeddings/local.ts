import { EmbeddingProvider } from './embedding-provider.js';

export interface LocalEmbeddingOptions {
  /** transformers.js model id. Default: 'Xenova/all-MiniLM-L6-v2' (384-dim, ~23MB). */
  model?: string;
}

/**
 * Zero-API-key default. Runs sentence embeddings locally via
 * `@xenova/transformers` (an optional dependency loaded lazily so it never
 * affects the exact-match install footprint or cold-start unless used).
 *
 * Cost note: the first call downloads + loads the model (slow cold-start);
 * warm calls are ~10–50ms. Document this for users — it is not free like the
 * exact-match path.
 */
export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly id: string;
  private model: string;
  private extractorPromise: Promise<any> | null = null;

  constructor(options: LocalEmbeddingOptions = {}) {
    this.model = options.model ?? 'Xenova/all-MiniLM-L6-v2';
    this.id = `local:${this.model}`;
  }

  private getExtractor(): Promise<any> {
    if (!this.extractorPromise) {
      this.extractorPromise = (async () => {
        let transformers: any;
        try {
          // @ts-ignore optional dependency, resolved at runtime only
          transformers = await import('@xenova/transformers');
        } catch {
          throw new Error(
            "LocalEmbeddingProvider needs the optional dependency '@xenova/transformers'. " +
              'Install it with: npm install @xenova/transformers'
          );
        }
        return transformers.pipeline('feature-extraction', this.model);
      })();
    }
    return this.extractorPromise;
  }

  async embed(text: string): Promise<number[]> {
    const extractor = await this.getExtractor();
    // mean pooling + L2 normalize → cosine-ready vectors
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data as Float32Array);
  }
}
