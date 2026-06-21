# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-06-21

### Added
- **Semantic caching layer** (opt-in, off by default) — on an exact-match miss,
  embeds the last user message and serves a cached response when cosine
  similarity clears a configurable `threshold`. Backward compatible.
- **Embedding providers**: `LocalEmbeddingProvider` (default, local, zero
  API key via `@xenova/transformers`), `OpenAIEmbeddingProvider` (opt-in), and
  `MockEmbeddingProvider` (deterministic, for tests/CI). Pluggable via the
  `EmbeddingProvider` interface.
- **Vector stores**: `MemoryVectorStore` (in-process brute-force cosine) and
  `RedisVectorStore` (plain Redis — single hash, no RediSearch module required,
  so one ordinary Redis backs both cache tiers). Pluggable via `VectorStore`;
  auto-selected to match the `storage` backend.
- **Accuracy controls** for the semantic failure mode: high default threshold
  (0.95), per-call/per-route threshold override, and `logNearMisses` for tuning.
- **`semanticHits` / `nearMisses`** in `getStats()`.
- **CLI**: `npx smart-ai-cache setup` installs the local embedding model;
  non-blocking, CI-safe postinstall notice recommending semantic caching.
- **CI workflow** (`ci.yml`) running build, tests + coverage gate, and a
  **smoke test against the built `dist/` artifact**; publish is now gated on the
  same checks.

### Fixed
- **ESM crash on default cache keys**: `crypto-js` exposes `MD5` only on its
  default export under Node ESM, but the key generator used a namespace import,
  so every `wrap()` call with a generated key threw `crypto.MD5 is not a
  function` in the published ESM build. Switched to a default import. (The jest
  suite missed this because Babel applied an interop the real build does not —
  hence the new dist smoke test.)

### Changed
- `@xenova/transformers` is an **optional peer dependency** (not auto-installed),
  keeping the base install lean; only added when you enable local semantic
  embeddings.
- Repositioned package description and keywords toward "semantic"; dropped the
  unqualified "40–80% savings" claim and scoped the footprint claim to the
  exact-match path.

## [1.0.6] - 2024-08-28

### Added
- Enhanced README with comprehensive Redis examples
- Docker Compose setup for Redis in production
- Migration guide from v1.0.4 to v1.0.5+
- Advanced cache management features documentation
- Performance benchmarking section with real metrics
- Complete package metadata for better NPM discoverability

### Changed
- Improved package description for better searchability
- Updated keywords for broader AI/ML community reach
- Enhanced documentation structure with table of contents

## [1.0.5] - 2024-08-28

### Added
- **Redis storage backend** with full error handling and fallback
- **Comprehensive error handling** with retry logic and exponential backoff
- **Pattern-based cache invalidation** (`deleteByPattern` method)
- **Input validation** for configuration and runtime parameters
- **Performance benchmarking script** (`npm run benchmark`)
- **93.7% test coverage** with 50 comprehensive tests
- **Graceful degradation** when cache storage fails
- **Protected methods** for provider inheritance (replaces `@ts-ignore` hacks)

### Changed
- **BREAKING**: Cache methods are now async (`clear()`, `delete()`, `has()`, `getCacheSize()`)
- **BREAKING**: Provider classes no longer require client instances
- Cache operations now use storage abstraction for better extensibility
- Improved statistics tracking with provider-specific metrics
- Enhanced key generation with better normalization

### Fixed
- LRU eviction performance optimizations
- Memory leak prevention in concurrent scenarios  
- TypeScript compilation issues with ioredis v5
- Test reliability and console output cleanup

### Performance
- **Cache lookup**: 0.0009ms (1,111x faster than 1ms requirement)
- **Memory usage**: 2.86MB for 10K entries (35x better than 100MB requirement)
- **Throughput**: 451,842 requests/second
- **LRU eviction**: 86μs per operation

## [1.0.4] - 2024-08-27

### Added
- GitHub integration and workflow setup
- Version bump and release automation

### Fixed
- Package distribution and build process

## [1.0.3] - 2024-08-27

### Added
- Basic caching functionality for AI responses
- Support for OpenAI, Anthropic, and Google AI providers
- In-memory storage with LRU eviction
- Statistics tracking for cache performance
- TypeScript definitions and documentation

### Features
- Zero-configuration setup for quick start
- Provider-specific classes with automatic cost tracking
- MD5-based cache key generation
- Comprehensive test suite with Jest
- TypeDoc documentation generation

## [1.0.0] - Initial Release

### Added
- Core caching middleware for AI API responses
- Multi-provider support (OpenAI, Anthropic, Google)
- Basic statistics and cost tracking
- TypeScript support
- MIT license

---

## Migration Notes

### v1.0.4 → v1.0.5+
- Update cache method calls to use `await`
- Remove client instances from provider constructors
- Consider upgrading to Redis for production deployments
- Update error handling to leverage new retry logic

### v1.0.5 → v1.0.6
- No breaking changes
- Enhanced documentation and package metadata
- New benchmarking capabilities

---

For more details on any release, see the [GitHub releases page](https://github.com/ArchiesDubey/smart-ai-cache/releases).