#!/usr/bin/env node
//
// Semantic vs exact-match (non-semantic) benchmark.
//
// Requires the optional local model dependency:  npx smart-ai-cache setup
// Run with:  npm run benchmark:semantic
//
import { performance } from 'perf_hooks';
import {
  AIResponseCache,
  LocalEmbeddingProvider,
  MemoryVectorStore,
  cosineSimilarity,
} from '../dist/index.js';

const ITER = 200;

function ms(n) {
  return `${n.toFixed(3)} ms`;
}
function us(n) {
  return `${(n * 1000).toFixed(1)} µs`;
}

async function timeAvg(fn, iterations) {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) await fn();
  return (performance.now() - start) / iterations;
}

async function main() {
  console.log('Semantic vs non-semantic benchmark\n' + '='.repeat(50));

  // --- Non-semantic: exact-match hit (warm) ----------------------------------
  const exact = new AIResponseCache({ storage: 'memory' });
  const fixed = async () => ({ value: 'cached', cost: 0.01 });
  const exactOpts = { provider: 'p', model: 'm', prompt: 'hello world' };
  await exact.wrap(fixed, exactOpts); // prime
  const exactHit = await timeAvg(() => exact.wrap(fixed, exactOpts), 10000);

  // --- Embedding model: cold start (one-shot) --------------------------------
  const provider = new LocalEmbeddingProvider();
  const coldStart = performance.now();
  const v0 = await provider.embed('warm up the model');
  const coldStartMs = performance.now() - coldStart;
  const dim = v0.length;

  // --- Embedding: warm (avg) -------------------------------------------------
  const sampleQueries = Array.from({ length: ITER }, (_, i) => `user question number ${i} about billing`);
  let qi = 0;
  const embedWarm = await timeAvg(async () => {
    await provider.embed(sampleQueries[qi++ % sampleQueries.length]);
  }, ITER);

  // --- Vector search only (store pre-filled, mock-free) -----------------------
  const store = new MemoryVectorStore();
  for (let i = 0; i < 1000; i++) await store.add(`k${i}`, await provider.embed(`seed doc ${i}`));
  const probe = await provider.embed('a probe query');
  const searchOnly = await timeAvg(() => store.search(probe, 1), ITER);

  // --- Semantic lookup total (embed + search), warm --------------------------
  let si = 0;
  const semanticLookup = await timeAvg(async () => {
    const v = await provider.embed(sampleQueries[si++ % sampleQueries.length]);
    await store.search(v, 1);
  }, ITER);

  // --- Real end-to-end paraphrase hit demonstration --------------------------
  const sem = new AIResponseCache({
    storage: 'memory',
    semantic: { enabled: true, provider, vectorStore: new MemoryVectorStore(), threshold: 0.8 },
  });
  let calls = 0;
  const llm = async () => (calls++, { value: 'Go to Settings → Security to reset.', cost: 0.02 });
  const A = 'How do I reset my password?';
  const B = 'what are the steps to change my password';
  await sem.wrap(llm, { provider: 'p', model: 'm', prompt: [{ role: 'user', content: A }] });
  const t = performance.now();
  await sem.wrap(llm, { provider: 'p', model: 'm', prompt: [{ role: 'user', content: B }] });
  const paraphraseLatency = performance.now() - t;
  const score = cosineSimilarity(await provider.embed(A), await provider.embed(B));
  const hit = sem.getStats().semanticHits === 1;

  // --- Report ----------------------------------------------------------------
  console.log(`\nEmbedding model      : ${provider.id} (${dim}-dim)`);
  console.log(`Vector search size   : 1000 entries\n`);

  console.log('Latency (warm, averaged):');
  console.log(`  Exact-match hit     : ${us(exactHit)}   (non-semantic fast path)`);
  console.log(`  Vector search only  : ${us(searchOnly)}`);
  console.log(`  Embedding only      : ${ms(embedWarm)}`);
  console.log(`  Semantic lookup     : ${ms(semanticLookup)}   (embed + search)`);
  console.log(`\nCold start (first embedding, incl. model load): ${ms(coldStartMs)}`);

  console.log('\nReal paraphrase test:');
  console.log(`  "${A}"`);
  console.log(`  "${B}"`);
  console.log(`  cosine similarity   : ${score.toFixed(4)}`);
  console.log(`  semantic hit        : ${hit ? '✅ yes' : '❌ no'} (threshold 0.8)`);
  console.log(`  end-to-end latency  : ${ms(paraphraseLatency)}  (LLM calls avoided: ${hit ? 1 : 0})`);

  console.log('\nTakeaway: the exact-match path is ~1000x faster than the semantic');
  console.log('path, but only the semantic path catches paraphrases. Both replace a');
  console.log('full LLM round-trip (typically hundreds of ms to seconds).');

  await exact.disconnect();
  await sem.disconnect();
}

main().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
