/**
 * Produces dense vector embeddings for text. Mirrors the pluggable style of
 * StorageInterface: bring your own implementation, or use the bundled ones.
 *
 * The exact-match cache path never touches this — embeddings are only computed
 * on an exact miss when the semantic tier is enabled.
 */
export interface EmbeddingProvider {
  /** Stable identifier (usually the model name). Used for debug/logging. */
  readonly id: string;

  /** Embed a single piece of text into a dense vector. */
  embed(text: string): Promise<number[]>;
}
