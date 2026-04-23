import type { PrismaClient } from '@prisma/client';

/**
 * Test fixtures for checkout flow. All records use a "TEST_" prefix so they
 * can be cleaned up safely without touching regular dev data.
 */

const TEST_PREFIX = 'TEST_';

export interface TestFixture {
  categoryId: string;
  productId: string;
  variantId: string;
  sku: string;
  priceNet: number;
  priceGross: number;
  stock: number;
}

export async function setupFixture(
  prisma: PrismaClient,
  opts: { stock?: number; priceGross?: number } = {},
): Promise<TestFixture> {
  await cleanFixtures(prisma);
  await ensureCoreSettings(prisma);

  const priceGross = opts.priceGross ?? 11900; // $11.900 CLP
  const priceNet = Math.round(priceGross / 1.19);
  const stock = opts.stock ?? 10;

  const category = await prisma.category.create({
    data: { name: `${TEST_PREFIX}Cat`, slug: `${TEST_PREFIX}cat-${Date.now()}` },
  });

  const product = await prisma.product.create({
    data: {
      name: `${TEST_PREFIX}Product`,
      slug: `${TEST_PREFIX}prod-${Date.now()}`,
      categoryId: category.id,
      active: true,
    },
  });

  const variant = await prisma.variant.create({
    data: {
      productId: product.id,
      sku: `${TEST_PREFIX}SKU-${Date.now()}`,
      priceNet,
      priceGross,
      stock,
      active: true,
    },
  });

  return {
    categoryId: category.id,
    productId: product.id,
    variantId: variant.id,
    sku: variant.sku,
    priceNet,
    priceGross,
    stock,
  };
}

/**
 * Drops all TEST_-prefixed data plus any test-created orders/customers.
 * Order matters due to foreign keys:
 *   cartItems → carts → variants (blocked otherwise)
 *   orderItems → orders (cascade) → addresses
 */
export async function cleanFixtures(prisma: PrismaClient): Promise<void> {
  // 1) CartItems that reference test variants — clear them first.
  const testVariants = await prisma.variant.findMany({
    where: { sku: { startsWith: TEST_PREFIX } },
    select: { id: true },
  });
  const variantIds = testVariants.map((v) => v.id);
  if (variantIds.length > 0) {
    await prisma.cartItem.deleteMany({ where: { variantId: { in: variantIds } } });
  }
  // 2) Test-session carts (which may have no items after the above)
  await prisma.cart.deleteMany({
    where: {
      OR: [
        { sessionId: { startsWith: 'test-session-' } },
        { customer: { email: { startsWith: 'test-' } } },
      ],
    },
  });
  // 3) Orders (cascades to OrderItems)
  await prisma.order.deleteMany({
    where: {
      OR: [
        { email: { startsWith: 'test-' } },
        { items: { some: { sku: { startsWith: TEST_PREFIX } } } },
      ],
    },
  });
  // 4) Addresses of test customers (not auto-cascaded from Order delete)
  await prisma.address.deleteMany({
    where: { customer: { email: { startsWith: 'test-' } } },
  });
  // 5) Customers
  await prisma.customer.deleteMany({
    where: { email: { startsWith: 'test-' } },
  });
  // 6) Variants → Products → Categories
  await prisma.variant.deleteMany({ where: { sku: { startsWith: TEST_PREFIX } } });
  await prisma.product.deleteMany({ where: { slug: { startsWith: TEST_PREFIX } } });
  await prisma.category.deleteMany({ where: { slug: { startsWith: TEST_PREFIX } } });
}

/** Ensures settings required by OrdersService / VariantsService exist. */
async function ensureCoreSettings(prisma: PrismaClient): Promise<void> {
  const required: Array<{ key: string; value: unknown }> = [
    { key: 'store.tax_rate_bp', value: 1900 },
    { key: 'store.shipping_flat_rate', value: 3990 },
    { key: 'store.shipping_free_threshold', value: 50_000 },
    { key: 'order.last_number', value: 0 },
  ];
  for (const s of required) {
    await prisma.setting.upsert({
      where: { key: s.key },
      update: {},
      create: { key: s.key, value: s.value as object },
    });
  }
}

export function testSession(suffix = ''): string {
  return `test-session-${Date.now()}${suffix}`;
}

export function testEmail(suffix = ''): string {
  return `test-${Date.now()}${suffix}@test.local`;
}
