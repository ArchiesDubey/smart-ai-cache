import { EmbeddingProvider } from './embedding-provider.js';

export interface MockEmbeddingOptions {
  /** Vector dimensionality. Default: 16. */
  dim?: number;
  /** Pin exact vectors for specific inputs — useful to engineer near-misses in tests. */
  vectors?: Record<string, number[]>;
}

/**
 * Deterministic, dependency-free embedding provider for tests / CI so the
 * suite never downloads a model. Identical text → identical vector (cosine
 * 1.0 → semantic hit); different text → different vector (low similarity).
 * Override specific inputs via `vectors` to test threshold/near-miss behavior.
 */
export class MockEmbeddingProvider implements EmbeddingProvider {
  readonly id = 'mock';
  private dim: number;
  private overrides: Map<string, number[]>;

  constructor(options: MockEmbeddingOptions = {}) {
    this.dim = options.dim ?? 16;
    this.overrides = new Map(Object.entries(options.vectors ?? {}));
  }

  async embed(text: string): Promise<number[]> {
    const override = this.overrides.get(text);
    if (override) return override;

    const vec = new Array(this.dim).fill(0);
    for (let i = 0; i < text.length; i++) {
      vec[i % this.dim] += text.charCodeAt(i);
    }
    const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0)) || 1;
    return vec.map((v) => v / norm);
  }
}
