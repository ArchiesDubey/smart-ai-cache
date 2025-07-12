import { RedisOptions } from 'ioredis';
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
export interface CacheConfig {
    ttl?: number;
    maxSize?: number;
    storage?: 'memory' | 'redis';
    redisOptions?: RedisOptions;
    keyPrefix?: string;
    enableStats?: boolean;
    debug?: boolean;
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
