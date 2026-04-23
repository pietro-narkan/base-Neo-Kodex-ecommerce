import { PrismaClient, CouponType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  const adminEmail = 'admin@neo-kodex.local';
  const adminPassword = 'changeme123';
  const passwordHash = await bcrypt.hash(adminPassword, 10);

  await prisma.admin.upsert({
    where: { email: adminEmail },
    update: { role: 'ADMIN' },
    create: {
      email: adminEmail,
      passwordHash,
      name: 'Admin',
      role: 'ADMIN',
    },
  });
  console.log(`  - Admin:   ${adminEmail}  (password: ${adminPassword})`);

  const settings: Array<{ key: string; value: unknown }> = [
    { key: 'store.name', value: 'Neo-Kodex Store' },
    { key: 'store.currency', value: 'CLP' },
    { key: 'store.country', value: 'CL' },
    { key: 'store.tax_rate_bp', value: 1900 },
    { key: 'store.contact_email', value: 'contacto@neo-kodex.local' },
    { key: 'store.description', value: 'Base ecommerce Neo-Kodex' },
    {
      key: 'store.bank_details',
      value:
        'Banco Estado — Cuenta Vista\nTitular: (configurar)\nRUT: (configurar)\nN° cuenta: (configurar)\nEmail aviso: (configurar)',
    },
    { key: 'store.shipping_flat_rate', value: 3990 },
    { key: 'store.shipping_free_threshold', value: 50000 },
    { key: 'store.email_from', value: 'no-reply@neo-kodex.local' },
  ];
  for (const s of settings) {
    await prisma.setting.upsert({
      where: { key: s.key },
      update: { value: s.value as never },
      create: { key: s.key, value: s.value as never },
    });
  }
  console.log(`  - Settings: ${settings.length} defaults`);

  const colorAttr = await prisma.attribute.upsert({
    where: { slug: 'color' },
    update: {},
    create: { name: 'Color', slug: 'color' },
  });
  const sizeAttr = await prisma.attribute.upsert({
    where: { slug: 'talla' },
    update: {},
    create: { name: 'Talla', slug: 'talla' },
  });

  const red = await prisma.attributeValue.upsert({
    where: { attributeId_slug: { attributeId: colorAttr.id, slug: 'rojo' } },
    update: {},
    create: { attributeId: colorAttr.id, value: 'Rojo', slug: 'rojo' },
  });
  await prisma.attributeValue.upsert({
    where: { attributeId_slug: { attributeId: colorAttr.id, slug: 'azul' } },
    update: {},
    create: { attributeId: colorAttr.id, value: 'Azul', slug: 'azul' },
  });
  await prisma.attributeValue.upsert({
    where: { attributeId_slug: { attributeId: sizeAttr.id, slug: 'm' } },
    update: {},
    create: { attributeId: sizeAttr.id, value: 'M', slug: 'm' },
  });
  console.log('  - Attributes: Color (Rojo, Azul), Talla (M)');

  const category = await prisma.category.upsert({
    where: { slug: 'general' },
    update: {},
    create: { name: 'General', slug: 'general' },
  });

  const demoProduct = await prisma.product.upsert({
    where: { slug: 'producto-demo' },
    update: {},
    create: {
      name: 'Producto Demo',
      slug: 'producto-demo',
      description: 'Producto de ejemplo para validar la base',
      shortDesc: 'Demo',
      categoryId: category.id,
      active: true,
      featured: true,
    },
  });

  const variant = await prisma.variant.upsert({
    where: { sku: 'DEMO-001' },
    update: {},
    create: {
      productId: demoProduct.id,
      sku: 'DEMO-001',
      name: 'Demo estándar',
      priceNet: 10000,
      priceGross: 11900,
      stock: 100,
      active: true,
    },
  });

  await prisma.variantAttribute.upsert({
    where: {
      variantId_attributeValueId: {
        variantId: variant.id,
        attributeValueId: red.id,
      },
    },
    update: {},
    create: {
      variantId: variant.id,
      attributeValueId: red.id,
    },
  });
  console.log('  - Category "General", Product "Producto Demo" con variante DEMO-001');

  await prisma.coupon.upsert({
    where: { code: 'BIENVENIDA10' },
    update: {},
    create: {
      code: 'BIENVENIDA10',
      type: CouponType.PERCENTAGE,
      value: 10,
      maxUses: 100,
      active: true,
    },
  });
  console.log('  - Coupon: BIENVENIDA10 (10% OFF, 100 usos)');

  console.log('Seeding done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
