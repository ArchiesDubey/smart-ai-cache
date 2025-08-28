import OpenAI from 'openai';
import { AIResponseCache } from '../core/cache.js';
import { CacheConfig } from '../core/types.js';

// Placeholder for actual pricing data
const OPENAI_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4': { input: 0.03 / 1000, output: 0.06 / 1000 },
  'gpt-3.5-turbo': { input: 0.0015 / 1000, output: 0.002 / 1000 },
};

export class OpenAICache extends AIResponseCache {
  private openai: OpenAI;

  constructor(config?: CacheConfig, openaiOptions?: ConstructorParameters<typeof OpenAI>[0]) {
    super(config);
    this.openai = new OpenAI(openaiOptions);
  }

  async chatCompletion(
    params: OpenAI.ChatCompletionCreateParamsNonStreaming
  ): Promise<OpenAI.ChatCompletion> {
    const { model, messages, ...rest } = params;

    return super.wrap(
      async () => {
        const response = await this.openai.chat.completions.create(params) as OpenAI.ChatCompletion;
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
      },
      {
        provider: 'openai',
        model,
        prompt: messages,
        params: rest,
      }
    );
  }

  // Use the protected method to access storage entries
  protected async getCacheEntry(key: string) {
    return this.getStorageEntry(key);
  }
}
