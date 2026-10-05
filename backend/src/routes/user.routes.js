// ============================================================
// USER ROUTES - Profile, Cart, Wishlist
// ============================================================

const express = require('express');
const { body, validationResult } = require('express-validator');
const { prisma } = require('../config/database');
const { authenticate } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(authenticate);

// ─────────────────────────────────────────────────────────────
// GET /api/users/profile
// ─────────────────────────────────────────────────────────────
router.get('/profile', async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        address: true,
        avatar: true,
        role: true,
        provider: true,
        createdAt: true,
      },
    });

    res.json({ success: true, data: { user } });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────
// PUT /api/users/profile
// ─────────────────────────────────────────────────────────────
router.put('/profile',
  [
    body('name').optional().trim().notEmpty(),
    body('phone').optional().trim(),
    body('address').optional().trim(),
  ],
  async (req, res, next) => {
    try {
      const { name, phone, address } = req.body;

      const updatedUser = await prisma.user.update({
        where: { id: req.user.id },
        data: {
          ...(name && { name }),
          ...(phone && { phone }),
          ...(address && { address }),
        },
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          address: true,
          avatar: true,
        },
      });

      // Invalidate cache
      const { cache } = require('../config/redis');
      await cache.del(`user:${req.user.id}`);

      res.json({
        success: true,
        message: 'Profil berhasil diperbarui',
        data: { user: updatedUser },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─────────────────────────────────────────────────────────────
// GET /api/users/cart
// ─────────────────────────────────────────────────────────────
router.get('/cart', async (req, res, next) => {
  try {
    const cartItems = await prisma.cartItem.findMany({
      where: { userId: req.user.id },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
            price: true,
            brand: true,
            images: { where: { isPrimary: true }, take: 1 },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: { cart: cartItems } });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/users/cart
// ─────────────────────────────────────────────────────────────
router.post('/cart', async (req, res, next) => {
  try {
    const { productId, quantity = 1 } = req.body;

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      return res.status(404).json({ success: false, message: 'Produk tidak ditemukan' });
    }

    const cartItem = await prisma.cartItem.upsert({
      where: {
        userId_productId: { userId: req.user.id, productId },
      },
      update: { quantity: { increment: quantity } },
      create: { userId: req.user.id, productId, quantity },
    });

    res.json({ success: true, message: 'Ditambahkan ke keranjang', data: { cartItem } });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────
// DELETE /api/users/cart/:id
// ─────────────────────────────────────────────────────────────
router.delete('/cart/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const cartItem = await prisma.cartItem.findFirst({
      where: { id, userId: req.user.id },
    });

    if (!cartItem) {
      return res.status(404).json({ success: false, message: 'Item tidak ditemukan di keranjang' });
    }

    await prisma.cartItem.delete({ where: { id } });

    res.json({ success: true, message: 'Item dihapus dari keranjang' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
