import { CacheConfig, CacheEntry, CacheStats } from './types.js';
import { DEFAULT_CACHE_CONFIG } from './constants.js';
import { generateHashedKeyForPayload } from '../utils/key-generator.js';

export class AIResponseCache {
  private cache = new Map<string, CacheEntry>();
  private config: Required<CacheConfig>;
  private stats: CacheStats;

  constructor(config?: CacheConfig) {
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config };
    this.stats = this.resetStats();
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
    }
  ): Promise<T> {
    const startTime = Date.now();
    this.stats.totalRequests++;

    const key = options.cacheKey || this.generateKey(options.provider, options.model, options.prompt, options.params);

    if (this.has(key)) {
      const entry = this.cache.get(key)!;
      if (Date.now() < entry.timestamp + entry.ttl * 1000) {
        this.stats.cacheHits++;
        this.stats.hitRate = (this.stats.cacheHits / this.stats.totalRequests) * 100;
        this.stats.totalCostSaved += entry.cost;
        if (this.stats.byProvider[entry.provider]) {
            this.stats.byProvider[entry.provider].hits++;
            this.stats.byProvider[entry.provider].costSaved += entry.cost;
        }
        return entry.value;
      }
    }

    this.stats.cacheMisses++;
    this.stats.hitRate = (this.stats.cacheHits / this.stats.totalRequests) * 100;
    const { value, tokenCount = 0, cost = 0 } = await fn();
    const endTime = Date.now();
    this.stats.averageResponseTime = (this.stats.averageResponseTime * (this.stats.totalRequests - 1) + (endTime - startTime)) / this.stats.totalRequests;

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

    this.cache.set(key, newEntry);

    if (this.cache.size > this.config.maxSize) {
      this.evict();
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
      hitRate: 0,
      totalCostSaved: 0,
      averageResponseTime: 0,
      lastResetTime: new Date(),
      byProvider: {},
    };
    return this.stats;
  }

  clear(): void {
    this.cache.clear();
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  generateKey(provider: string, model: string, prompt: any, params: any): string {
    const promptHash = generateHashedKeyForPayload(prompt);
    const paramsHash = generateHashedKeyForPayload(params);
    return `${this.config.keyPrefix}${provider}:${model}:${promptHash}:${paramsHash}`;
  }

  getCacheSize(): number {
    return this.cache.size;
  }

  private evict(): void {
    // LRU eviction
    let oldestKey: string | undefined;
    let oldestTimestamp = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }
}
