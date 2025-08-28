import Anthropic from '@anthropic-ai/sdk';
import { AIResponseCache } from '../core/cache.js';
const ANTHROPIC_PRICING = {
    'claude-3-opus-20240229': { input: 15 / 1000000, output: 75 / 1000000 },
    'claude-3-sonnet-20240229': { input: 3 / 1000000, output: 15 / 1000000 },
};
export class AnthropicCache extends AIResponseCache {
    constructor(config, anthropicOptions) {
        super(config);
        this.anthropic = new Anthropic(anthropicOptions);
    }
    async messages(params) {
        const { model, messages, ...rest } = params;
        return super.wrap(async () => {
            const response = await this.anthropic.messages.create(params);
            let tokenCount = 0;
            let cost = 0;
            if (response.usage) {
                const pricing = ANTHROPIC_PRICING[model];
                if (pricing) {
                    tokenCount = response.usage.input_tokens + response.usage.output_tokens;
                    cost = response.usage.input_tokens * pricing.input + response.usage.output_tokens * pricing.output;
                }
            }
            return { value: response, tokenCount, cost };
        }, {
            provider: 'anthropic',
            model,
            prompt: messages,
            params: rest,
        });
    }
    async getCacheEntry(key) {
        return this.getStorageEntry(key);
    }
}
