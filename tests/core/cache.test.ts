import { AIResponseCache } from '../../src/core/cache.js';

describe('AIResponseCache', () => {
  let cache: AIResponseCache;

  beforeEach(() => {
    cache = new AIResponseCache({ ttl: 1, storage: 'memory' });
  });

  afterEach(async () => {
    await cache.clear();
    await cache.disconnect();
  });

  it('should cache a response', async () => {
    const fn = jest.fn().mockResolvedValue({ value: 'response', tokenCount: 0, cost: 0 });
    const result1 = await cache.wrap(fn, { provider: 'test', model: 'test-model' });
    const result2 = await cache.wrap(fn, { provider: 'test', model: 'test-model' });

    expect(result1).toBe('response');
    expect(result2).toBe('response');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should not use cache for different prompts', async () => {
    const fn = jest.fn().mockResolvedValue({ value: 'response', tokenCount: 0, cost: 0 });
    await cache.wrap(fn, { provider: 'test', model: 'test-model', prompt: 'prompt1' });
    await cache.wrap(fn, { provider: 'test', model: 'test-model', prompt: 'prompt2' });

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should respect TTL', async () => {
    const fn = jest.fn().mockResolvedValue({ value: 'response', tokenCount: 0, cost: 0 });
    await cache.wrap(fn, { provider: 'test', model: 'test-model' });

    await new Promise(resolve => setTimeout(resolve, 1500));

    await cache.wrap(fn, { provider: 'test', model: 'test-model' });

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should correctly report stats', async () => {
    const fn = jest.fn().mockResolvedValue({ value: 'response', tokenCount: 0, cost: 0 });
    await cache.wrap(fn, { provider: 'test', model: 'test-model' });
    await cache.wrap(fn, { provider: 'test', model: 'test-model' });

    const stats = cache.getStats();
    expect(stats.totalRequests).toBe(2);
    expect(stats.cacheHits).toBe(1);
    expect(stats.cacheMisses).toBe(1);
    expect(stats.hitRate).toBe(50);
  });

  it('should validate configuration parameters', () => {
    expect(() => new AIResponseCache({ ttl: -1 })).toThrow('TTL must be positive');
    expect(() => new AIResponseCache({ maxSize: 0 })).toThrow('Max size must be positive');
    expect(() => new AIResponseCache({ storage: 'invalid' as any })).toThrow('Storage must be either "memory" or "redis"');
  });

  it('should validate wrap options', async () => {
    const fn = jest.fn().mockResolvedValue({ value: 'response', tokenCount: 0, cost: 0 });
    
    await expect(cache.wrap(fn, { provider: '', model: 'test-model' })).rejects.toThrow('Provider is required and must be a string');
    await expect(cache.wrap(fn, { provider: 'test', model: '' })).rejects.toThrow('Model is required and must be a string');
    await expect(cache.wrap(fn, { provider: 'test', model: 'test-model', ttl: -1 })).rejects.toThrow('TTL must be a positive number');
  });

  it('should handle API call errors with retry logic', async () => {
    // Create cache with debug mode for faster backoff
    const fastCache = new AIResponseCache({ ttl: 1, storage: 'memory', debug: true });
    
    // Mock console.error to reduce noise in tests
    const originalConsoleError = console.error;
    console.error = jest.fn();

    let callCount = 0;
    const fn = jest.fn().mockImplementation(() => {
      callCount++;
      if (callCount < 3) {
        return Promise.reject(new Error('API error'));
      }
      return Promise.resolve({ value: 'success', tokenCount: 0, cost: 0 });
    });

    const result = await fastCache.wrap(fn, { provider: 'test', model: 'test-model' });
    
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3); // 2 retries + 1 success

    // Restore console.error
    console.error = originalConsoleError;
    await fastCache.disconnect();
  });

  it('should fail after max retries', async () => {
    // Create cache with debug mode for faster backoff
    const fastCache = new AIResponseCache({ ttl: 1, storage: 'memory', debug: true });
    
    // Mock console.error to reduce noise in tests
    const originalConsoleError = console.error;
    console.error = jest.fn();

    const fn = jest.fn().mockRejectedValue(new Error('Persistent API error'));

    await expect(fastCache.wrap(fn, { provider: 'test', model: 'test-model' })).rejects.toThrow('Persistent API error');
    expect(fn).toHaveBeenCalledTimes(3); // Max retries

    // Restore console.error
    console.error = originalConsoleError;
    await fastCache.disconnect();
  });

  it('should support pattern-based cache invalidation', async () => {
    const fn = jest.fn().mockResolvedValue({ value: 'response', tokenCount: 0, cost: 0 });
    
    // Cache some entries
    await cache.wrap(fn, { provider: 'openai', model: 'gpt-4', prompt: 'test1' });
    await cache.wrap(fn, { provider: 'openai', model: 'gpt-3.5', prompt: 'test2' });
    await cache.wrap(fn, { provider: 'anthropic', model: 'claude-3', prompt: 'test3' });

    expect(await cache.getCacheSize()).toBe(3);

    // Delete by pattern - should match openai entries
    const deletedCount = await cache.deleteByPattern('*openai*');
    
    expect(deletedCount).toBe(2);
    expect(await cache.getCacheSize()).toBe(1);
  });

  it('should handle cache storage errors gracefully', async () => {
    // Mock console.error to reduce noise in tests
    const originalConsoleError = console.error;
    console.error = jest.fn();

    // Create a cache that will fail during storage operations
    const cacheWithRedis = new AIResponseCache({ 
      storage: 'redis', 
      redisOptions: { 
        host: 'invalid-host', 
        port: 9999, 
        connectTimeout: 50,
        lazyConnect: true,
        maxRetriesPerRequest: 0
      }
    });

    const fn = jest.fn().mockResolvedValue({ value: 'response', tokenCount: 0, cost: 0 });
    
    // Should not throw, just continue with API call
    const result = await cacheWithRedis.wrap(fn, { provider: 'test', model: 'test-model' });
    
    expect(result).toBe('response');
    expect(fn).toHaveBeenCalledTimes(1);
    
    await cacheWithRedis.disconnect();

    // Restore console.error
    console.error = originalConsoleError;
  }, 5000);

  it('should clear cache', async () => {
    const fn = jest.fn().mockResolvedValue({ value: 'response', tokenCount: 0, cost: 0 });
    await cache.wrap(fn, { provider: 'test', model: 'test-model' });

    expect(await cache.getCacheSize()).toBe(1);
    
    await cache.clear();
    
    expect(await cache.getCacheSize()).toBe(0);
  });

  it('should delete specific cache entries', async () => {
    const fn = jest.fn().mockResolvedValue({ value: 'response', tokenCount: 0, cost: 0 });
    await cache.wrap(fn, { provider: 'test', model: 'test-model' });

    const key = cache.generateKey('test', 'test-model', undefined, undefined);
    
    expect(await cache.has(key)).toBe(true);
    
    const deleted = await cache.delete(key);
    
    expect(deleted).toBe(true);
    expect(await cache.has(key)).toBe(false);
  });

  it('should handle Redis configuration errors and fallback to memory', () => {
    // This should create a cache that falls back to memory storage
    const cacheWithBadRedis = new AIResponseCache({ 
      storage: 'redis',
      // Missing redisOptions should cause fallback
    });
    
    // Should not throw, just fallback to memory storage
    expect(cacheWithBadRedis).toBeDefined();
  });

  it('should handle provider stats initialization correctly', async () => {
    const fn1 = jest.fn().mockResolvedValue({ value: 'response1', tokenCount: 10, cost: 0.01 });
    const fn2 = jest.fn().mockResolvedValue({ value: 'response2', tokenCount: 15, cost: 0.02 });
    
    await cache.wrap(fn1, { provider: 'provider1', model: 'model1' });
    await cache.wrap(fn2, { provider: 'provider2', model: 'model1' });
    
    const stats = cache.getStats();
    expect(stats.byProvider.provider1).toBeDefined();
    expect(stats.byProvider.provider2).toBeDefined();
    expect(stats.byProvider.provider1.requests).toBe(1);
    expect(stats.byProvider.provider2.requests).toBe(1);
  });

  it('should calculate stats correctly with costs', async () => {
    const fn = jest.fn().mockResolvedValue({ value: 'response', tokenCount: 100, cost: 0.05 });
    
    // First call - cache miss
    await cache.wrap(fn, { provider: 'test', model: 'test-model' });
    // Second call - cache hit
    await cache.wrap(fn, { provider: 'test', model: 'test-model' });
    
    const stats = cache.getStats();
    expect(stats.totalCostSaved).toBe(0.05); // Cost saved from cache hit
    expect(stats.byProvider.test.costSaved).toBe(0.05);
  });

  it('should handle empty redisOptions validation and fallback to memory', () => {
    // Mock console.error to reduce noise in tests
    const originalConsoleError = console.error;
    console.error = jest.fn();

    // Should create cache successfully but fall back to memory storage
    const cacheWithEmptyRedis = new AIResponseCache({ 
      storage: 'redis', 
      redisOptions: {} 
    });
    
    expect(cacheWithEmptyRedis).toBeDefined();
    expect(console.error).toHaveBeenCalledWith(
      '[AIResponseCache] Redis options are required when using Redis storage', 
      undefined
    );

    // Restore console.error
    console.error = originalConsoleError;
  });
});
