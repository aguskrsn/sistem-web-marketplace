// ============================================================
// PUBLIC ROUTES - Categories, Banners, Settings
// ============================================================

const express = require('express');
const { prisma } = require('../config/database');
const { cache } = require('../config/redis');

const router = express.Router();

// ─────────────────────────────────────────────────────────────
// GET /api/public/categories
// ─────────────────────────────────────────────────────────────
router.get('/categories', async (req, res, next) => {
  try {
    const cacheKey = 'public:categories';
    let categories = await cache.get(cacheKey);

    if (!categories) {
      categories = await prisma.category.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      });
      await cache.set(cacheKey, categories, 3600); // 1 jam
    }

    res.json({ success: true, data: { categories } });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/public/banners
// ─────────────────────────────────────────────────────────────
router.get('/banners', async (req, res, next) => {
  try {
    const cacheKey = 'public:banners';
    let banners = await cache.get(cacheKey);

    if (!banners) {
      banners = await prisma.banner.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      });
      await cache.set(cacheKey, banners, 3600); // 1 jam
    }

    res.json({ success: true, data: { banners } });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/public/settings
// ─────────────────────────────────────────────────────────────
router.get('/settings', async (req, res, next) => {
  try {
    const cacheKey = 'public:settings';
    let settings = await cache.get(cacheKey);

    if (!settings) {
      const data = await prisma.siteSetting.findMany();
      // Ubah dari array of objects menjadi object map
      settings = data.reduce((acc, curr) => {
        acc[curr.key] = curr.type === 'number' ? Number(curr.value) 
                      : curr.type === 'boolean' ? curr.value === 'true' 
                      : curr.value;
        return acc;
      }, {});
      
      await cache.set(cacheKey, settings, 3600); // 1 jam
    }

    res.json({ success: true, data: { settings } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
