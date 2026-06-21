import { MockEmbeddingProvider } from '../../src/embeddings/mock.js';

describe('MockEmbeddingProvider', () => {
  it('is deterministic for identical text', async () => {
    const provider = new MockEmbeddingProvider();
    const a = await provider.embed('hello world');
    const b = await provider.embed('hello world');
    expect(a).toEqual(b);
  });

  it('produces different vectors for different text', async () => {
    const provider = new MockEmbeddingProvider();
    const a = await provider.embed('capital of France');
    const b = await provider.embed('zzzzz qqqqq');
    expect(a).not.toEqual(b);
  });

  it('returns L2-normalized vectors', async () => {
    const provider = new MockEmbeddingProvider({ dim: 8 });
    const v = await provider.embed('normalize me');
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it('honors pinned vector overrides', async () => {
    const pinned = [1, 0, 0, 0];
    const provider = new MockEmbeddingProvider({ vectors: { foo: pinned } });
    expect(await provider.embed('foo')).toEqual(pinned);
  });
});
