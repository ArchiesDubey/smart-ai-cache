import { CacheConfig, CacheEntry, CacheStats } from './types.js';
import { DEFAULT_CACHE_CONFIG } from './constants.js';
import { generateHashedKeyForPayload } from '../utils/key-generator.js';
import { StorageInterface } from '../storage/redis-storage.js';
import { MemoryStorage } from '../storage/memory-storage.js';
import { RedisStorage } from '../storage/redis-storage.js';
import { EmbeddingProvider } from '../embeddings/embedding-provider.js';
import { LocalEmbeddingProvider } from '../embeddings/local.js';
import { VectorStore } from '../vector/vector-store.js';
import { MemoryVectorStore } from '../vector/memory-vector-store.js';
import { RedisVectorStore } from '../vector/redis-vector-store.js';

export class AIResponseCache {
  private storage: StorageInterface;
  private config: Required<CacheConfig>;
  private stats: CacheStats;
  private debug: boolean;

  // Semantic tier (only populated when config.semantic.enabled)
  private semanticEnabled = false;
  private embeddingProvider!: EmbeddingProvider;
  private vectorStore!: VectorStore;
  private semanticThreshold = 0.95;
  private semanticTopK = 1;
  private semanticLogNearMisses = false;

  constructor(config?: CacheConfig) {
    this.config = this.validateAndMergeConfig(config);
    this.debug = this.config.debug;
    this.stats = this.resetStats();
    this.storage = this.initializeStorage();
    this.initializeSemantic();
  }

  async wrap<T>(
    fn: () => Promise<{ value: T; tokenCount?: number; cost?: number }>,
    options: {
      provider: string;
      model: string;
      cacheKey?: string;
      ttl?: number;
      prompt?: any;
      params?: any;
      /** Per-call semantic overrides (e.g. a looser/tighter threshold for one route). */
      semantic?: { enabled?: boolean; threshold?: number };
    }
  ): Promise<T> {
    this.validateWrapOptions(options);
    
    const startTime = Date.now();
    this.stats.totalRequests++;
    this.initializeProviderStats(options.provider);

    const key = options.cacheKey || this.generateKey(options.provider, options.model, options.prompt, options.params);

    // Try to get from cache with error handling
    try {
      const cachedEntry = await this.storage.get(key);
      if (cachedEntry) {
        this.logDebug(`Cache hit for key: ${key}`);
        this.updateCacheHitStats(cachedEntry);
        return cachedEntry.value;
      }
    } catch (error) {
      this.logError('Cache get error:', error);
      // Continue to API call on cache error
    }

    // Semantic tier — runs only on an exact miss, so the hot path stays
    // sub-millisecond and pays no embedding cost. Embedding is computed once
    // and reused for both the search here and the add() on a full miss.
    let queryEmbedding: number[] | null = null;
    const semanticOn = options.semantic?.enabled ?? this.semanticEnabled;
    if (semanticOn && this.embeddingProvider && this.vectorStore) {
      const text = this.extractEmbedText(options.prompt);
      if (text) {
        const threshold = options.semantic?.threshold ?? this.semanticThreshold;
        try {
          queryEmbedding = await this.embeddingProvider.embed(text);
          const matches = await this.vectorStore.search(queryEmbedding, this.semanticTopK);
          const top = matches[0];
          if (top && top.score >= threshold) {
            const entry = await this.storage.get(top.id);
            if (entry) {
              this.logDebug(`Semantic hit (score=${top.score.toFixed(4)}) for key: ${top.id}`);
              this.updateSemanticHitStats(entry);
              return entry.value;
            }
            // Vector pointed at an expired/evicted entry — fall through to miss.
          } else if (top && this.semanticLogNearMisses) {
            this.stats.nearMisses++;
            this.logDebug(
              `Semantic near-miss (score=${top.score.toFixed(4)} < threshold=${threshold}) for key: ${top.id}`
            );
          }
        } catch (error) {
          this.logError('Semantic lookup error:', error);
          // Fall through to the normal miss path on any embedding/search error.
        }
      }
    }

    // Cache miss - call the original function with retry logic
    this.stats.cacheMisses++;
    this.stats.byProvider[options.provider].requests++;
    this.updateHitRate();
    
    let result: { value: T; tokenCount?: number; cost?: number };
    let attempt = 0;
    const maxRetries = 3;
    
    while (attempt < maxRetries) {
      try {
        result = await fn();
        break;
      } catch (error) {
        attempt++;
        this.logError(`API call attempt ${attempt} failed:`, error);
        
        if (attempt >= maxRetries) {
          this.logError('All API call attempts failed, throwing error');
          throw error;
        }
        
        // Exponential backoff (reduced for tests if debug mode)
        const backoffMs = this.debug ? Math.pow(2, attempt) * 10 : Math.pow(2, attempt) * 1000;
        await this.sleep(backoffMs);
      }
    }

    const endTime = Date.now();
    this.updateResponseTimeStats(endTime - startTime);

    const { value, tokenCount = 0, cost = 0 } = result!;

    // Try to store in cache with error handling
    try {
      const newEntry: CacheEntry = {
        key,
        value,
        timestamp: Date.now(),
        ttl: options.ttl || this.config.ttl,
        provider: options.provider,
        model: options.model,
        tokenCount,
        cost,
      };

      await this.storage.set(key, newEntry);
      this.logDebug(`Cache set for key: ${key}`);
    } catch (error) {
      this.logError('Cache set error:', error);
      // Don't throw on cache set error, just log it
    }

    // Index the embedding so future paraphrases hit. The exact key is the
    // vector id, so a later semantic hit maps straight back to this entry.
    if (semanticOn && queryEmbedding && this.vectorStore) {
      try {
        await this.vectorStore.add(key, queryEmbedding);
      } catch (error) {
        this.logError('Vector store add error:', error);
      }
    }

    return value;
  }

