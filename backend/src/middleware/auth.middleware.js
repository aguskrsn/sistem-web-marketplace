// ============================================================
// AUTH MIDDLEWARE - JWT + Redis Blacklist
// ============================================================

const jwt = require('jsonwebtoken');
const { cache } = require('../config/redis');
const { prisma } = require('../config/database');

/**
 * Verifikasi JWT Access Token
 * Header: Authorization: Bearer <token>
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Token autentikasi diperlukan',
      });
    }

    const token = authHeader.split(' ')[1];

    // Cek apakah token di-blacklist (logout)
    const isBlacklisted = await cache.isTokenBlacklisted(token);
    if (isBlacklisted) {
      return res.status(401).json({
        success: false,
        message: 'Token tidak valid (sudah logout)',
      });
    }

    // Verifikasi token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Ambil user dari cache dulu, lalu DB
    const cacheKey = `user:${decoded.userId}`;
    let user = await cache.get(cacheKey);

    if (!user) {
      user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          avatar: true,
          isActive: true,
          isVerified: true,
        },
      });

      if (user) {
        await cache.set(cacheKey, user, 300); // Cache 5 menit
      }
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User tidak ditemukan',
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Akun Anda dinonaktifkan',
      });
    }

    req.user = user;
    req.token = token;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token kedaluwarsa',
        code: 'TOKEN_EXPIRED',
      });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Token tidak valid',
      });
    }
    next(err);
  }
};

/**
 * Middleware opsional - authenticate jika ada token, skip jika tidak
 */
const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }
  return authenticate(req, res, next);
};

/**
 * Middleware otorisasi role
 * @param {...string} roles - Role yang diizinkan
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Autentikasi diperlukan',
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Akses ditolak: izin tidak mencukupi',
      });
    }

    next();
  };
};

module.exports = { authenticate, optionalAuth, authorize };
