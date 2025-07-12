import { AnthropicCache } from '../../src/providers/anthropic.js';
import Anthropic from '@anthropic-ai/sdk';

// Mock the entire Anthropic module
jest.mock('@anthropic-ai/sdk', () => {
  const mockCreateMessages = jest.fn();
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: mockCreateMessages,
    },
  }));
});

describe('AnthropicCache', () => {
  let anthropicCache: AnthropicCache;
  let mockAnthropic: jest.Mocked<Anthropic>;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    // Cast the mocked Anthropic to its type for better type safety
    mockAnthropic = new Anthropic() as jest.Mocked<Anthropic>;
    anthropicCache = new AnthropicCache({ ttl: 1 }, mockAnthropic);
  });

  it('should cache Anthropic messages responses', async () => {
    const mockResponse = {
      content: [{ type: 'text', text: 'Hello from Anthropic!' }],
      usage: { input_tokens: 10, output_tokens: 5 },
    };
    (mockAnthropic.messages.create as jest.Mock).mockResolvedValue(mockResponse);

    const params = {
      model: 'claude-3-sonnet-20240229',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'Test prompt' }],
    };

    const result1 = await anthropicCache.messages(params);
    const result2 = await anthropicCache.messages(params);

    expect(result1).toEqual(mockResponse);
    expect(result2).toEqual(mockResponse);
    expect(mockAnthropic.messages.create).toHaveBeenCalledTimes(1);

    const stats = anthropicCache.getStats();
    expect(stats.totalRequests).toBe(2);
    expect(stats.cacheHits).toBe(1);
    expect(stats.cacheMisses).toBe(1);
    expect(stats.totalCostSaved).toBeGreaterThan(0);
  });

  it('should generate correct cache key for Anthropic', async () => {
    const mockResponse = {
      content: [{ type: 'text', text: 'Hello from Anthropic!' }],
      usage: { input_tokens: 10, output_tokens: 5 },
    };
    (mockAnthropic.messages.create as jest.Mock).mockResolvedValue(mockResponse);

    const params1 = {
      model: 'claude-3-sonnet-20240229',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'Test prompt 1' }],
    };

    const params2 = {
      model: 'claude-3-sonnet-20240229',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'Test prompt 2' }],
    };

    await anthropicCache.messages(params1);
    await anthropicCache.messages(params2);

    expect(mockAnthropic.messages.create).toHaveBeenCalledTimes(2);
    const stats = anthropicCache.getStats();
    expect(stats.cacheHits).toBe(0);
  });
});
