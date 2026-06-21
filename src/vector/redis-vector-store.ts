import { Redis, RedisOptions } from 'ioredis';
import { VectorStore, VectorSearchResult } from './vector-store.js';
import { cosineSimilarity } from './memory-vector-store.js';

export interface RedisVectorStoreOptions {
  /** Reuse an existing ioredis client (e.g. share one connection with RedisStorage). */
  redis?: Redis;
  /** Or let the store create its own client from these options. */
  redisOptions?: RedisOptions;
  /**
   * Redis hash key that holds all vectors (field = id, value = JSON-encoded vector).
   * Default: 'ai-cache:vectors'.
   */
  indexKey?: string;
}

/**
 * Production vector store backed by **plain Redis** — the exact same server the
 * exact-match cache uses. No RediSearch / Redis Stack module required: vectors
 * live in a single Redis hash and cosine similarity is computed in Node
 * (brute-force, mirroring MemoryVectorStore). This keeps the architecture to a
 * single Redis version. It is O(n) per lookup, which is fine for cache-sized
 * working sets; swap in a native vector index later if you outgrow it.
 */
export class RedisVectorStore implements VectorStore {
  private redis: Redis;
  private indexKey: string;
  private ownsConnection: boolean;

  constructor(options: RedisVectorStoreOptions = {}) {
    this.ownsConnection = !options.redis;
    this.redis = options.redis ?? new Redis(options.redisOptions ?? {});
    this.indexKey = options.indexKey ?? 'ai-cache:vectors';
  }

  async add(id: string, vector: number[]): Promise<void> {
    await this.redis.hset(this.indexKey, id, JSON.stringify(vector));
  }

  async search(vector: number[], topK: number): Promise<VectorSearchResult[]> {
    const all = await this.redis.hgetall(this.indexKey);
    const results: VectorSearchResult[] = [];
    for (const [id, json] of Object.entries(all)) {
      try {
        const vec = JSON.parse(json) as number[];
        results.push({ id, score: cosineSimilarity(vector, vec) });
      } catch {
        // Skip malformed entries rather than failing the whole lookup.
      }
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, Math.max(0, topK));
  }

  async delete(id: string): Promise<void> {
    await this.redis.hdel(this.indexKey, id);
  }

  async clear(): Promise<void> {
    await this.redis.del(this.indexKey);
  }

  async size(): Promise<number> {
    return this.redis.hlen(this.indexKey);
  }

  /** Only closes the connection if this store created it. */
  async disconnect(): Promise<void> {
    if (this.ownsConnection) {
      await this.redis.quit();
    }
  }
}
