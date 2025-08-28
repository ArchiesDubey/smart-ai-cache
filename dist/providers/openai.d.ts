import OpenAI from 'openai';
import { AIResponseCache } from '../core/cache.js';
import { CacheConfig } from '../core/types.js';
export declare class OpenAICache extends AIResponseCache {
    private openai;
    constructor(config?: CacheConfig, openaiOptions?: ConstructorParameters<typeof OpenAI>[0]);
    chatCompletion(params: OpenAI.ChatCompletionCreateParamsNonStreaming): Promise<OpenAI.ChatCompletion>;
    protected getCacheEntry(key: string): Promise<import("../core/types.js").CacheEntry | null>;
}
