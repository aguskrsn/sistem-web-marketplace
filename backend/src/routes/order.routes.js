// ============================================================
// ORDER ROUTES - Checkout & History
// ============================================================

const express = require('express');
const { body, validationResult } = require('express-validator');
const { prisma } = require('../config/database');
const { authenticate } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(authenticate);

// ─────────────────────────────────────────────────────────────
// POST /api/orders/checkout
// Create a new order (Checkout)
// ─────────────────────────────────────────────────────────────
router.post('/checkout',
  [
    body('items').isArray({ min: 1 }).withMessage('Item pesanan kosong'),
    body('items.*.productId').notEmpty(),
    body('items.*.numberId').notEmpty().withMessage('Nomor produk belum dipilih'),
    body('shippingName').notEmpty(),
    body('shippingPhone').notEmpty(),
    body('shippingAddress').notEmpty(),
    body('shippingCity').notEmpty(),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

      const { items, shippingName, shippingPhone, shippingAddress, shippingCity, shippingPostal, notes } = req.body;

      // Start Transaction
      const result = await prisma.$transaction(async (tx) => {
        let subtotal = 0;
        const orderItemsData = [];

        for (const item of items) {
          const product = await tx.product.findUnique({ where: { id: item.productId } });
          if (!product) throw new Error(`Produk dengan ID ${item.productId} tidak ditemukan`);

          // Verifikasi nomor produk (harus LOCKED oleh user ini, atau AVAILABLE)
          const productNumber = await tx.productNumber.findUnique({ where: { id: item.numberId } });
          
          if (!productNumber) throw new Error('Nomor produk tidak valid');
          if (productNumber.status === 'SOLD') throw new Error(`Nomor ${productNumber.number} sudah terjual`);
          if (productNumber.status === 'LOCKED' && productNumber.lockedByUserId !== req.user.id) {
             throw new Error(`Nomor ${productNumber.number} sedang dikunci oleh pengguna lain`);
          }

          // Update status nomor jadi SOLD
          await tx.productNumber.update({
            where: { id: item.numberId },
            data: { status: 'SOLD', lockedByUserId: null, lockedUntil: null },
          });

          // Update counter sold product
          await tx.product.update({
            where: { id: item.productId },
            data: { soldNumbers: { increment: 1 } },
          });

          subtotal += parseFloat(product.price);
          
          orderItemsData.push({
            productId: product.id,
            productNumberId: productNumber.id,
            productName: product.name,
            productPrice: product.price,
            quantity: 1,
          });
        }

        const shippingCost = 0; // Bisa diintegrasikan dengan API kurir
        const total = subtotal + shippingCost;
        
        // Batas waktu pembayaran (24 jam)
        const expiredAt = new Date();
        expiredAt.setHours(expiredAt.getHours() + 24);

        // Buat order
        const order = await tx.order.create({
          data: {
            userId: req.user.id,
            shippingName,
            shippingPhone,
            shippingAddress,
            shippingCity,
            shippingPostal,
            subtotal,
            shippingCost,
            total,
            notes,
            expiredAt,
            items: { create: orderItemsData },
            timeline: {
              create: { status: 'PENDING', message: 'Pesanan dibuat', createdBy: req.user.id }
            }
          },
          include: { items: true },
        });

        // Hapus dari cart jika ada
        const productIds = items.map(i => i.productId);
        await tx.cartItem.deleteMany({
          where: { userId: req.user.id, productId: { in: productIds } }
        });

        return order;
      });

      // Clear product cache
      const { cache } = require('../config/redis');
      const productIds = items.map(i => i.productId);
      const products = await prisma.product.findMany({ where: { id: { in: productIds } }, select: { slug: true } });
      for (const p of products) {
        await cache.del(`product:${p.slug}`);
      }
      await cache.delPattern('products:*');

      res.status(201).json({
        success: true,
        message: 'Pesanan berhasil dibuat',
        data: { order: result },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─────────────────────────────────────────────────────────────
// GET /api/orders
// List riwayat pesanan user
// ─────────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const orders = await prisma.order.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        items: {
          include: {
            productNumber: { select: { number: true, size: true } },
            product: { include: { images: { where: { isPrimary: true }, take: 1 } } }
          }
        }
      }
    });

    res.json({ success: true, data: { orders } });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/orders/:id
// Detail pesanan user
// ─────────────────────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: {
        items: {
          include: {
            productNumber: { select: { number: true, size: true } },
            product: { include: { images: { where: { isPrimary: true }, take: 1 } } }
          }
        },
        timeline: { orderBy: { createdAt: 'desc' } }
      }
    });

    if (!order) return res.status(404).json({ success: false, message: 'Pesanan tidak ditemukan' });

    res.json({ success: true, data: { order } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
