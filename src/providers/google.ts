import { GoogleGenerativeAI, GenerateContentRequest, GenerateContentResult } from '@google/generative-ai';
import { AIResponseCache } from '../core/cache.js';
import { CacheConfig } from '../core/types.js';

const GOOGLE_PRICING: Record<string, { input: number; output: number }> = {
    'gemini-pro': { input: 0.000125 / 1000, output: 0.000375 / 1000 },
};

export class GoogleCache extends AIResponseCache {
  private googleAI: GoogleGenerativeAI;

  constructor(config?: CacheConfig, apiKey?: string) {
    super(config);
    this.googleAI = new GoogleGenerativeAI(apiKey || process.env.GOOGLE_API_KEY || '');
  }

  async generateContent(
    params: GenerateContentRequest,
    modelName: string = 'gemini-pro'
  ): Promise<GenerateContentResult> {
    const { contents, ...rest } = params;
    const generativeModel = this.googleAI.getGenerativeModel({ model: modelName });

    return super.wrap(
      async () => {
        const response = await generativeModel.generateContent(params);
        const entry = this.getCacheEntry(super.generateKey('google', modelName, contents, rest));
        // Note: Google's SDK does not provide token usage directly in the response.
        // A separate call to countTokens would be needed, which adds latency.
        // For this MVP, we will not implement cost calculation for Google models.
        return response;
      },
      {
        provider: 'google',
        model: modelName,
        prompt: contents,
        params: rest,
      }
    );
  }

  private getCacheEntry(key: string) {
    // @ts-ignore
    return this.cache.get(key);
  }
}
