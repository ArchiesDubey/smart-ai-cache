export { AIResponseCache } from './core/cache.js';
export { OpenAICache } from './providers/openai.js';
export { AnthropicCache } from './providers/anthropic.js';
export { GoogleCache } from './providers/google.js';
export { MemoryStorage } from './storage/memory-storage.js';
export { RedisStorage } from './storage/redis-storage.js';
export type { StorageInterface } from './storage/redis-storage.js';

// Semantic tier (Phase 1) — embeddings + vector stores
export type { EmbeddingProvider } from './embeddings/embedding-provider.js';
export { LocalEmbeddingProvider } from './embeddings/local.js';
export { OpenAIEmbeddingProvider } from './embeddings/openai.js';
export { MockEmbeddingProvider } from './embeddings/mock.js';
export type { VectorStore, VectorSearchResult } from './vector/vector-store.js';
export { MemoryVectorStore, cosineSimilarity } from './vector/memory-vector-store.js';
export { RedisVectorStore } from './vector/redis-vector-store.js';

export * from './core/types.js';
