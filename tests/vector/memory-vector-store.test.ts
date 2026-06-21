import { MemoryVectorStore, cosineSimilarity } from '../../src/vector/memory-vector-store.js';

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 6);
  });

  it('returns 0 on length mismatch or zero vector', () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 2])).toBe(0);
  });
});

describe('MemoryVectorStore', () => {
  let store: MemoryVectorStore;

  beforeEach(() => {
    store = new MemoryVectorStore();
  });

  it('returns nearest neighbours sorted by score', async () => {
    await store.add('a', [1, 0, 0]);
    await store.add('b', [0, 1, 0]);
    await store.add('c', [0.9, 0.1, 0]);

    const results = await store.search([1, 0, 0], 2);
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('a');
    expect(results[0].score).toBeGreaterThan(results[1].score);
    expect(results[1].id).toBe('c');
  });

  it('supports delete, clear and size', async () => {
    await store.add('a', [1, 0]);
    await store.add('b', [0, 1]);
    expect(await store.size()).toBe(2);

    await store.delete('a');
    expect(await store.size()).toBe(1);

    await store.clear();
    expect(await store.size()).toBe(0);
  });
});
