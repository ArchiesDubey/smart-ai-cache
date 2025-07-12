import { CacheConfig } from './types.js';

export const DEFAULT_CACHE_CONFIG: Required<CacheConfig> = {
  ttl: 3600, // 1 hour in seconds
  maxSize: 1000,
  storage: 'memory',
  redisOptions: {},
  keyPrefix: 'ai-cache:',
  enableStats: true,
  debug: false,
};
