import { DEFAULT_CACHE_CONFIG } from './constants.js';
import { generateHashedKeyForPayload } from '../utils/key-generator.js';
import { MemoryStorage } from '../storage/memory-storage.js';
import { RedisStorage } from '../storage/redis-storage.js';
import { LocalEmbeddingProvider } from '../embeddings/local.js';
import { MemoryVectorStore } from '../vector/memory-vector-store.js';
import { RedisVectorStore } from '../vector/redis-vector-store.js';
export class AIResponseCache {
    constructor(config) {
        // Semantic tier (only populated when config.semantic.enabled)
        this.semanticEnabled = false;
        this.semanticThreshold = 0.95;
        this.semanticTopK = 1;
        this.semanticLogNearMisses = false;
        this.config = this.validateAndMergeConfig(config);
        this.debug = this.config.debug;
        this.stats = this.resetStats();
        this.storage = this.initializeStorage();
        this.initializeSemantic();
    }
    async wrap(fn, options) {
        this.validateWrapOptions(options);
        const startTime = Date.now();
        this.stats.totalRequests++;
        this.initializeProviderStats(options.provider);
        const key = options.cacheKey || this.generateKey(options.provider, options.model, options.prompt, options.params);
        // Try to get from cache with error handling
        try {
            const cachedEntry = await this.storage.get(key);
            if (cachedEntry) {
                this.logDebug(`Cache hit for key: ${key}`);
                this.updateCacheHitStats(cachedEntry);
                return cachedEntry.value;
            }
        }
        catch (error) {
            this.logError('Cache get error:', error);
            // Continue to API call on cache error
        }
        // Semantic tier — runs only on an exact miss, so the hot path stays
        // sub-millisecond and pays no embedding cost. Embedding is computed once
        // and reused for both the search here and the add() on a full miss.
        let queryEmbedding = null;
        const semanticOn = options.semantic?.enabled ?? this.semanticEnabled;
        if (semanticOn && this.embeddingProvider && this.vectorStore) {
            const text = this.extractEmbedText(options.prompt);
            if (text) {
                const threshold = options.semantic?.threshold ?? this.semanticThreshold;
                try {
                    queryEmbedding = await this.embeddingProvider.embed(text);
                    const matches = await this.vectorStore.search(queryEmbedding, this.semanticTopK);
                    const top = matches[0];
                    if (top && top.score >= threshold) {
                        const entry = await this.storage.get(top.id);
                        if (entry) {
                            this.logDebug(`Semantic hit (score=${top.score.toFixed(4)}) for key: ${top.id}`);
                            this.updateSemanticHitStats(entry);
                            return entry.value;
                        }
                        // Vector pointed at an expired/evicted entry — fall through to miss.
                    }
                    else if (top && this.semanticLogNearMisses) {
                        this.stats.nearMisses++;
                        this.logDebug(`Semantic near-miss (score=${top.score.toFixed(4)} < threshold=${threshold}) for key: ${top.id}`);
                    }
                }
                catch (error) {
                    this.logError('Semantic lookup error:', error);
                    // Fall through to the normal miss path on any embedding/search error.
                }
            }
        }
        // Cache miss - call the original function with retry logic
        this.stats.cacheMisses++;
        this.stats.byProvider[options.provider].requests++;
        this.updateHitRate();
        let result;
        let attempt = 0;
        const maxRetries = 3;
        while (attempt < maxRetries) {
            try {
                result = await fn();
                break;
            }
            catch (error) {
                attempt++;
                this.logError(`API call attempt ${attempt} failed:`, error);
                if (attempt >= maxRetries) {
                    this.logError('All API call attempts failed, throwing error');
                    throw error;
                }
                // Exponential backoff (reduced for tests if debug mode)
                const backoffMs = this.debug ? Math.pow(2, attempt) * 10 : Math.pow(2, attempt) * 1000;
                await this.sleep(backoffMs);
            }
        }
        const endTime = Date.now();
        this.updateResponseTimeStats(endTime - startTime);
        const { value, tokenCount = 0, cost = 0 } = result;
        // Try to store in cache with error handling
        try {
            const newEntry = {
                key,
                value,
                timestamp: Date.now(),
                ttl: options.ttl || this.config.ttl,
                provider: options.provider,
                model: options.model,
                tokenCount,
                cost,
            };
            await this.storage.set(key, newEntry);
            this.logDebug(`Cache set for key: ${key}`);
        }
        catch (error) {
            this.logError('Cache set error:', error);
            // Don't throw on cache set error, just log it
        }
        // Index the embedding so future paraphrases hit. The exact key is the
        // vector id, so a later semantic hit maps straight back to this entry.
        if (semanticOn && queryEmbedding && this.vectorStore) {
            try {
                await this.vectorStore.add(key, queryEmbedding);
            }
            catch (error) {
                this.logError('Vector store add error:', error);
            }
        }
        return value;
    }
    getStats() {
        return this.stats;
    }
    resetStats() {
        this.stats = {
            totalRequests: 0,
            cacheHits: 0,
            cacheMisses: 0,
            semanticHits: 0,
            nearMisses: 0,
            hitRate: 0,
            totalCostSaved: 0,
            averageResponseTime: 0,
            lastResetTime: new Date(),
            byProvider: {},
        };
        return this.stats;
    }
    async clear() {
        try {
            await this.storage.clear();
            if (this.semanticEnabled && this.vectorStore) {
                await this.vectorStore.clear();
            }
            this.logDebug('Cache cleared successfully');
        }
        catch (error) {
            this.logError('Cache clear error:', error);
            throw error;
        }
    }
    async delete(key) {
        try {
            const result = await this.storage.delete(key);
            this.logDebug(`Cache delete for key: ${key}, result: ${result}`);
            return result;
        }
        catch (error) {
            this.logError('Cache delete error:', error);
            return false;
        }
    }
    async has(key) {
        try {
            return await this.storage.has(key);
        }
        catch (error) {
            this.logError('Cache has error:', error);
            return false;
        }
    }
    generateKey(provider, model, prompt, params) {
        const promptHash = generateHashedKeyForPayload(prompt);
        const paramsHash = generateHashedKeyForPayload(params);
        return `${this.config.keyPrefix}${provider}:${model}:${promptHash}:${paramsHash}`;
    }
    async getCacheSize() {
        try {
            return await this.storage.size();
        }
        catch (error) {
            this.logError('Cache size error:', error);
            return 0;
        }
    }
    validateAndMergeConfig(config) {
        const merged = { ...DEFAULT_CACHE_CONFIG, ...config };
        if (merged.ttl <= 0) {
            throw new Error('TTL must be positive');
        }
        if (merged.maxSize <= 0) {
            throw new Error('Max size must be positive');
        }
        if (!['memory', 'redis'].includes(merged.storage)) {
            throw new Error('Storage must be either "memory" or "redis"');
        }
        return merged;
    }
    validateWrapOptions(options) {
        if (!options.provider || typeof options.provider !== 'string') {
            throw new Error('Provider is required and must be a string');
        }
        if (!options.model || typeof options.model !== 'string') {
            throw new Error('Model is required and must be a string');
        }
        if (options.ttl !== undefined && (typeof options.ttl !== 'number' || options.ttl <= 0)) {
            throw new Error('TTL must be a positive number');
        }
    }
    initializeStorage() {
        try {
            if (this.config.storage === 'redis') {
                if (!this.config.redisOptions || Object.keys(this.config.redisOptions).length === 0) {
                    this.logError('Redis options are required when using Redis storage');
                    throw new Error('Redis options are required when using Redis storage');
                }
                return new RedisStorage(this.config.redisOptions, this.config.keyPrefix);
            }
            else {
                return new MemoryStorage(this.config.maxSize);
            }
        }
        catch (error) {
            this.logError('Storage initialization error:', error);
            this.logError('Falling back to memory storage');
            return new MemoryStorage(this.config.maxSize);
        }
    }
    initializeSemantic() {
        const sem = this.config.semantic;
        this.semanticEnabled = !!sem?.enabled;
        if (!this.semanticEnabled)
            return;
        this.semanticThreshold = sem.threshold ?? 0.95;
        this.semanticTopK = sem.topK ?? 1;
        this.semanticLogNearMisses = sem.logNearMisses ?? false;
        this.embeddingProvider = sem.provider ?? new LocalEmbeddingProvider({ model: sem.model });
        // Default the vector store to match the cache's storage backend, so a
        // Redis-backed cache keeps semantic vectors on the same single Redis.
        this.vectorStore =
            sem.vectorStore ??
                (this.config.storage === 'redis'
                    ? new RedisVectorStore({ redisOptions: this.config.redisOptions })
                    : new MemoryVectorStore());
        this.logDebug(`Semantic tier enabled (provider=${this.embeddingProvider.id}, threshold=${this.semanticThreshold})`);
    }
    /**
     * Pick the text to embed. We embed the last user message only — system
     * prompts and prior history pollute similarity. Falls back sensibly for
     * string prompts and plain objects.
     */
    extractEmbedText(prompt) {
        if (prompt == null)
            return null;
        if (typeof prompt === 'string')
            return prompt.trim() || null;
        if (Array.isArray(prompt)) {
            for (let i = prompt.length - 1; i >= 0; i--) {
                const msg = prompt[i];
                if (msg && (msg.role === 'user' || msg.role === undefined)) {
                    const text = this.messageContentToText(msg.content ?? msg);
                    if (text)
                        return text;
                }
            }
            const last = prompt[prompt.length - 1];
            return last ? this.messageContentToText(last.content ?? last) : null;
        }
        if (typeof prompt === 'object') {
            if (typeof prompt.content === 'string')
                return prompt.content.trim() || null;
            return JSON.stringify(prompt);
        }
        return String(prompt);
    }
    messageContentToText(content) {
        if (content == null)
            return null;
        if (typeof content === 'string')
            return content.trim() || null;
        // OpenAI multimodal: array of parts; concatenate the text parts.
        if (Array.isArray(content)) {
            const parts = content
                .map((p) => (typeof p === 'string' ? p : typeof p?.text === 'string' ? p.text : ''))
                .filter(Boolean);
            const joined = parts.join(' ').trim();
            return joined || null;
        }
        if (typeof content === 'object' && typeof content.text === 'string') {
            return content.text.trim() || null;
        }
        return null;
    }
    updateSemanticHitStats(entry) {
        this.stats.cacheHits++;
        this.stats.semanticHits++;
        this.stats.totalCostSaved += entry.cost;
        this.initializeProviderStats(entry.provider);
        this.stats.byProvider[entry.provider].hits++;
        this.stats.byProvider[entry.provider].costSaved += entry.cost;
        this.updateHitRate();
    }
    initializeProviderStats(provider) {
        if (!this.stats.byProvider[provider]) {
            this.stats.byProvider[provider] = {
                requests: 0,
                hits: 0,
                costSaved: 0,
            };
        }
    }
    updateCacheHitStats(entry) {
        this.stats.cacheHits++;
        this.stats.totalCostSaved += entry.cost;
        this.stats.byProvider[entry.provider].hits++;
        this.stats.byProvider[entry.provider].costSaved += entry.cost;
        this.updateHitRate();
    }
    updateHitRate() {
        this.stats.hitRate = this.stats.totalRequests > 0
            ? (this.stats.cacheHits / this.stats.totalRequests) * 100
            : 0;
    }
    updateResponseTimeStats(responseTime) {
        const totalRequests = this.stats.totalRequests;
        this.stats.averageResponseTime = totalRequests > 1
            ? (this.stats.averageResponseTime * (totalRequests - 1) + responseTime) / totalRequests
            : responseTime;
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    logDebug(message, ...args) {
        if (this.debug) {
            console.log(`[AIResponseCache] ${message}`, ...args);
        }
    }
    logError(message, error) {
        console.error(`[AIResponseCache] ${message}`, error);
    }
    // Pattern-based cache invalidation (BRD REQ-004)
    async deleteByPattern(pattern) {
        try {
            const keys = await this.storage.keys();
            const matchingKeys = keys.filter(key => {
                const regex = new RegExp(pattern.replace(/\*/g, '.*'));
                return regex.test(key);
            });
            let deletedCount = 0;
            for (const key of matchingKeys) {
                const deleted = await this.storage.delete(key);
                if (deleted)
                    deletedCount++;
            }
            this.logDebug(`Deleted ${deletedCount} keys matching pattern: ${pattern}`);
            return deletedCount;
        }
        catch (error) {
            this.logError('Pattern delete error:', error);
            return 0;
        }
    }
    // Disconnect from storage (useful for Redis)
    async disconnect() {
        try {
            if (this.storage instanceof RedisStorage) {
                await this.storage.disconnect();
            }
            // Close the vector store's own connection if it owns one (e.g. RedisVectorStore).
            const vectorStore = this.vectorStore;
            if (vectorStore && typeof vectorStore.disconnect === 'function') {
                await vectorStore.disconnect();
            }
            this.logDebug('Storage disconnected successfully');
        }
        catch (error) {
            this.logError('Storage disconnect error:', error);
        }
    }
    // Protected method to access storage (replaces @ts-ignore pattern)
    getStorageEntry(key) {
        return this.storage.get(key);
    }
}
