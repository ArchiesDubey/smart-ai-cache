import { RedisOptions } from 'ioredis';
import { EmbeddingProvider } from '../embeddings/embedding-provider.js';
import { VectorStore } from '../vector/vector-store.js';

export interface CacheEntry {
  key: string;
  value: any;
  timestamp: number;
  ttl: number;
  provider: string;
  model: string;
  tokenCount: number;
  cost: number;
}

/**
 * Optional semantic-cache tier. Off by default → zero breaking changes. When
 * enabled, an exact miss embeds the query and searches a vector store; a match
 * at or above `threshold` is returned as a semantic hit.
 */
export interface SemanticConfig {
  /** Master switch. Default: false (backward compatible). */
  enabled: boolean;
  /** Embedding provider. Default: LocalEmbeddingProvider (zero API key). */
  provider?: EmbeddingProvider;
  /** Vector store. Default: MemoryVectorStore (in-process brute-force cosine). */
  vectorStore?: VectorStore;
  /** Cosine similarity required for a hit. Default: 0.95 (deliberately high). */
  threshold?: number;
  /** Nearest-neighbours to fetch per lookup. Default: 1. */
  topK?: number;
  /** Model id passed to the default LocalEmbeddingProvider. */
  model?: string;
  /** Log queries that fell just below threshold, to help tune it. Default: false. */
  logNearMisses?: boolean;
}

export interface CacheConfig {
  ttl?: number;
  maxSize?: number;
  storage?: 'memory' | 'redis';
  redisOptions?: RedisOptions;
  keyPrefix?: string;
  enableStats?: boolean;
  debug?: boolean;
  semantic?: SemanticConfig;
}

export interface ProviderConfig {
  name: 'openai' | 'anthropic' | 'google';
  model: string;
  endpoint?: string;
  apiKey?: string;
  costPerToken?: {
    input: number;
    output: number;
  };
}

export interface CacheStats {
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  /** Subset of cacheHits served by the semantic tier (paraphrase matches). */
  semanticHits: number;
  /** Queries that matched a vector below threshold (only counted when logNearMisses). */
  nearMisses: number;
  hitRate: number;
  totalCostSaved: number;
  averageResponseTime: number;
  lastResetTime: Date;
  byProvider: {
    [provider: string]: {
      requests: number;
      hits: number;
      costSaved: number;
    };
  };
}