  getStats(): CacheStats {
    return this.stats;
  }

  resetStats(): CacheStats {
    this.stats = {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      semanticHits: 0,
      nearMisses: 0,
      hitRate: 0,
      totalCostSaved: 0,
      averageResponseTime: 0,
      lastResetTime: new Date(),
      byProvider: {},
    };
    return this.stats;
  }

  async clear(): Promise<void> {
    try {
      await this.storage.clear();
      if (this.semanticEnabled && this.vectorStore) {
        await this.vectorStore.clear();
      }
      this.logDebug('Cache cleared successfully');
    } catch (error) {
      this.logError('Cache clear error:', error);
      throw error;
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      const result = await this.storage.delete(key);
      this.logDebug(`Cache delete for key: ${key}, result: ${result}`);
      return result;
    } catch (error) {
      this.logError('Cache delete error:', error);
      return false;
    }
  }

  async has(key: string): Promise<boolean> {
    try {
      return await this.storage.has(key);
    } catch (error) {
      this.logError('Cache has error:', error);
      return false;
    }
  }

  generateKey(provider: string, model: string, prompt: any, params: any): string {
    const promptHash = generateHashedKeyForPayload(prompt);
    const paramsHash = generateHashedKeyForPayload(params);
    return `${this.config.keyPrefix}${provider}:${model}:${promptHash}:${paramsHash}`;
  }

  async getCacheSize(): Promise<number> {
    try {
      return await this.storage.size();
    } catch (error) {
      this.logError('Cache size error:', error);
      return 0;
    }
  }

  private validateAndMergeConfig(config?: CacheConfig): Required<CacheConfig> {
    const merged = { ...DEFAULT_CACHE_CONFIG, ...config };
    
    if (merged.ttl <= 0) {
      throw new Error('TTL must be positive');
    }
    if (merged.maxSize <= 0) {
      throw new Error('Max size must be positive');
    }
    if (!['memory', 'redis'].includes(merged.storage)) {
      throw new Error('Storage must be either "memory" or "redis"');
    }
    
    return merged;
  }

  private validateWrapOptions(options: any): void {
    if (!options.provider || typeof options.provider !== 'string') {
      throw new Error('Provider is required and must be a string');
    }
    if (!options.model || typeof options.model !== 'string') {
      throw new Error('Model is required and must be a string');
    }
    if (options.ttl !== undefined && (typeof options.ttl !== 'number' || options.ttl <= 0)) {
      throw new Error('TTL must be a positive number');
    }
  }

  private initializeStorage(): StorageInterface {
    try {
      if (this.config.storage === 'redis') {
        if (!this.config.redisOptions || Object.keys(this.config.redisOptions).length === 0) {
          this.logError('Redis options are required when using Redis storage');
          throw new Error('Redis options are required when using Redis storage');
        }
        return new RedisStorage(this.config.redisOptions, this.config.keyPrefix);
      } else {
        return new MemoryStorage(this.config.maxSize);
      }
    } catch (error) {
      this.logError('Storage initialization error:', error);
      this.logError('Falling back to memory storage');
      return new MemoryStorage(this.config.maxSize);
    }
  }

  private initializeSemantic(): void {
    const sem = this.config.semantic;
    this.semanticEnabled = !!sem?.enabled;
    if (!this.semanticEnabled) return;

    this.semanticThreshold = sem.threshold ?? 0.95;
    this.semanticTopK = sem.topK ?? 1;
    this.semanticLogNearMisses = sem.logNearMisses ?? false;
    this.embeddingProvider = sem.provider ?? new LocalEmbeddingProvider({ model: sem.model });
    // Default the vector store to match the cache's storage backend, so a
    // Redis-backed cache keeps semantic vectors on the same single Redis.
    this.vectorStore =
      sem.vectorStore ??
      (this.config.storage === 'redis'
        ? new RedisVectorStore({ redisOptions: this.config.redisOptions })
        : new MemoryVectorStore());
    this.logDebug(
      `Semantic tier enabled (provider=${this.embeddingProvider.id}, threshold=${this.semanticThreshold})`
    );
  }

