// ============================================================
// ADMIN ROUTES - Dashboard, Product Management, Order Management
// ============================================================

const express = require('express');
const { prisma } = require('../config/database');
const { cache } = require('../config/redis');
const { authenticate, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

// Semua route di sini wajib ADMIN atau SUPER_ADMIN
router.use(authenticate);
router.use(authorize('ADMIN', 'SUPER_ADMIN'));

// ─────────────────────────────────────────────────────────────
// GET /api/admin/dashboard/stats
// ─────────────────────────────────────────────────────────────
router.get('/dashboard/stats', async (req, res, next) => {
  try {
    const [
      totalOrders,
      pendingOrders,
      totalProducts,
      totalUsers,
      recentOrders
    ] = await Promise.all([
      prisma.order.count(),
      prisma.order.count({ where: { status: 'PENDING' } }),
      prisma.product.count({ where: { isActive: true } }),
      prisma.user.count({ where: { role: 'USER' } }),
      prisma.order.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { name: true, email: true } } }
      })
    ]);

    // Hitung total revenue dari order yg COMPLETED
    const completedOrders = await prisma.order.findMany({
      where: { status: 'COMPLETED' },
      select: { total: true }
    });
    const totalRevenue = completedOrders.reduce((acc, curr) => acc + parseFloat(curr.total), 0);

    res.json({
      success: true,
      data: {
        stats: { totalOrders, pendingOrders, totalProducts, totalUsers, totalRevenue },
        recentOrders
      }
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/admin/products
// ─────────────────────────────────────────────────────────────
router.get('/products', async (req, res, next) => {
  try {
    const products = await prisma.product.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        category: { select: { name: true } },
        images: { where: { isPrimary: true }, take: 1 },
      }
    });

    res.json({ success: true, data: { products } });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/admin/products
// ─────────────────────────────────────────────────────────────
router.post('/products', async (req, res, next) => {
  try {
    const { name, slug, description, price, brand, categoryId, totalNumbers, isFeatured } = req.body;

    const product = await prisma.product.create({
      data: {
        name, slug, description, price, brand, categoryId, totalNumbers, isFeatured,
        numbers: {
          create: Array.from({ length: totalNumbers }, (_, i) => ({
            number: String(i + 1).padStart(3, '0'),
            status: 'AVAILABLE',
          }))
        }
      }
    });

    await cache.delPattern('products:*');

    res.status(201).json({ success: true, message: 'Produk berhasil ditambahkan', data: { product } });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/admin/orders
// ─────────────────────────────────────────────────────────────
router.get('/orders', async (req, res, next) => {
  try {
    const orders = await prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { name: true, email: true } },
        items: true
      }
    });

    res.json({ success: true, data: { orders } });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────
// PATCH /api/admin/orders/:id/status
// ─────────────────────────────────────────────────────────────
router.patch('/orders/:id/status', async (req, res, next) => {
  try {
    const { status, message } = req.body;
    const { id } = req.params;

    const order = await prisma.order.update({
      where: { id },
      data: {
        status,
        timeline: {
          create: { status, message: message || `Status diubah menjadi ${status}`, createdBy: req.user.id }
        }
      }
    });

    res.json({ success: true, message: 'Status pesanan diperbarui', data: { order } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
