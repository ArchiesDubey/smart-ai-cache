import { Redis, RedisOptions } from 'ioredis';
import { CacheEntry } from '../core/types.js';

export interface StorageInterface {
  get(key: string): Promise<CacheEntry | null>;
  set(key: string, entry: CacheEntry): Promise<void>;
  delete(key: string): Promise<boolean>;
  clear(): Promise<void>;
  has(key: string): Promise<boolean>;
  size(): Promise<number>;
  keys(): Promise<string[]>;
}

export class RedisStorage implements StorageInterface {
  private redis: Redis;
  private keyPrefix: string;

  constructor(options: RedisOptions, keyPrefix: string = 'ai-cache:') {
    this.redis = new Redis(options);
    this.keyPrefix = keyPrefix;
    
    // Handle connection errors
    this.redis.on('error', (error: Error) => {
      console.error('Redis connection error:', error);
    });
  }

  private prefixKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  async get(key: string): Promise<CacheEntry | null> {
    try {
      const data = await this.redis.get(this.prefixKey(key));
      if (!data) return null;
      
      const entry = JSON.parse(data) as CacheEntry;
      
      // Check if entry has expired
      if (Date.now() > entry.timestamp + entry.ttl * 1000) {
        await this.delete(key);
        return null;
      }
      
      return entry;
    } catch (error) {
      console.error('Redis get error:', error);
      return null;
    }
  }

  async set(key: string, entry: CacheEntry): Promise<void> {
    try {
      const data = JSON.stringify(entry);
      const ttlSeconds = Math.ceil(entry.ttl);
      
      await this.redis.setex(this.prefixKey(key), ttlSeconds, data);
    } catch (error) {
      console.error('Redis set error:', error);
      throw error;
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      const result = await this.redis.del(this.prefixKey(key));
      return result > 0;
    } catch (error) {
      console.error('Redis delete error:', error);
      return false;
    }
  }

  async clear(): Promise<void> {
    try {
      const keys = await this.redis.keys(`${this.keyPrefix}*`);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch (error) {
      console.error('Redis clear error:', error);
      throw error;
    }
  }

  async has(key: string): Promise<boolean> {
    try {
      const exists = await this.redis.exists(this.prefixKey(key));
      return exists === 1;
    } catch (error) {
      console.error('Redis has error:', error);
      return false;
    }
  }

  async size(): Promise<number> {
    try {
      const keys = await this.redis.keys(`${this.keyPrefix}*`);
      return keys.length;
    } catch (error) {
      console.error('Redis size error:', error);
      return 0;
    }
  }

  async keys(): Promise<string[]> {
    try {
      const keys = await this.redis.keys(`${this.keyPrefix}*`);
      return keys.map((key: string) => key.replace(this.keyPrefix, ''));
    } catch (error) {
      console.error('Redis keys error:', error);
      return [];
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.redis.quit();
    } catch (error) {
      console.error('Redis disconnect error:', error);
    }
  }
}