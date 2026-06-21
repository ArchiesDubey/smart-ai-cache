// Smoke test against the BUILT ESM artifact in dist/.
//
// jest runs source through babel, which can apply module interop the real ESM
// build does not — that gap once hid a crypto-js default-export bug that crashed
// every wrap() call in the published package. This test imports dist/ exactly as
// a consumer would, so that class of bug fails CI instead of users.

import assert from 'node:assert/strict';
import { AIResponseCache, MockEmbeddingProvider } from '../dist/index.js';

let failures = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failures++;
    console.error(`  ❌ ${name}\n     ${err.message}`);
  }
}

console.log('Smoke testing dist/ (built ESM artifact)...\n');

await check('exact-match: default key generation + hit', async () => {
  const cache = new AIResponseCache();
  let calls = 0;
  const fn = async () => ({ value: 'hi', cost: 0 });
  const opts = { provider: 'openai', model: 'gpt-4o', prompt: 'hello' };
  await cache.wrap(async () => (calls++, fn()), opts);
  await cache.wrap(async () => (calls++, fn()), opts);
  assert.equal(calls, 1, 'second identical call should be a cache hit');
});

await check('semantic: paraphrase served from cache', async () => {
  const provider = new MockEmbeddingProvider({
    vectors: { 'q one': [1, 0, 0], 'q two': [1, 0, 0] },
  });
  const cache = new AIResponseCache({ semantic: { enabled: true, provider, threshold: 0.95 } });
  let calls = 0;
  const fn = async () => (calls++, { value: 'ans', cost: 0.01 });
  await cache.wrap(fn, { provider: 'p', model: 'm', prompt: [{ role: 'user', content: 'q one' }] });
  await cache.wrap(fn, { provider: 'p', model: 'm', prompt: [{ role: 'user', content: 'q two' }] });
  assert.equal(calls, 1, 'paraphrase should be a semantic hit');
  assert.equal(cache.getStats().semanticHits, 1);
});

console.log(failures === 0 ? '\n✅ dist smoke test passed' : `\n❌ dist smoke test failed (${failures})`);
process.exit(failures === 0 ? 0 : 1);
