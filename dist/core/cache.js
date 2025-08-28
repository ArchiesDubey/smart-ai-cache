import { DEFAULT_CACHE_CONFIG } from './constants.js';
import { generateHashedKeyForPayload } from '../utils/key-generator.js';
import { MemoryStorage } from '../storage/memory-storage.js';
import { RedisStorage } from '../storage/redis-storage.js';
export class AIResponseCache {
    constructor(config) {
        this.config = this.validateAndMergeConfig(config);
        this.debug = this.config.debug;
        this.stats = this.resetStats();
        this.storage = this.initializeStorage();
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
                // Exponential backoff
                await this.sleep(Math.pow(2, attempt) * 1000);
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
