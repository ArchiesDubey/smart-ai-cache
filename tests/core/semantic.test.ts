import { AIResponseCache } from '../../src/core/cache.js';
import { MockEmbeddingProvider } from '../../src/embeddings/mock.js';
import { MemoryVectorStore } from '../../src/vector/memory-vector-store.js';

describe('AIResponseCache semantic tier', () => {
  it('is off by default — no semantic hit across different prompts', async () => {
    const cache = new AIResponseCache({ storage: 'memory' });
    const fn = jest.fn().mockResolvedValue({ value: 'r', tokenCount: 0, cost: 0 });

    await cache.wrap(fn, { provider: 'test', model: 'm', prompt: 'capital of France?' });
    await cache.wrap(fn, { provider: 'test', model: 'm', prompt: 'what is the capital of France' });

    expect(fn).toHaveBeenCalledTimes(2);
    expect(cache.getStats().semanticHits).toBe(0);
  });

  it('serves a semantic hit for an exact-miss paraphrase that embeds identically', async () => {
    // Pin two different prompt texts to the same vector → cosine 1.0 → hit.
    const provider = new MockEmbeddingProvider({
      vectors: { 'how do I reset my password': [1, 0, 0, 0], 'password reset steps': [1, 0, 0, 0] },
    });
    const cache = new AIResponseCache({
      storage: 'memory',
      semantic: { enabled: true, provider, vectorStore: new MemoryVectorStore(), threshold: 0.95 },
    });
    const fn = jest.fn().mockResolvedValue({ value: 'answer', tokenCount: 10, cost: 0.01 });

    const first = await cache.wrap(fn, { provider: 'p', model: 'm', prompt: 'how do I reset my password' });
    const second = await cache.wrap(fn, { provider: 'p', model: 'm', prompt: 'password reset steps' });

    expect(first).toBe('answer');
    expect(second).toBe('answer');
    expect(fn).toHaveBeenCalledTimes(1); // second served semantically
    const stats = cache.getStats();
    expect(stats.semanticHits).toBe(1);
    expect(stats.cacheHits).toBe(1);
  });

  it('does NOT serve a hit below threshold', async () => {
    const provider = new MockEmbeddingProvider({
      vectors: { q1: [1, 0], q2: [0, 1] }, // orthogonal → cosine 0
    });
    const cache = new AIResponseCache({
      storage: 'memory',
      semantic: { enabled: true, provider, threshold: 0.95 },
    });
    const fn = jest.fn().mockResolvedValue({ value: 'v', tokenCount: 0, cost: 0 });

    await cache.wrap(fn, { provider: 'p', model: 'm', prompt: 'q1' });
    await cache.wrap(fn, { provider: 'p', model: 'm', prompt: 'q2' });

    expect(fn).toHaveBeenCalledTimes(2);
    expect(cache.getStats().semanticHits).toBe(0);
  });

  it('counts near-misses when logNearMisses is on', async () => {
    const provider = new MockEmbeddingProvider({
      vectors: { a: [1, 0], b: [0.8, 0.2] }, // similar but below 0.99
    });
    const cache = new AIResponseCache({
      storage: 'memory',
      semantic: { enabled: true, provider, threshold: 0.99, logNearMisses: true },
    });
    const fn = jest.fn().mockResolvedValue({ value: 'v', tokenCount: 0, cost: 0 });

    await cache.wrap(fn, { provider: 'p', model: 'm', prompt: 'a' });
    await cache.wrap(fn, { provider: 'p', model: 'm', prompt: 'b' });

    expect(cache.getStats().nearMisses).toBe(1);
  });

  it('respects a per-call threshold override', async () => {
    const provider = new MockEmbeddingProvider({
      vectors: { x: [1, 0], y: [0.9, Math.sqrt(1 - 0.81)] }, // cosine 0.9 with x
    });
    const cache = new AIResponseCache({
      storage: 'memory',
      semantic: { enabled: true, provider, threshold: 0.95 },
    });
    const fn = jest.fn().mockResolvedValue({ value: 'v', tokenCount: 0, cost: 0 });

    await cache.wrap(fn, { provider: 'p', model: 'm', prompt: 'x' });
    // Looser per-call threshold of 0.85 turns the 0.9 match into a hit.
    await cache.wrap(fn, { provider: 'p', model: 'm', prompt: 'y', semantic: { threshold: 0.85 } });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(cache.getStats().semanticHits).toBe(1);
  });

  it('skips semantic lookup when there is no embeddable text', async () => {
    const provider = new MockEmbeddingProvider();
    const embedSpy = jest.spyOn(provider, 'embed');
    const cache = new AIResponseCache({ storage: 'memory', semantic: { enabled: true, provider } });
    const fn = jest.fn().mockResolvedValue({ value: 'v', tokenCount: 0, cost: 0 });

    await cache.wrap(fn, { provider: 'p', model: 'm' }); // no prompt
    await cache.wrap(fn, { provider: 'p', model: 'm', prompt: '   ' }); // whitespace only

    expect(embedSpy).not.toHaveBeenCalled();
  });

  it('can be disabled per call even when globally enabled', async () => {
    const provider = new MockEmbeddingProvider({ vectors: { a: [1, 0], b: [1, 0] } });
    const cache = new AIResponseCache({ storage: 'memory', semantic: { enabled: true, provider } });
    const fn = jest.fn().mockResolvedValue({ value: 'v', tokenCount: 0, cost: 0 });

    await cache.wrap(fn, { provider: 'p', model: 'm', prompt: 'a' });
    await cache.wrap(fn, { provider: 'p', model: 'm', prompt: 'b', semantic: { enabled: false } });

    expect(fn).toHaveBeenCalledTimes(2);
    expect(cache.getStats().semanticHits).toBe(0);
  });

  it('falls through to a miss when the matched vector points at an evicted entry', async () => {
    const provider = new MockEmbeddingProvider({ vectors: { a: [1, 0], b: [1, 0] } });
    const cache = new AIResponseCache({ storage: 'memory', semantic: { enabled: true, provider } });
    const fn = jest.fn().mockResolvedValue({ value: 'v', tokenCount: 0, cost: 0 });

    await cache.wrap(fn, { provider: 'p', model: 'm', prompt: 'a' });
    await cache.clear(); // drops the entry but the test re-adds via next miss

    await cache.wrap(fn, { provider: 'p', model: 'm', prompt: 'b' });
    expect(fn).toHaveBeenCalledTimes(2); // no stale hit
  });

  it('embeds object prompts and multimodal content arrays', async () => {
    const provider = new MockEmbeddingProvider();
    const cache = new AIResponseCache({
      storage: 'memory',
      semantic: { enabled: true, provider, threshold: 0.999 },
    });
    const fn = jest.fn().mockResolvedValue({ value: 'v', tokenCount: 0, cost: 0 });

    // object prompt with a content string
    await cache.wrap(fn, { provider: 'p', model: 'm', prompt: { content: 'shared text' } });
    // chat message whose content is a multimodal parts array with the same text
    await cache.wrap(fn, {
      provider: 'p',
      model: 'm',
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'shared text' }] }],
    });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(cache.getStats().semanticHits).toBe(1);
  });

  it('embeds the last user message of a chat-style prompt', async () => {
    const provider = new MockEmbeddingProvider();
    const cache = new AIResponseCache({
      storage: 'memory',
      semantic: { enabled: true, provider, threshold: 0.999 },
    });
    const fn = jest.fn().mockResolvedValue({ value: 'v', tokenCount: 0, cost: 0 });

    const messagesA = [
      { role: 'system', content: 'You are helpful' },
      { role: 'user', content: 'same question' },
    ];
    const messagesB = [
      { role: 'system', content: 'A totally different system prompt' },
      { role: 'user', content: 'same question' },
    ];

    await cache.wrap(fn, { provider: 'p', model: 'm', prompt: messagesA });
    await cache.wrap(fn, { provider: 'p', model: 'm', prompt: messagesB });

    // Different system prompts but identical last user message → semantic hit.
    expect(fn).toHaveBeenCalledTimes(1);
    expect(cache.getStats().semanticHits).toBe(1);
  });
});
