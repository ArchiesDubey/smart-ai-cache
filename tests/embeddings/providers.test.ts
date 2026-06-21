const mockCreate = jest.fn();
jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn(() => ({ embeddings: { create: mockCreate } })),
  };
});

import { OpenAIEmbeddingProvider } from '../../src/embeddings/openai.js';
import { LocalEmbeddingProvider } from '../../src/embeddings/local.js';

describe('OpenAIEmbeddingProvider', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the embedding vector from the API response', async () => {
    mockCreate.mockResolvedValue({ data: [{ embedding: [0.1, 0.2, 0.3] }] });
    const provider = new OpenAIEmbeddingProvider({ apiKey: 'sk-test' });

    const vec = await provider.embed('hello');
    expect(vec).toEqual([0.1, 0.2, 0.3]);
    expect(mockCreate).toHaveBeenCalledWith({ model: 'text-embedding-3-small', input: 'hello' });
    expect(provider.id).toBe('openai:text-embedding-3-small');
  });

  it('honors a custom model id', () => {
    const provider = new OpenAIEmbeddingProvider({ model: 'text-embedding-3-large' });
    expect(provider.id).toBe('openai:text-embedding-3-large');
  });
});

describe('LocalEmbeddingProvider', () => {
  it('exposes a stable id derived from the model', () => {
    expect(new LocalEmbeddingProvider().id).toBe('local:Xenova/all-MiniLM-L6-v2');
    expect(new LocalEmbeddingProvider({ model: 'Xenova/foo' }).id).toBe('local:Xenova/foo');
  });

  it('throws a helpful error when the optional dependency is absent', async () => {
    // @xenova/transformers is an optional peer dep. In CI / a fresh clone it is
    // not installed, so we can assert the helpful error. If a dev has run
    // `npx smart-ai-cache setup`, skip rather than download a model mid-test.
    let installed = false;
    try {
      await import('@xenova/transformers');
      installed = true;
    } catch {
      /* not installed — expected in CI */
    }
    if (installed) return;

    const provider = new LocalEmbeddingProvider();
    await expect(provider.embed('hi')).rejects.toThrow('@xenova/transformers');
  });
});
