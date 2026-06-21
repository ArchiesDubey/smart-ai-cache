jest.mock('ioredis', () => {
  const mockRedis = {
    hset: jest.fn(),
    hgetall: jest.fn(),
    hdel: jest.fn(),
    hlen: jest.fn(),
    del: jest.fn(),
    quit: jest.fn(),
    on: jest.fn(),
  };
  return { Redis: jest.fn(() => mockRedis) };
});

import { Redis } from 'ioredis';
import { RedisVectorStore } from '../../src/vector/redis-vector-store.js';

describe('RedisVectorStore (plain Redis, brute-force)', () => {
  let redis: jest.Mocked<Redis>;
  let store: RedisVectorStore;

  beforeEach(() => {
    jest.clearAllMocks();
    redis = new Redis() as unknown as jest.Mocked<Redis>;
    store = new RedisVectorStore({ redis: redis as any });
  });

  it('stores vectors as JSON fields in a single hash', async () => {
    await store.add('key1', [0.1, 0.2, 0.3]);
    expect(redis.hset).toHaveBeenCalledWith('ai-cache:vectors', 'key1', JSON.stringify([0.1, 0.2, 0.3]));
  });

  it('computes cosine similarity in Node and returns top-K sorted', async () => {
    (redis.hgetall as jest.Mock).mockResolvedValue({
      a: JSON.stringify([1, 0, 0]),
      b: JSON.stringify([0, 1, 0]),
      c: JSON.stringify([0.9, 0.1, 0]),
    });

    const results = await store.search([1, 0, 0], 2);
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('a');
    expect(results[0].score).toBeCloseTo(1, 6);
    expect(results[1].id).toBe('c');
  });

  it('skips malformed entries instead of throwing', async () => {
    (redis.hgetall as jest.Mock).mockResolvedValue({
      good: JSON.stringify([1, 0]),
      bad: 'not-json',
    });
    const results = await store.search([1, 0], 5);
    expect(results.map((r) => r.id)).toEqual(['good']);
  });

  it('delete, clear and size use the hash', async () => {
    await store.delete('key1');
    expect(redis.hdel).toHaveBeenCalledWith('ai-cache:vectors', 'key1');

    await store.clear();
    expect(redis.del).toHaveBeenCalledWith('ai-cache:vectors');

    (redis.hlen as jest.Mock).mockResolvedValue(3);
    expect(await store.size()).toBe(3);
  });

  it('does not close a shared (injected) connection on disconnect', async () => {
    await store.disconnect();
    expect(redis.quit).not.toHaveBeenCalled();
  });

  it('closes its own connection when it created one', async () => {
    const owned = new RedisVectorStore({ redisOptions: {} });
    await owned.disconnect();
    expect((redis.quit as jest.Mock)).toHaveBeenCalled();
  });
});
