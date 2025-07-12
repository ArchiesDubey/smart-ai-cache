import { AIResponseCache } from '../../src/core/cache.js';

describe('AIResponseCache', () => {
  let cache: AIResponseCache;

  beforeEach(() => {
    cache = new AIResponseCache({ ttl: 1 });
  });

  it('should cache a response', async () => {
    const fn = jest.fn().mockResolvedValue('response');
    const result1 = await cache.wrap(fn, { provider: 'test', model: 'test-model' });
    const result2 = await cache.wrap(fn, { provider: 'test', model: 'test-model' });

    expect(result1).toBe('response');
    expect(result2).toBe('response');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should not use cache for different prompts', async () => {
    const fn = jest.fn().mockResolvedValue('response');
    await cache.wrap(fn, { provider: 'test', model: 'test-model', prompt: 'prompt1' });
    await cache.wrap(fn, { provider: 'test', model: 'test-model', prompt: 'prompt2' });

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should respect TTL', async () => {
    const fn = jest.fn().mockResolvedValue('response');
    await cache.wrap(fn, { provider: 'test', model: 'test-model' });

    await new Promise(resolve => setTimeout(resolve, 1500));

    await cache.wrap(fn, { provider: 'test', model: 'test-model' });

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should correctly report stats', async () => {
    const fn = jest.fn().mockResolvedValue('response');
    await cache.wrap(fn, { provider: 'test', model: 'test-model' });
    await cache.wrap(fn, { provider: 'test', model: 'test-model' });

    const stats = cache.getStats();
    expect(stats.totalRequests).toBe(2);
    expect(stats.cacheHits).toBe(1);
    expect(stats.cacheMisses).toBe(1);
    expect(stats.hitRate).toBe(50);
  });
});
