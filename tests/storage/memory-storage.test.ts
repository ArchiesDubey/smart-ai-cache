import { MemoryStorage } from '../../src/storage/memory-storage.js';
import { CacheEntry } from '../../src/core/types.js';

describe('MemoryStorage', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage(3); // Small max size for testing eviction
  });

  it('should store and retrieve cache entries', async () => {
    const entry: CacheEntry = {
      key: 'test-key',
      value: 'test-value',
      timestamp: Date.now(),
      ttl: 3600,
      provider: 'test',
      model: 'test-model',
      tokenCount: 100,
      cost: 0.01,
    };

    await storage.set('test-key', entry);
    const retrieved = await storage.get('test-key');

    expect(retrieved).toEqual(entry);
  });

  it('should return null for non-existent keys', async () => {
    const result = await storage.get('non-existent');
    expect(result).toBeNull();
  });

  it('should handle TTL expiration', async () => {
    const entry: CacheEntry = {
      key: 'test-key',
      value: 'test-value',
      timestamp: Date.now() - 7200 * 1000, // 2 hours ago
      ttl: 3600, // 1 hour TTL
      provider: 'test',
      model: 'test-model',
      tokenCount: 100,
      cost: 0.01,
    };

    await storage.set('test-key', entry);
    const retrieved = await storage.get('test-key');

    expect(retrieved).toBeNull();
  });

  it('should delete entries', async () => {
    const entry: CacheEntry = {
      key: 'test-key',
      value: 'test-value',
      timestamp: Date.now(),
      ttl: 3600,
      provider: 'test',
      model: 'test-model',
      tokenCount: 100,
      cost: 0.01,
    };

    await storage.set('test-key', entry);
    const deleted = await storage.delete('test-key');
    const retrieved = await storage.get('test-key');

    expect(deleted).toBe(true);
    expect(retrieved).toBeNull();
  });

  it('should clear all entries', async () => {
    const entry1: CacheEntry = {
      key: 'key1',
      value: 'value1',
      timestamp: Date.now(),
      ttl: 3600,
      provider: 'test',
      model: 'test-model',
      tokenCount: 100,
      cost: 0.01,
    };

    const entry2: CacheEntry = {
      key: 'key2',
      value: 'value2',
      timestamp: Date.now(),
      ttl: 3600,
      provider: 'test',
      model: 'test-model',
      tokenCount: 100,
      cost: 0.01,
    };

    await storage.set('key1', entry1);
    await storage.set('key2', entry2);
    
    expect(await storage.size()).toBe(2);
    
    await storage.clear();
    
    expect(await storage.size()).toBe(0);
  });

  it('should implement LRU eviction when max size is exceeded', async () => {
    // Add 3 entries (at max capacity)
    for (let i = 1; i <= 3; i++) {
      const entry: CacheEntry = {
        key: `key${i}`,
        value: `value${i}`,
        timestamp: Date.now() - (3 - i) * 1000, // Different timestamps
        ttl: 3600,
        provider: 'test',
        model: 'test-model',
        tokenCount: 100,
        cost: 0.01,
      };
      await storage.set(`key${i}`, entry);
    }

    expect(await storage.size()).toBe(3);

    // Add one more entry, should evict oldest (key1)
    const newEntry: CacheEntry = {
      key: 'key4',
      value: 'value4',
      timestamp: Date.now(),
      ttl: 3600,
      provider: 'test',
      model: 'test-model',
      tokenCount: 100,
      cost: 0.01,
    };
    await storage.set('key4', newEntry);

    expect(await storage.size()).toBe(3);
    expect(await storage.get('key1')).toBeNull(); // Oldest should be evicted
    expect(await storage.get('key2')).not.toBeNull();
    expect(await storage.get('key3')).not.toBeNull();
    expect(await storage.get('key4')).not.toBeNull();
  });

  it('should return correct keys', async () => {
    const entry1: CacheEntry = {
      key: 'key1',
      value: 'value1',
      timestamp: Date.now(),
      ttl: 3600,
      provider: 'test',
      model: 'test-model',
      tokenCount: 100,
      cost: 0.01,
    };

    const entry2: CacheEntry = {
      key: 'key2',
      value: 'value2',
      timestamp: Date.now(),
      ttl: 3600,
      provider: 'test',
      model: 'test-model',
      tokenCount: 100,
      cost: 0.01,
    };

    await storage.set('key1', entry1);
    await storage.set('key2', entry2);

    const keys = await storage.keys();
    expect(keys.sort()).toEqual(['key1', 'key2']);
  });
});