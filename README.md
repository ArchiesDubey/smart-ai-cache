# `smart-ai-cache`

![npm version](https://img.shields.io/npm/v/smart-ai-cache)
![License](https://img.shields.io/npm/l/smart-ai-cache)
![Downloads](https://img.shields.io/npm/dm/smart-ai-cache)

A lightweight, intelligent caching middleware for AI responses, designed to reduce API costs and improve response times for repetitive LLM queries.

## 1. Executive Summary

`smart-ai-cache` is an NPM package targeting Node.js developers building AI-powered applications. Its primary goal is to reduce API costs and improve response times for repetitive Large Language Model (LLM) queries.

### Key Value Propositions
- **Cost Reduction:** Achieve 40-80% savings on repetitive AI API calls.
- **Performance Improvement:** Experience sub-millisecond response times for cached queries.
- **Developer Experience:** Drop-in middleware with zero configuration required for basic use.
- **Multi-Provider Support:** Seamlessly works with OpenAI, Anthropic Claude, and Google Gemini APIs.

## 2. Installation

To install `smart-ai-cache` in your project, use npm or yarn:

```bash
npm install smart-ai-cache
# or
yarn add smart-ai-cache
```

## 3. Quick Start Guide

Here's how to quickly get started with `smart-ai-cache`:

```typescript
import { AIResponseCache } from 'smart-ai-cache';
import OpenAI from 'openai';

// Initialize the cache with a default TTL of 1 hour (3600 seconds)
const cache = new AIResponseCache({ ttl: 3600 });

// Initialize your OpenAI client (or any other AI provider client)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function getCachedCompletion() {
  const response = await cache.wrap(
    () => openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hello, world!' }],
    }),
    { provider: 'openai', model: 'gpt-4' }
  );

  console.log('Response:', response.choices[0].message.content);

  // Subsequent calls with the same prompt will be served from cache
  const cachedResponse = await cache.wrap(
    () => openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hello, world!' }],
    }),
    { provider: 'openai', model: 'gpt-4' }
  );
  console.log('Cached Response:', cachedResponse.choices[0].message.content);

  // Check cache statistics
  const stats = cache.getStats();
  console.log(`Cache Hits: ${stats.cacheHits}, Cache Misses: ${stats.cacheMisses}`);
}

getCachedCompletion();
```

## 4. Configuration Options

The `AIResponseCache` constructor accepts an optional `CacheConfig` object:

```typescript
interface CacheConfig {
  ttl?: number;                    // Time to live in seconds (default: 3600)
  maxSize?: number;                // Maximum cache entries (default: 1000)
  storage?: 'memory' | 'redis';    // Storage backend (default: 'memory')
  redisOptions?: RedisOptions;     // Redis connection options (requires 'ioredis')
  keyPrefix?: string;              // Cache key prefix (default: 'ai-cache:')
  enableStats?: boolean;           // Enable statistics tracking (default: true)
  debug?: boolean;                 // Enable debug logging (default: false)
}
```

**Example with custom configuration:**

```typescript
import { AIResponseCache } from 'smart-ai-cache';

const customCache = new AIResponseCache({
  ttl: 7200,       // Cache entries expire after 2 hours
  maxSize: 5000,   // Allow up to 5000 entries in memory
  enableStats: true,
  debug: false,
});
```

## 5. API Reference

For a complete and detailed API reference, including all classes, methods, and interfaces, please refer to the [TypeDoc documentation](./docs/index.html).

## 6. Provider-Specific Usage

`smart-ai-cache` provides specialized classes for popular AI providers to simplify integration and enable automatic cost tracking.

### OpenAI

```typescript
import { OpenAICache } from 'smart-ai-cache';
import OpenAI from 'openai';

const openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const openaiCache = new OpenAICache({
  ttl: 7200,
  maxSize: 5000,
  enableStats: true
}, openaiClient); // Pass the initialized OpenAI client

async function getOpenAIChatCompletion() {
  const response = await openaiCache.chatCompletion({
    model: 'gpt-4',
    messages: [{ role: 'user', content: 'Explain quantum computing' }],
    temperature: 0.7,
  });

  console.log('OpenAI Response:', response.choices[0].message.content);

  // Get statistics specific to this cache instance
  const stats = openaiCache.getStats();
  console.log(`OpenAI Cache hit rate: ${stats.hitRate}%`);
  console.log(`OpenAI Cost saved: $${stats.totalCostSaved.toFixed(2)}`);
}

getOpenAIChatCompletion();
```

### Anthropic Claude

```typescript
import { AnthropicCache } from 'smart-ai-cache';
import Anthropic from '@anthropic-ai/sdk';

const anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const anthropicCache = new AnthropicCache({
  ttl: 3600,
}, anthropicClient); // Pass the initialized Anthropic client

async function getAnthropicMessage() {
  const response = await anthropicCache.messages({
    model: 'claude-3-sonnet-20240229',
    max_tokens: 100,
    messages: [{ role: 'user', content: 'Tell me a short story.' }],
  });

  console.log('Anthropic Response:', response.content[0].text);

  const stats = anthropicCache.getStats();
  console.log(`Anthropic Cache hit rate: ${stats.hitRate}%`);
  console.log(`Anthropic Cost saved: $${stats.totalCostSaved.toFixed(2)}`);
}

getAnthropicMessage();
```

### Google Gemini

```typescript
import { GoogleCache } from 'smart-ai-cache';
import { GoogleGenerativeAI } from '@google/generative-ai';

// GoogleCache can take the API key directly or read from process.env.GOOGLE_API_KEY
const googleCache = new GoogleCache({
  ttl: 3600,
}, process.env.GOOGLE_API_KEY); 

async function getGoogleContent() {
  const response = await googleCache.generateContent({
    model: 'gemini-pro',
    contents: [{ role: 'user', parts: [{ text: 'What is the capital of France?' }] }],
  });

  console.log('Google Response:', response.response.text());

  const stats = googleCache.getStats();
  console.log(`Google Cache hit rate: ${stats.hitRate}%`);
  // Note: Cost saving for Google models is not yet implemented due to API limitations.
  console.log(`Google Cost saved: $${stats.totalCostSaved.toFixed(2)}`);
}

getGoogleContent();
```

## 7. Cache Key Generation Strategy

Cache keys are generated to ensure uniqueness and consistency across requests. The format is:

`{prefix}:{provider}:{model}:{promptHash}:{paramsHash}`

-   **Provider Identifier:** `openai`, `anthropic`, `google`
-   **Model Name:** e.g., `gpt-4`, `claude-3-opus`, `gemini-pro`
-   **Prompt Hash:** MD5 hash of the normalized prompt content.
-   **Parameters Hash:** MD5 hash of the sorted and normalized request parameters (excluding prompt/messages).

This strategy ensures that identical requests (same provider, model, prompt, and parameters) result in the same cache key.

## 8. Statistics and Analytics

The `AIResponseCache` and its provider-specific extensions provide a `getStats()` method that returns a `CacheStats` object:

```typescript
interface CacheStats {
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  hitRate: number;                 // Percentage
  totalCostSaved: number;          // USD
  averageResponseTime: number;     // Milliseconds
  lastResetTime: Date;
  byProvider: {
    [provider: string]: {
      requests: number;
      hits: number;
      costSaved: number;
    };
  };
}
```

You can reset the statistics at any time using the `resetStats()` method.

## 9. Contributing

We welcome contributions! Please see our [contributing guidelines](CONTRIBUTING.md) (coming soon) for more information.

## 10. License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
