import { OpenAICache } from '../../src/providers/openai.js';
import OpenAI from 'openai';

// Mock the entire OpenAI module
jest.mock('openai', () => {
  const mockCreateChatCompletion = jest.fn();
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockCreateChatCompletion,
      },
    },
  }));
});

describe('OpenAICache', () => {
  let openaiCache: OpenAICache;
  let mockOpenAI: jest.Mocked<OpenAI>;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    // Cast the mocked OpenAI to its type for better type safety
    mockOpenAI = new OpenAI() as jest.Mocked<OpenAI>;
    openaiCache = new OpenAICache({ ttl: 1 }, mockOpenAI);
  });

  it('should cache OpenAI chat completion responses', async () => {
    const mockResponse = {
      choices: [{ message: { content: 'Hello from OpenAI!' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    };
    (mockOpenAI.chat.completions.create as jest.Mock).mockResolvedValue(mockResponse);

    const params = {
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'Test prompt' }],
    };

    const result1 = await openaiCache.chatCompletion(params);
    const result2 = await openaiCache.chatCompletion(params);

    expect(result1).toEqual(mockResponse);
    expect(result2).toEqual(mockResponse);
    expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(1);

    const stats = openaiCache.getStats();
    expect(stats.totalRequests).toBe(2);
    expect(stats.cacheHits).toBe(1);
    expect(stats.cacheMisses).toBe(1);
    expect(stats.totalCostSaved).toBeGreaterThan(0);
  });

  it('should generate correct cache key for OpenAI', async () => {
    const mockResponse = {
      choices: [{ message: { content: 'Hello from OpenAI!' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    };
    (mockOpenAI.chat.completions.create as jest.Mock).mockResolvedValue(mockResponse);

    const params1 = {
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'Test prompt 1' }],
      temperature: 0.7,
    };

    const params2 = {
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'Test prompt 2' }],
      temperature: 0.7,
    };

    await openaiCache.chatCompletion(params1);
    await openaiCache.chatCompletion(params2);

    expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(2);
    const stats = openaiCache.getStats();
    expect(stats.cacheHits).toBe(0);
  });

  it('should handle different models correctly', async () => {
    const mockResponse1 = {
      choices: [{ message: { content: 'Response 1' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    };
    const mockResponse2 = {
      choices: [{ message: { content: 'Response 2' } }],
      usage: { prompt_tokens: 12, completion_tokens: 6, total_tokens: 18 },
    };

    (mockOpenAI.chat.completions.create as jest.Mock)
      .mockResolvedValueOnce(mockResponse1)
      .mockResolvedValueOnce(mockResponse2);

    const params1 = {
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'Prompt' }],
    };
    const params2 = {
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Prompt' }],
    };

    await openaiCache.chatCompletion(params1);
    await openaiCache.chatCompletion(params2);

    expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(2);
    const stats = openaiCache.getStats();
    expect(stats.cacheHits).toBe(0);
  });
});
