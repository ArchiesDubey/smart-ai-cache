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
            let tokenCount = 0;
            let cost = 0;
            if (response.usage) {
                const pricing = OPENAI_PRICING[model];
                if (pricing) {
                    tokenCount = response.usage.total_tokens;
                    cost = response.usage.prompt_tokens * pricing.input + response.usage.completion_tokens * pricing.output;
                }
            }
            return { value: response, tokenCount, cost };
        }, {
            provider: 'openai',
            model,
            prompt: messages,
            params: rest,
        });
    }
    // Use the protected method to access storage entries
    async getCacheEntry(key) {
        return this.getStorageEntry(key);
    }
}
