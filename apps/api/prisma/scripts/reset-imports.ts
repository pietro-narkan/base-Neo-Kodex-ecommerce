// One-off cleanup script: wipes products/categories/media/import-jobs
// brought in by the test CSV import, keeping only the seeded "Producto Demo".
// Usage:
//   cd apps/api && pnpm tsx prisma/scripts/reset-imports.ts

import { PrismaClient } from '@prisma/client';
import { Client as MinioClient } from 'minio';

const prisma = new PrismaClient();

const minio = new MinioClient({
  endPoint: process.env.MINIO_ENDPOINT ?? 'localhost',
  port: Number(process.env.MINIO_PORT ?? 9000),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin',
});
const bucket = process.env.MINIO_BUCKET ?? 'neo-kodex-media';

// Slugs to preserve (from seed)
const KEEP_PRODUCT_SLUGS = ['producto-demo'];
const KEEP_CATEGORY_SLUGS = ['general'];

async function main() {
  console.log('→ Finding products to delete…');
  const products = await prisma.product.findMany({
    where: { slug: { notIn: KEEP_PRODUCT_SLUGS } },
    include: { media: true, variants: { include: { media: true } } },
  });
  console.log(`  ${products.length} productos a borrar`);

  const keysToDelete: string[] = [];
  for (const p of products) {
    for (const m of p.media) if (m.key) keysToDelete.push(m.key);
    for (const v of p.variants) for (const m of v.media) if (m.key) keysToDelete.push(m.key);
  }
  console.log(`  ${keysToDelete.length} objetos en MinIO a borrar`);

  if (keysToDelete.length > 0) {
    console.log('→ Borrando objetos en MinIO…');
    for (const key of keysToDelete) {
      try {
        await minio.removeObject(bucket, key);
      } catch (err) {
        console.warn(`  warn: no pude borrar ${key}:`, (err as Error).message);
      }
    }
  }

  console.log('→ Borrando productos (cascadea variants + media DB)…');
  const delProducts = await prisma.product.deleteMany({
    where: { slug: { notIn: KEEP_PRODUCT_SLUGS } },
  });
  console.log(`  ${delProducts.count} productos borrados`);

  console.log('→ Borrando categorías no-seed que quedaron sin productos…');
  // Delete leaves first (no children), iteratively until nothing changes.
  let totalCategoriesDeleted = 0;
  for (;;) {
    const leaves = await prisma.category.findMany({
      where: {
        slug: { notIn: KEEP_CATEGORY_SLUGS },
        children: { none: {} },
        products: { none: {} },
      },
      select: { id: true },
    });
    if (leaves.length === 0) break;
    const res = await prisma.category.deleteMany({
      where: { id: { in: leaves.map((l) => l.id) } },
    });
    totalCategoriesDeleted += res.count;
  }
  console.log(`  ${totalCategoriesDeleted} categorías borradas`);

  console.log('→ Borrando ImportJobs…');
  const delJobs = await prisma.importJob.deleteMany({});
  console.log(`  ${delJobs.count} jobs borrados`);

  console.log('✓ Cleanup listo');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
