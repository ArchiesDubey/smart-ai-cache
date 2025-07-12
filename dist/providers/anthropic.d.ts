import Anthropic from '@anthropic-ai/sdk';
import { AIResponseCache } from '../core/cache.js';
import { CacheConfig } from '../core/types.js';
export declare class AnthropicCache extends AIResponseCache {
    private anthropic;
    constructor(config?: CacheConfig, anthropicOptions?: ConstructorParameters<typeof Anthropic>[0]);
    messages(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>;
    private getCacheEntry;
}
