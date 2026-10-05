// ============================================================
// PRISMA SEED - Fabiebsky Initial Data
// ============================================================

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ── Admin User ──────────────────────────────────────────────
  const adminPassword = process.env.ADMIN_DEFAULT_PASSWORD || 'fabiebsky@admin2025';
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@fabiebsky.id' },
    update: {},
    create: {
      email: 'admin@fabiebsky.id',
      name: 'Ferdinand',
      role: 'ADMIN',
      provider: 'LOCAL',
      isVerified: true,
      passwordHash,
    },
  });
  console.log('✅ Admin created:', admin.email);

  // ── Categories (FAB) ─────────────────────────────────────────
  const fabCategories = [
    { name: 'Kemeja', slug: 'kemeja', brand: 'FAB', sortOrder: 1 },
    { name: 'Celana', slug: 'celana', brand: 'FAB', sortOrder: 2 },
    { name: 'Jaket', slug: 'jaket', brand: 'FAB', sortOrder: 3 },
    { name: 'Kaos', slug: 'kaos', brand: 'FAB', sortOrder: 4 },
    { name: 'Aksesori', slug: 'aksesori', brand: 'FAB', sortOrder: 5 },
  ];

  for (const cat of fabCategories) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: {},
      create: cat,
    });
  }
  console.log('✅ FAB categories created');

  // ── Categories (Curated) ──────────────────────────────────────
  const curatedCategories = [
    { name: 'Vintage', slug: 'vintage-curated', brand: 'CURATED', sortOrder: 1 },
    { name: 'Preloved Premium', slug: 'preloved-premium', brand: 'CURATED', sortOrder: 2 },
    { name: 'Archive', slug: 'archive-curated', brand: 'CURATED', sortOrder: 3 },
  ];

  for (const cat of curatedCategories) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: {},
      create: cat,
    });
  }
  console.log('✅ Curated categories created');

  // ── Sample Products ──────────────────────────────────────────
  const kemejaCategory = await prisma.category.findUnique({ where: { slug: 'kemeja' } });

  const sampleProduct = await prisma.product.upsert({
    where: { slug: 'kemeja-batik-premium-001' },
    update: {},
    create: {
      name: 'Kemeja Batik Premium #001',
      slug: 'kemeja-batik-premium-001',
      description: 'Kemeja batik premium dengan motif eksklusif, bahan katun halus',
      price: 285000,
      brand: 'FAB',
      categoryId: kemejaCategory?.id,
      totalNumbers: 10,
      isFeatured: true,
      images: {
        create: [
          { url: 'https://placeholder.co/400x500', isPrimary: true, sortOrder: 0 },
        ],
      },
      numbers: {
        create: Array.from({ length: 10 }, (_, i) => ({
          number: String(i + 1).padStart(3, '0'),
          size: ['S', 'M', 'L', 'XL'][i % 4],
          status: i < 3 ? 'SOLD' : 'AVAILABLE',
        })),
      },
    },
  });
  console.log('✅ Sample product created:', sampleProduct.name);

  // ── Site Settings ─────────────────────────────────────────────
  const settings = [
    { key: 'site_name', value: 'Fabiebsky', type: 'string' },
    { key: 'site_description', value: 'Fashion Ekslusif Fabiebsky', type: 'string' },
    { key: 'contact_whatsapp', value: '6281234567890', type: 'string' },
    { key: 'contact_email', value: 'hello@fabiebsky.id', type: 'string' },
    { key: 'instagram', value: '@fabiebsky', type: 'string' },
    { key: 'free_shipping_minimum', value: '500000', type: 'number' },
    { key: 'order_payment_deadline_hours', value: '24', type: 'number' },
    { key: 'maintenance_mode', value: 'false', type: 'boolean' },
  ];

  for (const setting of settings) {
    await prisma.siteSetting.upsert({
      where: { key: setting.key },
      update: { value: setting.value },
      create: setting,
    });
  }
  console.log('✅ Site settings configured');

  console.log('\n🎉 Database seeded successfully!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Admin email    :', 'admin@fabiebsky.id');
  console.log('Admin password :', adminPassword);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
