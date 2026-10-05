// ============================================================
// AUTH ROUTES - Login, Register, Google OAuth, Refresh Token
// ============================================================

const express = require('express');
const { body, validationResult } = require('express-validator');
const { OAuth2Client } = require('google-auth-library');
const { prisma } = require('../config/database');
const { cache } = require('../config/redis');
const {
  loginWithCredentials,
  refreshAccessToken,
  revokeAllTokens,
  hashPassword,
  generateAccessToken,
  generateRefreshToken,
  saveRefreshToken,
} = require('../services/auth.service');
const { authenticate } = require('../middleware/auth.middleware');
const { loginRateLimiter } = require('../middleware/rateLimiter.middleware');

const router = express.Router();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ─────────────────────────────────────────────────────────────
// POST /api/auth/register
// ─────────────────────────────────────────────────────────────
router.post('/register',
  [
    body('name').trim().notEmpty().withMessage('Nama wajib diisi'),
    body('email').isEmail().normalizeEmail().withMessage('Format email tidak valid'),
    body('password')
      .isLength({ min: 8 }).withMessage('Password minimal 8 karakter')
      .matches(/[A-Za-z]/).withMessage('Password harus mengandung huruf')
      .matches(/[0-9]/).withMessage('Password harus mengandung angka'),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { name, email, password } = req.body;

      // Cek email duplikat
      const existing = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
      });

      if (existing) {
        return res.status(409).json({
          success: false,
          message: 'Email sudah terdaftar',
        });
      }

      const passwordHash = await hashPassword(password);

      const user = await prisma.user.create({
        data: {
          name: name.trim(),
          email: email.toLowerCase(),
          passwordHash,
          provider: 'LOCAL',
        },
        select: { id: true, email: true, name: true, role: true },
      });

      const accessToken = generateAccessToken(user.id, user.role);
      const refreshToken = generateRefreshToken(user.id);
      await saveRefreshToken(user.id, refreshToken);

      res.status(201).json({
        success: true,
        message: 'Registrasi berhasil',
        data: { user, accessToken, refreshToken },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─────────────────────────────────────────────────────────────
// POST /api/auth/login
// ─────────────────────────────────────────────────────────────
router.post('/login',
  loginRateLimiter,
  [
    body('email').isEmail().normalizeEmail().withMessage('Format email tidak valid'),
    body('password').notEmpty().withMessage('Password wajib diisi'),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { email, password } = req.body;
      const result = await loginWithCredentials(email, password);

      res.json({
        success: true,
        message: 'Login berhasil',
        data: result,
      });
    } catch (err) {
      if (err.message === 'Email atau password salah') {
        return res.status(401).json({ success: false, message: err.message });
      }
      next(err);
    }
  }
);

// ─────────────────────────────────────────────────────────────
// POST /api/auth/google
// Verifikasi Google ID Token dari frontend (One Tap / Sign In)
// ─────────────────────────────────────────────────────────────
router.post('/google', async (req, res, next) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({
        success: false,
        message: 'Google ID Token diperlukan',
      });
    }

    // Verifikasi token Google
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    // Cari atau buat user
    let user = await prisma.user.findFirst({
      where: {
        OR: [{ googleId }, { email: email.toLowerCase() }],
      },
    });

    if (!user) {
      // Register user baru via Google
      user = await prisma.user.create({
        data: {
          googleId,
          email: email.toLowerCase(),
          name,
          avatar: picture,
          provider: 'GOOGLE',
          isVerified: true,
        },
      });
    } else {
      // Update Google info jika login pertama kali dengan Google
      if (!user.googleId) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { googleId, avatar: picture, provider: 'GOOGLE', isVerified: true },
        });
      }
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Akun Anda dinonaktifkan',
      });
    }

    // Update lastLoginAt
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const accessToken = generateAccessToken(user.id, user.role);
    const refreshToken = generateRefreshToken(user.id);
    await saveRefreshToken(user.id, refreshToken);

    res.json({
      success: true,
      message: 'Login dengan Google berhasil',
      data: {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatar: user.avatar,
          role: user.role,
        },
      },
    });
  } catch (err) {
    if (err.message?.includes('Invalid token')) {
      return res.status(401).json({
        success: false,
        message: 'Google token tidak valid',
      });
    }
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/auth/refresh
// Refresh access token menggunakan refresh token
// ─────────────────────────────────────────────────────────────
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token diperlukan',
      });
    }

    const result = await refreshAccessToken(refreshToken);

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: err.message || 'Refresh token tidak valid',
    });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/auth/logout
// ─────────────────────────────────────────────────────────────
router.post('/logout', authenticate, async (req, res, next) => {
  try {
    // Blacklist access token
    const token = req.token;
    const decoded = require('jsonwebtoken').decode(token);
    if (decoded?.exp) {
      const ttl = decoded.exp - Math.floor(Date.now() / 1000);
      if (ttl > 0) await cache.blacklistToken(token, ttl);
    }

    // Revoke semua refresh token
    await revokeAllTokens(req.user.id);

    res.json({ success: true, message: 'Logout berhasil' });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/auth/me
// ─────────────────────────────────────────────────────────────
router.get('/me', authenticate, async (req, res) => {
  res.json({
    success: true,
    data: { user: req.user },
  });
});

module.exports = router;
