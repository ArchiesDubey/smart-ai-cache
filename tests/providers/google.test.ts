import { GoogleCache } from '../../src/providers/google.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

describe('GoogleCache', () => {
  let googleCache: GoogleCache;
  let mockGenerateContent: jest.Mock;

  beforeEach(() => {
    mockGenerateContent = jest.fn();
    const mockGetGenerativeModel = jest.fn(() => ({
      generateContent: mockGenerateContent,
    }));

    const mockGoogleAI = {
      getGenerativeModel: mockGetGenerativeModel,
    } as any; // Mock the GoogleGenerativeAI client

    googleCache = new GoogleCache({ ttl: 1 }, 'mock-api-key');
    // @ts-ignore - Inject mock for testing private property
    googleCache.googleAI = mockGoogleAI;
  });

  it('should cache Google generateContent responses', async () => {
    const mockResponse = {
      response: {
        text: () => 'Hello from Google!',
      },
    };
    mockGenerateContent.mockResolvedValue(mockResponse);

    const params = {
      model: 'gemini-pro',
      contents: [{ role: 'user', parts: [{ text: 'Test prompt' }] }],
    };

    const result1 = await googleCache.generateContent(params);
    const result2 = await googleCache.generateContent(params);

    expect(result1).toEqual(mockResponse);
    expect(result2).toEqual(mockResponse);
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);

    const stats = googleCache.getStats();
    expect(stats.totalRequests).toBe(2);
    expect(stats.cacheHits).toBe(1);
    expect(stats.cacheMisses).toBe(1);
    // Cost saving for Google models is not implemented in MVP, so it should be 0
    expect(stats.totalCostSaved).toBe(0);
  });

  it('should generate correct cache key for Google', async () => {
    const mockResponse = {
      response: {
        text: () => 'Hello from Google!',
      },
    };
    mockGenerateContent.mockResolvedValue(mockResponse);

    const params1 = {
      model: 'gemini-pro',
      contents: [{ role: 'user', parts: [{ text: 'Test prompt 1' }] }],
    };

    const params2 = {
      model: 'gemini-pro',
      contents: [{ role: 'user', parts: [{ text: 'Test prompt 2' }] }],
    };

    await googleCache.generateContent(params1);
    await googleCache.generateContent(params2);

    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    const stats = googleCache.getStats();
    expect(stats.cacheHits).toBe(0);
  });
});