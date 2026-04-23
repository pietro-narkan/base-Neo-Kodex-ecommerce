// One-off script to import historical orders from a WooCommerce CSV export.
// Usage:
//   cd apps/api && pnpm tsx prisma/scripts/import-wc-orders.ts <path-to-csv>
//   (defaults to ../../../orders-*.csv if no arg)
//
// Idempotent: orders are keyed by WC's "Número de pedido" stored as Order.orderNumber.
// Re-runs skip existing orders and report them as warnings.

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { parse } from 'csv-parse/sync';
import type { OrderStatus, PaymentStatus } from '@prisma/client';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const TAX_RATE_BP = 1900; // IVA Chile 19%

function grossToNet(gross: number): number {
  return Math.round(gross / (1 + TAX_RATE_BP / 10000));
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ñ/g, 'n')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseIntOr(v: string | undefined | null, fallback = 0): number {
  if (!v) return fallback;
  const n = Number(String(v).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function mapStatus(wcStatus: string): { status: OrderStatus; paymentStatus: PaymentStatus } {
  const s = wcStatus.trim().toLowerCase();
  switch (s) {
    case 'completado':
      return { status: 'FULFILLED', paymentStatus: 'PAID' };
    case 'procesando':
      return { status: 'PAID', paymentStatus: 'PAID' };
    case 'en espera':
    case 'pendiente de pago':
      return { status: 'PENDING', paymentStatus: 'PENDING' };
    case 'cancelado':
      return { status: 'CANCELLED', paymentStatus: 'FAILED' };
    case 'reembolsado':
      return { status: 'REFUNDED', paymentStatus: 'REFUNDED' };
    default:
      return { status: 'PENDING', paymentStatus: 'PENDING' };
  }
}

function mapPaymentProvider(wcMethod: string): string {
  const m = wcMethod.trim().toLowerCase();
  if (m.includes('webpay')) return 'webpay';
  if (m.includes('transferencia')) return 'manual';
  if (m.includes('flow')) return 'flow';
  return m || 'unknown';
}

// WC exports a date in format "YYYY-MM-DD HH:MM". Convert to Date (local).
function parseWcDate(s: string | undefined): Date {
  if (!s) return new Date();
  const isoish = s.trim().replace(' ', 'T');
  const d = new Date(isoish);
  return Number.isFinite(d.getTime()) ? d : new Date();
}

function resolveCsvPath(): string {
  const arg = process.argv[2];
  if (arg) return resolve(arg);
  // Default: look for orders-*.csv in repo root
  const repoRoot = resolve(__dirname, '..', '..', '..', '..');
  const matches = readdirSync(repoRoot).filter((f) => /^orders-.*\.csv$/i.test(f));
  if (matches.length === 0) {
    throw new Error('No orders CSV found. Pass a path as first arg.');
  }
  return join(repoRoot, matches[0]);
}

type Row = Record<string, string>;

interface NormalizedOrder {
  orderNumber: string;
  date: Date;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentProvider: string;
  email: string;
  billing: {
    firstName: string;
    lastName: string;
    phone: string | null;
    line1: string;
    city: string;
  };
  shipping: {
    firstName: string;
    lastName: string;
    line1: string;
    city: string;
  };
  subtotalGross: number;
  subtotalNet: number;
  taxAmount: number;
  shippingAmount: number;
  discountAmount: number;
  total: number;
  couponCode: string | null;
  items: Array<{
    sku: string;
    skuFallback: boolean;
    productName: string;
    quantity: number;
    priceGross: number;
    priceNet: number;
    taxAmount: number;
    subtotal: number;
  }>;
}

function normalize(orderNum: string, rows: Row[]): NormalizedOrder {
  const h = rows[0];
  const subtotalGross = parseIntOr(h['Venta Neta']);
  const subtotalNet = grossToNet(subtotalGross);
  const shippingAmount = parseIntOr(h['Precio envio']);
  const cartCoupon = (h['coupon carrito'] || '').trim();

  return {
    orderNumber: orderNum,
    date: parseWcDate(h['Fecha del pedido']),
    ...mapStatus(h['Estado del pedido'] || ''),
    paymentProvider: mapPaymentProvider(h['Título del método de pago'] || ''),
    email: (h['Correo electrónico (facturación)'] || '').trim().toLowerCase(),
    billing: {
      firstName: (h['Nombre (facturación)'] || '').trim(),
      lastName: (h['Apellidos (facturación)'] || '').trim(),
      phone: (h['Teléfono (facturación)'] || '').trim() || null,
      line1: (h['Dirección lineas 1 y 2 (facturación)'] || '').trim(),
      city: (h['Ciudad (facturación)'] || '').trim(),
    },
    shipping: {
      firstName: (h['Nombre (envío)'] || h['Nombre (facturación)'] || '').trim(),
      lastName: (h['Apellidos (envío)'] || h['Apellidos (facturación)'] || '').trim(),
      line1: (h['Dirección lineas 1 y 2 (envío)'] || h['Dirección lineas 1 y 2 (facturación)'] || '').trim(),
      city: (h['Ciudad (envío)'] || h['Ciudad (facturación)'] || '').trim(),
    },
    subtotalGross,
    subtotalNet,
    taxAmount: subtotalGross - subtotalNet,
    shippingAmount,
    discountAmount: parseIntOr(h['Importe de descuento del carrito']),
    total: parseIntOr(h['Venta total']),
    couponCode: cartCoupon && cartCoupon !== '0' ? cartCoupon : null,
    items: rows.map((r) => {
      const rawSku = (r['SKU'] || '').trim();
      const name = (r['Nombre del árticulo'] || '').trim();
      const qty = parseIntOr(r['Cantidad (- reembolso)'], 1);
      const priceGross = parseIntOr(r['Coste de artículo']);
      const priceNet = grossToNet(priceGross);
      const skuFallback = !rawSku;
      const sku = rawSku || `no-sku-${slugify(name).slice(0, 30)}-${orderNum}`;
      return {
        sku,
        skuFallback,
        productName: name,
        quantity: qty,
        priceGross,
        priceNet,
        taxAmount: priceGross - priceNet,
        subtotal: priceGross * qty,
      };
    }),
  };
}

async function upsertCustomer(
  email: string,
  firstName: string,
  lastName: string,
  phone: string | null,
): Promise<string> {
  const existing = await prisma.customer.findUnique({ where: { email } });
  if (existing) return existing.id;
  const created = await prisma.customer.create({
    data: {
      email,
      firstName,
      lastName,
      phone,
      isGuest: true,
    },
  });
  return created.id;
}

async function createOrder(o: NormalizedOrder): Promise<'created' | 'skipped'> {
  const existing = await prisma.order.findUnique({ where: { orderNumber: o.orderNumber } });
  if (existing) return 'skipped';

  const customerId = o.email
    ? await upsertCustomer(o.email, o.billing.firstName, o.billing.lastName, o.billing.phone)
    : null;

  await prisma.$transaction(async (tx) => {
    const billing = await tx.address.create({
      data: {
        customerId,
        firstName: o.billing.firstName,
        lastName: o.billing.lastName,
        phone: o.billing.phone,
        line1: o.billing.line1 || '—',
        city: o.billing.city || '—',
        region: 'Sin especificar',
        country: 'CL',
      },
    });
    const shipping = await tx.address.create({
      data: {
        customerId,
        firstName: o.shipping.firstName,
        lastName: o.shipping.lastName,
        line1: o.shipping.line1 || '—',
        city: o.shipping.city || '—',
        region: 'Sin especificar',
        country: 'CL',
      },
    });

    // Link items to existing Variants by SKU (if any).
    const skus = o.items.map((i) => i.sku).filter((s) => !s.startsWith('no-sku-'));
    const variants = skus.length
      ? await tx.variant.findMany({
          where: { sku: { in: skus } },
          select: { id: true, sku: true },
        })
      : [];
    const variantBySku = new Map(variants.map((v) => [v.sku, v.id]));

    await tx.order.create({
      data: {
        orderNumber: o.orderNumber,
        customerId,
        email: o.email,
        firstName: o.billing.firstName,
        lastName: o.billing.lastName,
        phone: o.billing.phone,
        status: o.status,
        paymentStatus: o.paymentStatus,
        subtotalNet: o.subtotalNet,
        subtotalGross: o.subtotalGross,
        taxAmount: o.taxAmount,
        shippingAmount: o.shippingAmount,
        discountAmount: o.discountAmount,
        total: o.total,
        couponCode: o.couponCode,
        paymentProvider: o.paymentProvider,
        shippingAddressId: shipping.id,
        billingAddressId: billing.id,
        createdAt: o.date,
        items: {
          create: o.items.map((i) => ({
            variantId: variantBySku.get(i.sku) ?? null,
            productName: i.productName,
            sku: i.sku,
            priceNet: i.priceNet,
            priceGross: i.priceGross,
            taxAmount: i.taxAmount,
            quantity: i.quantity,
            subtotal: i.subtotal,
          })),
        },
      },
    });
  });

  return 'created';
}

async function main() {
  const csvPath = resolveCsvPath();
  console.log(`Importing orders from: ${csvPath}`);

  const buffer = readFileSync(csvPath);
  const rows = parse(buffer, {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    trim: false,
  }) as Row[];
  console.log(`  Raw rows: ${rows.length}`);

  const byOrder = new Map<string, Row[]>();
  for (const r of rows) {
    const num = r['Número de pedido']?.trim();
    if (!num) continue;
    const bucket = byOrder.get(num) ?? [];
    bucket.push(r);
    byOrder.set(num, bucket);
  }
  console.log(`  Unique orders: ${byOrder.size}`);

  let created = 0;
  let skipped = 0;
  let failed = 0;
  const warnings: string[] = [];

  for (const [num, items] of byOrder) {
    try {
      const normalized = normalize(num, items);
      if (!normalized.email) {
        warnings.push(`#${num}: sin email, skipped`);
        skipped += 1;
        continue;
      }
      const skuFallbacks = normalized.items.filter((i) => i.skuFallback);
      if (skuFallbacks.length > 0) {
        warnings.push(
          `#${num}: ${skuFallbacks.length} item(s) sin SKU — usando placeholder (${skuFallbacks.map((i) => i.sku).join(', ')})`,
        );
      }
      const result = await createOrder(normalized);
      if (result === 'created') created += 1;
      else skipped += 1;
    } catch (err) {
      failed += 1;
      console.warn(`#${num}: FAILED — ${(err as Error).message}`);
    }
  }

  console.log('\n=== Resumen ===');
  console.log(`  Creadas:   ${created}`);
  console.log(`  Skipped:   ${skipped} (ya existían o sin email)`);
  console.log(`  Fallidas:  ${failed}`);
  if (warnings.length > 0) {
    console.log(`  Warnings:  ${warnings.length}`);
    for (const w of warnings.slice(0, 5)) console.log(`    - ${w}`);
    if (warnings.length > 5) console.log(`    … y ${warnings.length - 5} más`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
