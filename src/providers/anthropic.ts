import Anthropic from '@anthropic-ai/sdk';
import { AIResponseCache } from '../core/cache.js';
import { CacheConfig } from '../core/types.js';

const ANTHROPIC_PRICING: Record<string, { input: number; output: number }> = {
  'claude-3-opus-20240229': { input: 15 / 1_000_000, output: 75 / 1_000_000 },
  'claude-3-sonnet-20240229': { input: 3 / 1_000_000, output: 15 / 1_000_000 },
};

export class AnthropicCache extends AIResponseCache {
  private anthropic: Anthropic;

  constructor(config?: CacheConfig, anthropicOptions?: ConstructorParameters<typeof Anthropic>[0]) {
    super(config);
    this.anthropic = new Anthropic(anthropicOptions);
  }

  async messages(
    params: Anthropic.MessageCreateParamsNonStreaming
  ): Promise<Anthropic.Message> {
    const { model, messages, ...rest } = params;

    return super.wrap(
      async () => {
        const response = await this.anthropic.messages.create(params) as Anthropic.Message;
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
      },
      {
        provider: 'anthropic',
        model,
        prompt: messages,
        params: rest,
      }
    );
  }

  protected async getCacheEntry(key: string) {
    return this.getStorageEntry(key);
  }
}