  /**
   * Pick the text to embed. We embed the last user message only — system
   * prompts and prior history pollute similarity. Falls back sensibly for
   * string prompts and plain objects.
   */
  private extractEmbedText(prompt: any): string | null {
    if (prompt == null) return null;
    if (typeof prompt === 'string') return prompt.trim() || null;

    if (Array.isArray(prompt)) {
      for (let i = prompt.length - 1; i >= 0; i--) {
        const msg = prompt[i];
        if (msg && (msg.role === 'user' || msg.role === undefined)) {
          const text = this.messageContentToText(msg.content ?? msg);
          if (text) return text;
        }
      }
      const last = prompt[prompt.length - 1];
      return last ? this.messageContentToText(last.content ?? last) : null;
    }

    if (typeof prompt === 'object') {
      if (typeof prompt.content === 'string') return prompt.content.trim() || null;
      return JSON.stringify(prompt);
    }
    return String(prompt);
  }

  private messageContentToText(content: any): string | null {
    if (content == null) return null;
    if (typeof content === 'string') return content.trim() || null;
    // OpenAI multimodal: array of parts; concatenate the text parts.
    if (Array.isArray(content)) {
      const parts = content
        .map((p) => (typeof p === 'string' ? p : typeof p?.text === 'string' ? p.text : ''))
        .filter(Boolean);
      const joined = parts.join(' ').trim();
      return joined || null;
    }
    if (typeof content === 'object' && typeof content.text === 'string') {
      return content.text.trim() || null;
    }
    return null;
  }

  private updateSemanticHitStats(entry: CacheEntry): void {
    this.stats.cacheHits++;
    this.stats.semanticHits++;
    this.stats.totalCostSaved += entry.cost;
    this.initializeProviderStats(entry.provider);
    this.stats.byProvider[entry.provider].hits++;
    this.stats.byProvider[entry.provider].costSaved += entry.cost;
    this.updateHitRate();
  }

  private initializeProviderStats(provider: string): void {
    if (!this.stats.byProvider[provider]) {
      this.stats.byProvider[provider] = {
        requests: 0,
        hits: 0,
        costSaved: 0,
      };
    }
  }

  private updateCacheHitStats(entry: CacheEntry): void {
    this.stats.cacheHits++;
    this.stats.totalCostSaved += entry.cost;
    this.stats.byProvider[entry.provider].hits++;
    this.stats.byProvider[entry.provider].costSaved += entry.cost;
    this.updateHitRate();
  }

  private updateHitRate(): void {
    this.stats.hitRate = this.stats.totalRequests > 0 
      ? (this.stats.cacheHits / this.stats.totalRequests) * 100 
      : 0;
  }

  private updateResponseTimeStats(responseTime: number): void {
    const totalRequests = this.stats.totalRequests;
    this.stats.averageResponseTime = totalRequests > 1
      ? (this.stats.averageResponseTime * (totalRequests - 1) + responseTime) / totalRequests
      : responseTime;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private logDebug(message: string, ...args: any[]): void {
    if (this.debug) {
      console.log(`[AIResponseCache] ${message}`, ...args);
    }
  }

  private logError(message: string, error?: any): void {
    console.error(`[AIResponseCache] ${message}`, error);
  }

  // Pattern-based cache invalidation (BRD REQ-004)
  async deleteByPattern(pattern: string): Promise<number> {
    try {
      const keys = await this.storage.keys();
      const matchingKeys = keys.filter(key => {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(key);
      });
      
      let deletedCount = 0;
      for (const key of matchingKeys) {
        const deleted = await this.storage.delete(key);
        if (deleted) deletedCount++;
      }
      
      this.logDebug(`Deleted ${deletedCount} keys matching pattern: ${pattern}`);
      return deletedCount;
    } catch (error) {
      this.logError('Pattern delete error:', error);
      return 0;
    }
  }

  // Disconnect from storage (useful for Redis)
  async disconnect(): Promise<void> {
    try {
      if (this.storage instanceof RedisStorage) {
        await (this.storage as RedisStorage).disconnect();
      }
      // Close the vector store's own connection if it owns one (e.g. RedisVectorStore).
      const vectorStore = this.vectorStore as { disconnect?: () => Promise<void> } | undefined;
      if (vectorStore && typeof vectorStore.disconnect === 'function') {
        await vectorStore.disconnect();
      }
      this.logDebug('Storage disconnected successfully');
    } catch (error) {
      this.logError('Storage disconnect error:', error);
    }
  }

  // Protected method to access storage (replaces @ts-ignore pattern)
  protected getStorageEntry(key: string): Promise<CacheEntry | null> {
    return this.storage.get(key);
  }
}
