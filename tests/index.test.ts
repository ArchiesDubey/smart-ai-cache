import * as index from '../src/index.js';

describe('Package exports', () => {
  it('should export all expected classes and types', () => {
    // Test that all main exports are available
    expect(index.AIResponseCache).toBeDefined();
    expect(index.OpenAICache).toBeDefined();
    expect(index.AnthropicCache).toBeDefined();
    expect(index.GoogleCache).toBeDefined();
    expect(index.MemoryStorage).toBeDefined();
    expect(index.RedisStorage).toBeDefined();
  });

  it('should allow instantiation of exported classes', () => {
    // Test basic instantiation
    const cache = new index.AIResponseCache();
    const memoryStorage = new index.MemoryStorage();
    
    expect(cache).toBeInstanceOf(index.AIResponseCache);
    expect(memoryStorage).toBeInstanceOf(index.MemoryStorage);
  });
});