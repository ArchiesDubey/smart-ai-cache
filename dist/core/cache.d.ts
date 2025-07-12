import { CacheConfig, CacheStats } from './types.js';
export declare class AIResponseCache {
    private cache;
    private config;
    private stats;
    constructor(config?: CacheConfig);
    wrap<T>(fn: () => Promise<T>, options: {
        provider: string;
        model: string;
        cacheKey?: string;
        ttl?: number;
        prompt?: any;
        params?: any;
    }): Promise<T>;
    getStats(): CacheStats;
    resetStats(): CacheStats;
    clear(): void;
    delete(key: string): boolean;
    has(key: string): boolean;
    generateKey(provider: string, model: string, prompt: any, params: any): string;
    getCacheSize(): number;
    private evict;
}
