# smart-ai-cache — Semantic & Multi-tier Design Spec

> Master design/implementation spec. Goal: evolve `smart-ai-cache` from an exact-match
> response cache into the best **TypeScript-native, zero-API-key semantic cache**, then add
> multi-tier caching and observability. Audience priority: OSS community > hiring managers >
> freelance clients. License stays MIT; no paid tier.

## Positioning

GPTCache owns Python (runs as a sidecar). No one owns idiomatic `npm install` semantic
caching. That is the wedge. The README/keywords lead with **"semantic"**; the package is
**not** renamed (preserve the npm slug, version history, SEO).

Honesty rules (credibility matters most to the OSS audience):
- The exact-match path stays sub-millisecond. The **semantic path costs an embedding**
  (~10–50ms warm; slower cold-start while the local model loads). Say so.
- Report **hit-rate on a paraphrase-heavy query set**, not hash throughput.
- Drop / qualify the unconditional "40–80% savings" claim.

## Roadmap (phased)

| Phase | Scope | Why |
|------:|-------|-----|
| **1** | Semantic layer over the exact-match core | The wedge. Table stakes for a modern cache. |
| **2** | Vercel AI SDK adapter | Where TS AI devs are. One adapter, done well. |
| **3** | Tool-result + session-state cache tiers | Closes the biggest gap vs betterdb; multi-tier design is a strong portfolio signal. |
| **4** | OpenTelemetry (spans + metrics) | Production observability; another strong portfolio signal. |

Explicitly **out of scope**: paid/SaaS tier, Python parity, MCP auto-tuner, matching
betterdb's full surface. Solo / nights-and-weekends budget — depth on the wedge beats breadth.

---

## Phase 1 — Semantic layer (detailed)

**Principle:** additive second tier, not a rewrite. Exact-match stays the fast path; semantic
runs only on an exact miss. Existing tests stay green. Semantic is **off by default** →
zero breaking changes.

### New abstractions (mirror the existing `StorageInterface` style)

```
src/embeddings/
  embedding-provider.ts   // interface EmbeddingProvider { embed(text: string): Promise<number[]> }
  local.ts                // LocalEmbeddingProvider — @xenova/transformers (DEFAULT)
  openai.ts               // OpenAIEmbeddingProvider — opt-in, API key
src/vector/
  vector-store.ts         // interface VectorStore { add(id, vec, meta?); search(vec, topK): {id, score}[] }
  memory-vector-store.ts  // brute-force cosine — zero-config path
  redis-vector-store.ts   // Redis 8 vector / FT.SEARCH KNN — production path
```

### Modified `wrap()` flow (`src/core/cache.ts`)

Insert between the exact-miss point and the `fn()` call:

1. **Exact hash lookup** (unchanged fast path). Hit → return. No embedding cost on the hot path.
2. **Exact miss + `semantic.enabled`:** embed the query text → `vectorStore.search(vec, topK=1)`.
   If top score ≥ `threshold` → **semantic hit**, return that entry's value; increment new
   `stats.semanticHits`.
3. **Full miss:** call `fn()` as today, store value under the exact key **and**
   `vectorStore.add(exactKey, embedding)` so future paraphrases hit. (The exact hash key
   doubles as the vector id — no parallel id scheme.)

### Config (extend `CacheConfig`)

```ts
semantic?: {
  enabled: boolean;             // default false → backward compatible
  provider?: EmbeddingProvider; // default LocalEmbeddingProvider
  threshold?: number;           // cosine similarity, default 0.95 (deliberately high)
  model?: string;               // default 'Xenova/all-MiniLM-L6-v2' (384-dim, ~23MB)
}
```

### Defaulted design decisions

1. **Model `all-MiniLM-L6-v2`** — standard fast sentence-embedding model; good quality/size balance.
2. **Embed the last user message content**, not the whole payload JSON. System prompt +
   history pollute similarity. (Document this clearly.)
3. **Threshold 0.95, deliberately high** — see risk below.

### The core risk (and the best portfolio story)

Semantic caching can return a **confidently wrong answer**: "capital of France?" vs
"capital of Germany?" can sit at ~0.9 cosine similarity. Too low → wrong cached responses;
too high → no hits. Handle it explicitly and lead with it in the writeup:
- High default threshold.
- Optional "log near-misses" mode to help users tune.
- Per-call / per-route threshold override.

This nuance is what separates "I wrapped a vector DB" from "I understood the failure mode."

### Testing / CI

Provide a `MockEmbeddingProvider` so CI never downloads a model. Keep the existing ~93%
coverage fast and deterministic.

---

## Phase 3 — Tool-result & session-state cache tiers (design sketch)

Three tiers behind one storage connection (the betterdb framing, minus the SaaS):

- **LLM response cache** — Phases 1–2 (exact + semantic).
- **Tool-result cache** — cache deterministic tool/function-call outputs.
  - Key: `tool:{name}:{hash(args)}`. Exact-match (semantic rarely makes sense for tool args).
  - Separate, typically shorter TTL (tool results are more volatile than completions).
  - API: `cache.wrapTool(name, args, () => runTool())`.
- **Session-state cache** — KV store for conversation/agent state keyed by session id.
  - Key: `session:{id}`. TTL-based; plain get/set/delete. No embeddings.
  - API: `cache.session.get/set/delete(id, value, ttl?)`.

Reuse the existing `StorageInterface` (memory/Redis) for all three; tiers are namespaced by
key prefix. Per-tier stats in `getStats()`.

## Phase 4 — OpenTelemetry (design sketch)

- Optional peer dep on `@opentelemetry/api` (no hard dependency; no-op if absent).
- **Spans:** `cache.lookup`, `cache.embedding`, `cache.vector_search`, `provider.call`.
  Attributes: provider, model, tier, hit/miss/semantic-hit, score.
- **Metrics:** hit-rate gauge, lookup-latency histogram, embedding-latency histogram,
  cost-saved counter, requests counter (by provider/tier).
- Keep the existing lightweight `getStats()` as the zero-dep default; OTel is additive.
