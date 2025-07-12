import OpenAI from 'openai';
import { AIResponseCache } from '../core/cache.js';
// Placeholder for actual pricing data
const OPENAI_PRICING = {
    'gpt-4': { input: 0.03 / 1000, output: 0.06 / 1000 },
    'gpt-3.5-turbo': { input: 0.0015 / 1000, output: 0.002 / 1000 },
};
export class OpenAICache extends AIResponseCache {
    constructor(config, openaiOptions) {
        super(config);
        this.openai = new OpenAI(openaiOptions);
    }
    async chatCompletion(params) {
        const { model, messages, ...rest } = params;
        return super.wrap(async () => {
            const response = await this.openai.chat.completions.create(params);
            const entry = this.getCacheEntry(super.generateKey('openai', model, messages, rest));
            if (entry && response.usage) {
                const pricing = OPENAI_PRICING[model];
                if (pricing) {
                    entry.tokenCount = response.usage.total_tokens;
                    entry.cost = response.usage.prompt_tokens * pricing.input + response.usage.completion_tokens * pricing.output;
                }
            }
            return response;
        }, {
            provider: 'openai',
            model,
            prompt: messages,
            params: rest,
        });
    }
    // A private helper to get a cache entry. This is a bit of a hack, but it's necessary
    // to update the entry with token and cost information after the API call.
    getCacheEntry(key) {
        // @ts-ignore - accessing private member for internal use
        return this.cache.get(key);
    }
}
