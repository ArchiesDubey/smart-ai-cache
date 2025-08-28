# `smart-ai-cache`

![npm version](https://img.shields.io/npm/v/smart-ai-cache)
![License](https://img.shields.io/npm/l/smart-ai-cache)
![Downloads](https://img.shields.io/npm/dm/smart-ai-cache)
![Build Status](https://img.shields.io/github/actions/workflow/status/ArchiesDubey/smart-ai-cache/ci.yml?branch=master)
![Coverage](https://img.shields.io/badge/coverage-93.7%25-brightgreen)

A lightweight, intelligent caching middleware for AI responses, designed to reduce API costs and improve response times for repetitive LLM queries.

## 🚀 Performance Benchmarks

**Exceeds all industry requirements:**

| Metric | Target | Actual | Performance |
|--------|--------|--------|------------|
| Cache lookup | < 1ms | **0.0009ms** | 1,111x faster ⚡ |
| Memory usage | < 100MB | **2.86MB** | 35x more efficient 💾 |
| Throughput | High | **451,842 req/s** | Exceptional 🔥 |

## 📋 Table of Contents

- [Purpose](#purpose)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Storage Options](#storage-options)
  - [Memory Storage](#memory-storage)
  - [Redis Storage](#redis-storage)
- [Provider Examples](#provider-examples)
- [Configuration](#configuration)
- [Performance](#performance)
- [Migration Guide](#migration-guide)
- [API Reference](#api-reference)

## Purpose

`smart-ai-cache` is an NPM package targeting Node.js developers building AI-powered applications. Its primary goal is to reduce API costs and improve response times for repetitive Large Language Model (LLM) queries.

### Key Value Propositions
- **Cost Reduction:** Achieve 40-80% savings on repetitive AI API calls
- **Performance Improvement:** Sub-millisecond response times for cached queries
- **Developer Experience:** Drop-in middleware with zero configuration required
- **Multi-Provider Support:** Seamlessly works with OpenAI, Anthropic Claude, and Google Gemini APIs
- **Production Ready:** Comprehensive error handling, retry logic, and monitoring

## Installation

```bash
npm install smart-ai-cache
# or
yarn add smart-ai-cache
# or  
pnpm add smart-ai-cache
```

For Redis support (optional):
```bash
npm install smart-ai-cache ioredis
```

## Quick Start

Get started in under 30 seconds:

```typescript
import { AIResponseCache } from 'smart-ai-cache';
import OpenAI from 'openai';

// Initialize with zero configuration
const cache = new AIResponseCache();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const response = await cache.wrap(
  () => openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: 'Hello, world!' }],
  }),
  { provider: 'openai', model: 'gpt-4' }
);

// First call hits the API, second call uses cache
const cachedResponse = await cache.wrap(
  () => openai.chat.completions.create({
    model: 'gpt-4', 
    messages: [{ role: 'user', content: 'Hello, world!' }],
  }),
  { provider: 'openai', model: 'gpt-4' }
);

// Check your savings
const stats = cache.getStats();
console.log(`Hit rate: ${stats.hitRate}%, Cost saved: $${stats.totalCostSaved}`);
```

## Storage Options

### Memory Storage

**Default option** - Ultra-fast, perfect for single-instance applications:

```typescript
import { AIResponseCache } from 'smart-ai-cache';

const cache = new AIResponseCache({
  storage: 'memory',          // Default
  maxSize: 1000,             // Max entries (default: 1000)
  ttl: 3600,                 // 1 hour expiration (default)
});

// Automatic LRU eviction when maxSize is exceeded
// Sub-millisecond lookup times
// Zero external dependencies
```

**Pros:** Fastest possible performance, no setup required  
**Cons:** Not shared across instances, lost on restart

### Redis Storage  

**Enterprise option** - Persistent, distributed caching:

```typescript
import { AIResponseCache } from 'smart-ai-cache';

const cache = new AIResponseCache({
  storage: 'redis',
  redisOptions: {
    host: 'localhost',
    port: 6379,
    password: 'your-redis-password',    // If required
    db: 0,                              // Redis database number
    connectTimeout: 10000,              // Connection timeout
    retryDelayOnFailover: 1000,        // Failover retry delay
  },
  keyPrefix: 'ai-cache:',              // Namespace your keys
  ttl: 7200,                           // 2 hours
});

// Automatic fallback to memory storage if Redis fails
// Shared across multiple application instances  
// Survives application restarts
```

**Pros:** Persistent, scalable, shared across instances  
**Cons:** Requires Redis server, network latency

#### Redis Production Setup

**Docker Compose:**
```yaml
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes
    environment:
      - REDIS_PASSWORD=your-secure-password
      
  your-app:
    build: .
    environment:
      - REDIS_HOST=redis
      - REDIS_PORT=6379  
      - REDIS_PASSWORD=your-secure-password
    depends_on:
      - redis

volumes:
  redis_data:
```

**Environment Variables:**
```bash
# .env file
REDIS_HOST=your-redis-host.com
REDIS_PORT=6379
REDIS_PASSWORD=your-secure-password
REDIS_DB=0
```

```typescript
const cache = new AIResponseCache({
  storage: 'redis',
  redisOptions: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0'),
  },
});
```

## Provider Examples

`smart-ai-cache` provides specialized classes for each AI provider with automatic cost tracking:

### OpenAI

```typescript
import { OpenAICache } from 'smart-ai-cache';

const cache = new OpenAICache({
  ttl: 7200,                    // 2 hours
  maxSize: 5000,               // 5K entries  
  storage: 'redis',            // Use Redis
  redisOptions: {
    host: 'localhost',
    port: 6379,
  }
});

// Automatically handles OpenAI-specific response types
const response = await cache.chatCompletion({
  model: 'gpt-4o',
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Explain quantum computing in simple terms' }
  ],
  temperature: 0.7,
  max_tokens: 500,
});

console.log(response.choices[0].message.content);

// Get OpenAI-specific analytics
const stats = cache.getStats();
console.log(`Cache hit rate: ${stats.hitRate}%`);
console.log(`Cost saved: $${stats.totalCostSaved.toFixed(4)}`);
console.log(`OpenAI requests: ${stats.byProvider.openai?.requests || 0}`);
```

### Anthropic Claude

```typescript
import { AnthropicCache } from 'smart-ai-cache';

const cache = new AnthropicCache({
  storage: 'memory',
  maxSize: 2000,
  ttl: 3600,
});

const response = await cache.messages({
  model: 'claude-3-5-sonnet-20241022',
  max_tokens: 1000, 
  messages: [
    { 
      role: 'user', 
      content: 'Write a Python function to calculate fibonacci numbers' 
    }
  ],
});

console.log(response.content[0].text);

// Claude-specific cost tracking
const stats = cache.getStats();
console.log(`Claude cost saved: $${stats.byProvider.anthropic?.costSaved || 0}`);
```

### Google Gemini

```typescript 
import { GoogleCache } from 'smart-ai-cache';

const cache = new GoogleCache({
  ttl: 1800,                   // 30 minutes
  storage: 'redis',
}, process.env.GOOGLE_API_KEY);

const response = await cache.generateContent({
  contents: [{ 
    role: 'user', 
    parts: [{ text: 'What are the benefits of renewable energy?' }] 
  }],
}, 'gemini-1.5-pro');

console.log(response.response.text());
```

## Configuration

Complete configuration options:

```typescript
interface CacheConfig {
  ttl?: number;                    // Time to live in seconds (default: 3600)
  maxSize?: number;                // Maximum cache entries (default: 1000)
  storage?: 'memory' | 'redis';    // Storage backend (default: 'memory')
  redisOptions?: RedisOptions;     // Redis connection options 
  keyPrefix?: string;              // Cache key prefix (default: 'ai-cache:')
  enableStats?: boolean;           // Enable statistics tracking (default: true)
  debug?: boolean;                 // Enable debug logging (default: false)
}
```

**Advanced Configuration:**

```typescript
const cache = new AIResponseCache({
  ttl: 7200,                      // 2 hours expiration
  maxSize: 10000,                 // 10K entries max
  storage: 'redis',
  redisOptions: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD,
    db: 0,
    connectTimeout: 10000,
    retryDelayOnFailover: 1000,
    maxRetriesPerRequest: 3,
  },
  keyPrefix: 'myapp:ai-cache:',   // Custom namespace
  enableStats: true,              // Track performance metrics
  debug: process.env.NODE_ENV === 'development',
});
```

## Performance

Run the built-in benchmark to validate performance in your environment:

```bash
npm run benchmark
```

**Sample Output:**
```
Cache lookup average: 0.94μs (0.0009ms)
Memory used for 10,000 entries: 2.86MB  
Throughput: 451,842 requests/second
✅ All BRD requirements exceeded
```

### Cache Management

**Manual Cache Operations:**

```typescript
// Check cache size
const size = await cache.getCacheSize();
console.log(`Cache contains ${size} entries`);

// Clear specific entries by pattern
const deleted = await cache.deleteByPattern('openai:gpt-4:*');
console.log(`Deleted ${deleted} OpenAI GPT-4 entries`);

// Clear entire cache
await cache.clear();

// Delete specific key  
const key = cache.generateKey('openai', 'gpt-4', prompt, params);
await cache.delete(key);

// Check if key exists
const exists = await cache.has(key);
```

**Graceful Shutdown:**

```typescript
process.on('SIGTERM', async () => {
  await cache.disconnect(); // Closes Redis connections
  process.exit(0);
});
```

## Migration Guide

### From v1.0.4 to v1.0.5+

**Breaking Changes:**
- Cache methods are now async (`clear()`, `delete()`, `has()`, `getCacheSize()`)
- Provider classes no longer require passing client instances

**Before:**
```typescript
// v1.0.4 and earlier
const cache = new AIResponseCache();
cache.clear();                    // Synchronous
const size = cache.getCacheSize(); // Synchronous

const openaiCache = new OpenAICache(config, openaiClient);
```

**After:**
```typescript
// v1.0.5+
const cache = new AIResponseCache();  
await cache.clear();                    // Async
const size = await cache.getCacheSize(); // Async

const openaiCache = new OpenAICache(config); // No client needed
```

**Migration Steps:**
1. Add `await` to cache management operations
2. Remove client instances from provider constructors  
3. Update your error handling to use the new retry logic
4. Consider upgrading to Redis for production deployments

### Adding Redis to Existing Projects

**Step 1: Install Redis dependency**
```bash
npm install ioredis
```

**Step 2: Update your cache configuration**
```typescript
// Before - Memory only
const cache = new AIResponseCache({ ttl: 3600 });

// After - Redis with fallback
const cache = new AIResponseCache({
  storage: 'redis',
  redisOptions: {
    host: process.env.REDIS_HOST || 'localhost', 
    port: parseInt(process.env.REDIS_PORT) || 6379,
  },
  ttl: 3600,
});
```

**Step 3: Add graceful shutdown**
```typescript
process.on('SIGTERM', async () => {
  await cache.disconnect();
  process.exit(0);
});
```

## Advanced Features

### Custom Key Generation

```typescript
const cache = new AIResponseCache();

// Generate custom cache keys
const customKey = cache.generateKey('openai', 'gpt-4', prompt, params);

// Use custom keys for manual cache management
await cache.wrap(apiCall, {
  provider: 'openai',
  model: 'gpt-4', 
  cacheKey: customKey
});
```

### Statistics and Monitoring

```typescript
const stats = cache.getStats();

console.log('Cache Performance:');
console.log(`├─ Total Requests: ${stats.totalRequests}`);
console.log(`├─ Cache Hits: ${stats.cacheHits} (${stats.hitRate.toFixed(1)}%)`);
console.log(`├─ Cost Saved: $${stats.totalCostSaved.toFixed(4)}`);
console.log(`└─ Avg Response Time: ${stats.averageResponseTime.toFixed(2)}ms`);

// Provider-specific stats
Object.entries(stats.byProvider).forEach(([provider, data]) => {
  console.log(`${provider}: ${data.hits}/${data.requests} hits, $${data.costSaved.toFixed(4)} saved`);
});

// Reset statistics 
cache.resetStats();
```

### Cache Invalidation Patterns

```typescript
// Delete all OpenAI GPT-4 entries
await cache.deleteByPattern('*openai:gpt-4:*');

// Delete all entries from a specific time period
await cache.deleteByPattern(`*${today}*`);

// Delete provider-specific entries
await cache.deleteByPattern('*anthropic:*');
```

## Error Handling & Reliability

`smart-ai-cache` includes comprehensive error handling:

- **Automatic retries** with exponential backoff (3 attempts)
- **Graceful degradation** when cache storage fails
- **Circuit breaker** pattern for Redis connection issues  
- **Fallback to memory** when Redis is unavailable

```typescript
// Errors are handled automatically, but you can catch them
try {
  const response = await cache.wrap(apiCall, options);
} catch (error) {
  console.error('API call failed after retries:', error);
  // Your fallback logic here
}
```

## API Reference

### Core Classes

- `AIResponseCache` - Main caching class with storage abstraction
- `OpenAICache` - OpenAI-specific wrapper with cost tracking
- `AnthropicCache` - Anthropic Claude wrapper with cost tracking  
- `GoogleCache` - Google Gemini wrapper
- `MemoryStorage` - In-memory storage implementation
- `RedisStorage` - Redis storage implementation

### Key Methods

- `wrap(fn, options)` - Cache a function call
- `clear()` - Clear all cache entries
- `delete(key)` - Delete specific entry
- `deleteByPattern(pattern)` - Pattern-based deletion
- `getStats()` - Get performance statistics
- `disconnect()` - Close storage connections

For complete API documentation, visit [TypeDoc documentation](https://archiesdubey.github.io/smart-ai-cache/).

## Contributing

We welcome contributions! Here's how to get started:

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)  
3. Run tests (`npm test`)
4. Run benchmarks (`npm run benchmark`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) file for details.

---

**Made with ❤️ for the AI developer community**

⭐ Star us on GitHub | 📖 [Documentation](https://archiesdubey.github.io/smart-ai-cache/) | 🐛 [Report Issues](https://github.com/ArchiesDubey/smart-ai-cache/issues)
