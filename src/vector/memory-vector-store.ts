import { VectorStore, VectorSearchResult } from './vector-store.js';

/** Cosine similarity of two equal-length vectors. Returns 0 on mismatch/zero. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Zero-config, in-process vector store. Brute-force cosine over a Map — O(n)
 * per search, which is perfectly fine for the cache-sized working sets this
 * targets. The production path is RedisVectorStore.
 */
export class MemoryVectorStore implements VectorStore {
  private vectors = new Map<string, number[]>();

  async add(id: string, vector: number[]): Promise<void> {
    this.vectors.set(id, vector);
  }

  async search(vector: number[], topK: number): Promise<VectorSearchResult[]> {
    const results: VectorSearchResult[] = [];
    for (const [id, vec] of this.vectors.entries()) {
      results.push({ id, score: cosineSimilarity(vector, vec) });
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, Math.max(0, topK));
  }

  async delete(id: string): Promise<void> {
    this.vectors.delete(id);
  }

  async clear(): Promise<void> {
    this.vectors.clear();
  }

  async size(): Promise<number> {
    return this.vectors.size;
  }
}
