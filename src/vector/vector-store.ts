export interface VectorSearchResult {
  /** The id passed to add() — by convention the exact cache key. */
  id: string;
  /** Cosine similarity in [-1, 1]; higher is more similar. */
  score: number;
}

/**
 * Stores embedding vectors keyed by id and supports top-K nearest-neighbour
 * search by cosine similarity. The exact cache key doubles as the vector id,
 * so a semantic hit maps straight back to a stored CacheEntry — no parallel
 * id scheme.
 */
export interface VectorStore {
  add(id: string, vector: number[], meta?: Record<string, any>): Promise<void>;
  search(vector: number[], topK: number): Promise<VectorSearchResult[]>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
  size(): Promise<number>;
}
