export const DEFAULT_CACHE_CONFIG = {
    ttl: 3600, // 1 hour in seconds
    maxSize: 1000,
    storage: 'memory',
    redisOptions: {},
    keyPrefix: 'ai-cache:',
    enableStats: true,
    debug: false,
};
