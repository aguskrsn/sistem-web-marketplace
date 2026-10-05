// ============================================================
// PRODUCT ROUTES - Public & User
// ============================================================

const express = require('express');
const { prisma } = require('../config/database');
const { cache } = require('../config/redis');
const { optionalAuth, authenticate } = require('../middleware/auth.middleware');
const { apiRateLimiter } = require('../middleware/rateLimiter.middleware');

const router = express.Router();

// ─────────────────────────────────────────────────────────────
// GET /api/products
// List produk dengan filter, search, pagination
// ─────────────────────────────────────────────────────────────
router.get('/', apiRateLimiter, async (req, res, next) => {
  try {
    const {
      brand,
      category,
      status,
      search,
      featured,
      page = 1,
      limit = 12,
      sort = 'createdAt',
      order = 'desc',
    } = req.query;

    const take = Math.min(parseInt(limit), 50);
    const skip = (parseInt(page) - 1) * take;

    // Build cache key
    const cacheKey = `products:${JSON.stringify(req.query)}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const where = {
      isActive: true,
      ...(brand && { brand: brand.toUpperCase() }),
      ...(status && { numbers: { some: { status: status.toUpperCase() } } }),
      ...(featured === 'true' && { isFeatured: true }),
      ...(category && {
        category: { slug: category },
      }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        take,
        skip,
        orderBy: { [sort]: order },
        select: {
          id: true,
          name: true,
          slug: true,
          price: true,
          brand: true,
          totalNumbers: true,
          soldNumbers: true,
          isFeatured: true,
          category: { select: { name: true, slug: true } },
          images: {
            where: { isPrimary: true },
            select: { url: true, alt: true },
            take: 1,
          },
          numbers: {
            select: { status: true },
          },
        },
      }),
      prisma.product.count({ where }),
    ]);

    const response = {
      success: true,
      data: {
        products,
        pagination: {
          total,
          page: parseInt(page),
          limit: take,
          totalPages: Math.ceil(total / take),
        },
      },
    };

    await cache.set(cacheKey, response, 120); // Cache 2 menit
    res.json(response);
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/products/:slug
// Detail produk dengan nomor-nomor
// ─────────────────────────────────────────────────────────────
router.get('/:slug', optionalAuth, async (req, res, next) => {
  try {
    const { slug } = req.params;
    const cacheKey = `product:${slug}`;

    let product = await cache.get(cacheKey);

    if (!product) {
      product = await prisma.product.findUnique({
        where: { slug, isActive: true },
        include: {
          category: { select: { id: true, name: true, slug: true } },
          images: { orderBy: { sortOrder: 'asc' } },
          numbers: {
            orderBy: { number: 'asc' },
            select: {
              id: true,
              number: true,
              size: true,
              status: true,
              lockedUntil: true,
            },
          },
        },
      });

      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Produk tidak ditemukan',
        });
      }

      await cache.set(cacheKey, product, 60); // Cache 1 menit
    }

    // Hitung statistik nomor
    const numberStats = {
      total: product.numbers.length,
      available: product.numbers.filter(n => n.status === 'AVAILABLE').length,
      locked: product.numbers.filter(n => n.status === 'LOCKED').length,
      sold: product.numbers.filter(n => n.status === 'SOLD').length,
    };

    res.json({
      success: true,
      data: { product: { ...product, numberStats } },
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/products/:id/lock-number
// Lock nomor untuk user selama checkout
// ─────────────────────────────────────────────────────────────
router.post('/:id/lock-number', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { numberId } = req.body;

    if (!numberId) {
      return res.status(400).json({
        success: false,
        message: 'ID nomor diperlukan',
      });
    }

    const productNumber = await prisma.productNumber.findFirst({
      where: {
        id: numberId,
        productId: id,
        status: 'AVAILABLE',
      },
    });

    if (!productNumber) {
      return res.status(409).json({
        success: false,
        message: 'Nomor tidak tersedia',
      });
    }

    // Lock selama 15 menit
    const lockedUntil = new Date(Date.now() + 15 * 60 * 1000);

    const locked = await prisma.productNumber.update({
      where: { id: numberId },
      data: {
        status: 'LOCKED',
        lockedUntil,
        lockedByUserId: req.user.id,
      },
    });

    // Hapus cache produk
    const product = await prisma.product.findUnique({ where: { id }, select: { slug: true } });
    if (product) await cache.del(`product:${product.slug}`);

    res.json({
      success: true,
      message: 'Nomor berhasil di-lock',
      data: { number: locked, lockedUntil },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
