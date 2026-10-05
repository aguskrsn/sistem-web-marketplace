// ============================================================
// REDIS CONFIG & CACHE HELPER
// ============================================================

const Redis = require('ioredis');
const { logger } = require('./logger');

let redisClient = null;

async function connectRedis() {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

  redisClient = new Redis(redisUrl, {
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    retryStrategy: (times) => {
      if (times > 3) return null; // Berhenti mencoba setelah 3x
      return Math.min(times * 200, 1000);
    },
  });

  redisClient.on('error', (err) => {
    logger.warn('⚠️  Redis error (non-fatal):', err.message);
  });

  redisClient.on('connect', () => {
    logger.info('✅ Redis connected');
  });

  try {
    await redisClient.connect();
  } catch (err) {
    logger.warn('⚠️  Redis tidak tersedia, cache dinonaktifkan:', err.message);
    redisClient = null; // Fallback: no cache
  }
}

// ── Cache Helper ────────────────────────────────────────────

const cache = {
  /**
   * Ambil data dari cache
   */
  async get(key) {
    if (!redisClient) return null;
    try {
      const data = await redisClient.get(key);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  },

  /**
   * Simpan data ke cache
   * @param {string} key
   * @param {*} value
   * @param {number} ttlSeconds - Default 5 menit
   */
  async set(key, value, ttlSeconds = 300) {
    if (!redisClient) return;
    try {
      await redisClient.setex(key, ttlSeconds, JSON.stringify(value));
    } catch {
      // Silently fail
    }
  },

  /**
   * Hapus cache berdasarkan key
   */
  async del(key) {
    if (!redisClient) return;
    try {
      await redisClient.del(key);
    } catch {
      // Silently fail
    }
  },

  /**
   * Hapus semua cache dengan prefix tertentu
   */
  async delPattern(pattern) {
    if (!redisClient) return;
    try {
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) {
        await redisClient.del(...keys);
      }
    } catch {
      // Silently fail
    }
  },

  /**
   * Simpan refresh token ke blacklist (logout)
   */
  async blacklistToken(token, expiresInSeconds) {
    if (!redisClient) return;
    try {
      await redisClient.setex(`blacklist:${token}`, expiresInSeconds, '1');
    } catch {
      // Silently fail
    }
  },

  /**
   * Cek apakah token di-blacklist
   */
  async isTokenBlacklisted(token) {
    if (!redisClient) return false;
    try {
      const result = await redisClient.get(`blacklist:${token}`);
      return result === '1';
    } catch {
      return false;
    }
  },

  /**
   * Rate limiting counter
   */
  async incrWithExpiry(key, windowSeconds) {
    if (!redisClient) return { count: 0, ttl: 0 };
    try {
      const multi = redisClient.multi();
      multi.incr(key);
      multi.expire(key, windowSeconds);
      multi.ttl(key);
      const results = await multi.exec();
      return {
        count: results[0][1],
        ttl: results[2][1],
      };
    } catch {
      return { count: 0, ttl: 0 };
    }
  },
};

function getRedisClient() {
  return redisClient;
}

module.exports = { connectRedis, cache, getRedisClient };
