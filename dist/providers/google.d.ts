import { GenerateContentRequest, GenerateContentResult } from '@google/generative-ai';
import { AIResponseCache } from '../core/cache.js';
import { CacheConfig } from '../core/types.js';
export declare class GoogleCache extends AIResponseCache {
    private googleAI;
    constructor(config?: CacheConfig, apiKey?: string);
    generateContent(params: GenerateContentRequest, modelName?: string): Promise<GenerateContentResult>;
    protected getCacheEntry(key: string): Promise<import("../core/types.js").CacheEntry | null>;
}
