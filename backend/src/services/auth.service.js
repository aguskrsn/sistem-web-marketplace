// ============================================================
// AUTH SERVICE - JWT Token Management
// ============================================================

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { prisma } = require('../config/database');
const { cache } = require('../config/redis');

/**
 * Generate Access Token (short-lived)
 */
function generateAccessToken(userId, role) {
  return jwt.sign(
    { userId, role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
  );
}

/**
 * Generate Refresh Token (long-lived)
 */
function generateRefreshToken(userId) {
  return jwt.sign(
    { userId },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );
}

/**
 * Simpan refresh token ke database
 */
async function saveRefreshToken(userId, token) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7 hari

  await prisma.refreshToken.create({
    data: {
      token,
      userId,
      expiresAt,
    },
  });
}

/**
 * Refresh access token menggunakan refresh token
 */
async function refreshAccessToken(refreshToken) {
  // Verifikasi refresh token JWT
  let decoded;
  try {
    decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
  } catch {
    throw new Error('Refresh token tidak valid atau kedaluwarsa');
  }

  // Cek di database
  const storedToken = await prisma.refreshToken.findUnique({
    where: { token: refreshToken },
    include: { user: true },
  });

  if (!storedToken || storedToken.revoked) {
    throw new Error('Refresh token tidak valid');
  }

  if (storedToken.expiresAt < new Date()) {
    throw new Error('Refresh token kedaluwarsa');
  }

  const user = storedToken.user;
  if (!user.isActive) {
    throw new Error('Akun tidak aktif');
  }

  // Generate token baru
  const newAccessToken = generateAccessToken(user.id, user.role);
  const newRefreshToken = generateRefreshToken(user.id);

  // Hapus token lama, simpan yang baru (token rotation)
  await prisma.refreshToken.update({
    where: { id: storedToken.id },
    data: { revoked: true },
  });
  await saveRefreshToken(user.id, newRefreshToken);

  return { accessToken: newAccessToken, refreshToken: newRefreshToken, user };
}

/**
 * Revoke semua refresh token user (logout dari semua device)
 */
async function revokeAllTokens(userId) {
  await prisma.refreshToken.updateMany({
    where: { userId, revoked: false },
    data: { revoked: true },
  });

  // Hapus user cache
  await cache.del(`user:${userId}`);
}

/**
 * Login dengan email & password
 */
async function loginWithCredentials(email, password) {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!user || !user.passwordHash) {
    throw new Error('Email atau password salah');
  }

  if (!user.isActive) {
    throw new Error('Akun Anda dinonaktifkan');
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    throw new Error('Email atau password salah');
  }

  // Update lastLoginAt
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const accessToken = generateAccessToken(user.id, user.role);
  const refreshToken = generateRefreshToken(user.id);
  await saveRefreshToken(user.id, refreshToken);

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      avatar: user.avatar,
    },
  };
}

/**
 * Hash password
 */
async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  saveRefreshToken,
  refreshAccessToken,
  revokeAllTokens,
  loginWithCredentials,
  hashPassword,
};
