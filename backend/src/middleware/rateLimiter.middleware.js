// ============================================================
// RATE LIMITER MIDDLEWARE
// ============================================================

const { cache } = require('../config/redis');
const rateLimit = require('express-rate-limit');

/**
 * Rate limiter berbasis Redis untuk login
 */
const loginRateLimiter = async (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  const key = `ratelimit:login:${ip}`;
  const MAX_ATTEMPTS = 10;
  const WINDOW_SECONDS = 900; // 15 menit

  const { count } = await cache.incrWithExpiry(key, WINDOW_SECONDS);

  if (count > MAX_ATTEMPTS) {
    return res.status(429).json({
      success: false,
      message: 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.',
      retryAfter: WINDOW_SECONDS,
    });
  }

  next();
};

/**
 * Rate limiter untuk API umum menggunakan express-rate-limit
 */
const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Terlalu banyak request. Coba lagi dalam 15 menit.',
  },
  skip: (req) => req.user?.role === 'ADMIN', // Admin tidak dibatasi
});

module.exports = { loginRateLimiter, apiRateLimiter };
