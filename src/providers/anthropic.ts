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
        const entry = this.getCacheEntry(super.generateKey('anthropic', model, messages, rest));
        if (entry) {
          const pricing = ANTHROPIC_PRICING[model];
          if (pricing) {
            entry.tokenCount = response.usage.input_tokens + response.usage.output_tokens;
            entry.cost = response.usage.input_tokens * pricing.input + response.usage.output_tokens * pricing.output;
          }
        }
        return response;
      },
      {
        provider: 'anthropic',
        model,
        prompt: messages,
        params: rest,
      }
    );
  }

  private getCacheEntry(key: string) {
    // @ts-ignore
    return this.cache.get(key);
  }
}
