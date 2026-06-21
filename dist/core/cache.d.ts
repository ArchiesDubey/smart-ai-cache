import { CacheConfig, CacheEntry, CacheStats } from './types.js';
export declare class AIResponseCache {
    private storage;
    private config;
    private stats;
    private debug;
    private semanticEnabled;
    private embeddingProvider;
    private vectorStore;
    private semanticThreshold;
    private semanticTopK;
    private semanticLogNearMisses;
    constructor(config?: CacheConfig);
    wrap<T>(fn: () => Promise<{
        value: T;
        tokenCount?: number;
        cost?: number;
    }>, options: {
        provider: string;
        model: string;
        cacheKey?: string;
        ttl?: number;
        prompt?: any;
        params?: any;
        /** Per-call semantic overrides (e.g. a looser/tighter threshold for one route). */
        semantic?: {
            enabled?: boolean;
            threshold?: number;
        };
    }): Promise<T>;
    getStats(): CacheStats;
    resetStats(): CacheStats;
    clear(): Promise<void>;
    delete(key: string): Promise<boolean>;
    has(key: string): Promise<boolean>;
    generateKey(provider: string, model: string, prompt: any, params: any): string;
    getCacheSize(): Promise<number>;
    private validateAndMergeConfig;
    private validateWrapOptions;
    private initializeStorage;
    private initializeSemantic;
    /**
     * Pick the text to embed. We embed the last user message only — system
     * prompts and prior history pollute similarity. Falls back sensibly for
     * string prompts and plain objects.
     */
    private extractEmbedText;
    private messageContentToText;
    private updateSemanticHitStats;
    private initializeProviderStats;
    private updateCacheHitStats;
    private updateHitRate;
    private updateResponseTimeStats;
    private sleep;
    private logDebug;
    private logError;
    deleteByPattern(pattern: string): Promise<number>;
    disconnect(): Promise<void>;
    protected getStorageEntry(key: string): Promise<CacheEntry | null>;
}
