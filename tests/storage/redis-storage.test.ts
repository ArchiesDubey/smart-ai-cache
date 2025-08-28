import { RedisStorage } from '../../src/storage/redis-storage.js';
import { CacheEntry } from '../../src/core/types.js';

// Mock ioredis
jest.mock('ioredis', () => {
  const mockRedis = {
    get: jest.fn(),
    setex: jest.fn(),
    del: jest.fn(),
    keys: jest.fn(),
    exists: jest.fn(),
    quit: jest.fn(),
    on: jest.fn(),
  };
  
  return {
    Redis: jest.fn(() => mockRedis),
  };
});

import { Redis } from 'ioredis';

describe('RedisStorage', () => {
  let storage: RedisStorage;
  let mockRedis: jest.Mocked<Redis>;

  beforeEach(() => {
    jest.clearAllMocks();
    // Get the mock instance
    mockRedis = new Redis() as jest.Mocked<Redis>;
    storage = new RedisStorage({ host: 'localhost', port: 6379 }, 'test:');
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

    mockRedis.get.mockResolvedValue(JSON.stringify(entry));
    
    await storage.set('test-key', entry);
    const retrieved = await storage.get('test-key');

    expect(mockRedis.setex).toHaveBeenCalledWith('test:test-key', 3600, JSON.stringify(entry));
    expect(retrieved).toEqual(entry);
  });

  it('should return null for non-existent keys', async () => {
    mockRedis.get.mockResolvedValue(null);
    
    const result = await storage.get('non-existent');
    expect(result).toBeNull();
  });

  it('should handle TTL expiration', async () => {
    const expiredEntry: CacheEntry = {
      key: 'test-key',
      value: 'test-value',
      timestamp: Date.now() - 7200 * 1000, // 2 hours ago
      ttl: 3600, // 1 hour TTL
      provider: 'test',
      model: 'test-model',
      tokenCount: 100,
      cost: 0.01,
    };

    mockRedis.get.mockResolvedValue(JSON.stringify(expiredEntry));
    mockRedis.del.mockResolvedValue(1);
    
    const retrieved = await storage.get('test-key');

    expect(retrieved).toBeNull();
    expect(mockRedis.del).toHaveBeenCalledWith('test:test-key');
  });

  it('should delete entries', async () => {
    mockRedis.del.mockResolvedValue(1);
    
    const deleted = await storage.delete('test-key');

    expect(deleted).toBe(true);
    expect(mockRedis.del).toHaveBeenCalledWith('test:test-key');
  });

  it('should return false when deleting non-existent key', async () => {
    mockRedis.del.mockResolvedValue(0);
    
    const deleted = await storage.delete('non-existent');

    expect(deleted).toBe(false);
  });

  it('should clear all entries', async () => {
    mockRedis.keys.mockResolvedValue(['test:key1', 'test:key2']);
    mockRedis.del.mockResolvedValue(2);
    
    await storage.clear();

    expect(mockRedis.keys).toHaveBeenCalledWith('test:*');
    expect(mockRedis.del).toHaveBeenCalledWith('test:key1', 'test:key2');
  });

  it('should check if key exists', async () => {
    mockRedis.exists.mockResolvedValue(1);
    
    const exists = await storage.has('test-key');

    expect(exists).toBe(true);
    expect(mockRedis.exists).toHaveBeenCalledWith('test:test-key');
  });

  it('should return correct size', async () => {
    mockRedis.keys.mockResolvedValue(['test:key1', 'test:key2', 'test:key3']);
    
    const size = await storage.size();

    expect(size).toBe(3);
    expect(mockRedis.keys).toHaveBeenCalledWith('test:*');
  });

  it('should return correct keys without prefix', async () => {
    mockRedis.keys.mockResolvedValue(['test:key1', 'test:key2']);
    
    const keys = await storage.keys();

    expect(keys).toEqual(['key1', 'key2']);
  });

  it('should handle Redis errors gracefully', async () => {
    const error = new Error('Redis connection failed');
    mockRedis.get.mockRejectedValue(error);
    
    // Should not throw, just return null
    const result = await storage.get('test-key');
    expect(result).toBeNull();
  });

  it('should handle Redis set errors', async () => {
    const error = new Error('Redis set failed');
    mockRedis.setex.mockRejectedValue(error);
    
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

    // Should throw on set errors
    await expect(storage.set('test-key', entry)).rejects.toThrow('Redis set failed');
  });

  it('should disconnect properly', async () => {
    mockRedis.quit.mockResolvedValue('OK');
    
    await storage.disconnect();

    expect(mockRedis.quit).toHaveBeenCalled();
  });

  it('should handle disconnect errors gracefully', async () => {
    const error = new Error('Disconnect failed');
    mockRedis.quit.mockRejectedValue(error);
    
    // Should not throw
    await expect(storage.disconnect()).resolves.not.toThrow();
    expect(mockRedis.quit).toHaveBeenCalled();
  });

  it('should handle clear errors gracefully', async () => {
    const error = new Error('Keys operation failed');
    mockRedis.keys.mockRejectedValue(error);
    
    await expect(storage.clear()).rejects.toThrow('Keys operation failed');
  });

  it('should handle size calculation errors', async () => {
    const error = new Error('Keys operation failed');
    mockRedis.keys.mockRejectedValue(error);
    
    const size = await storage.size();
    expect(size).toBe(0);
  });

  it('should handle keys retrieval errors', async () => {
    const error = new Error('Keys operation failed');
    mockRedis.keys.mockRejectedValue(error);
    
    const keys = await storage.keys();
    expect(keys).toEqual([]);
  });

  it('should handle exists check errors', async () => {
    const error = new Error('Exists check failed');
    mockRedis.exists.mockRejectedValue(error);
    
    const exists = await storage.has('test-key');
    expect(exists).toBe(false);
  });

  it('should handle delete errors gracefully', async () => {
    const error = new Error('Delete failed');
    mockRedis.del.mockRejectedValue(error);
    
    const deleted = await storage.delete('test-key');
    expect(deleted).toBe(false);
  });
});