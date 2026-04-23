import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildTestApp } from './helpers/app';
import {
  cleanFixtures,
  setupFixture,
  testEmail,
  testSession,
  type TestFixture,
} from './helpers/fixtures';

describe('POST /orders/checkout (guest)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  let fixture: TestFixture;

  beforeAll(async () => {
    app = await buildTestApp();
    prisma = globalThis.__testPrisma as PrismaClient;
  });

  afterAll(async () => {
    await cleanFixtures(prisma);
    await app?.close();
  });

  afterEach(async () => {
    await cleanFixtures(prisma);
  });

  // Every test re-creates the fixture so initial stock is deterministic.
  async function arrangeCart(sessionId: string, qty: number): Promise<TestFixture> {
    fixture = await setupFixture(prisma, { stock: 10, priceGross: 11900 });

    // Create a cart with one item via the public Cart endpoint.
    const addRes = await app.inject({
      method: 'POST',
      url: '/api/cart/items',
      headers: { 'x-cart-session': sessionId, 'content-type': 'application/json' },
      payload: { variantId: fixture.variantId, quantity: qty },
    });
    expect(addRes.statusCode).toBe(201);
    return fixture;
  }

  it('creates an order, decrements stock, computes totals', async () => {
    const sessionId = testSession('-happy');
    const email = testEmail('-happy');
    await arrangeCart(sessionId, 2);

    const res = await app.inject({
      method: 'POST',
      url: '/api/orders/checkout',
      headers: { 'x-cart-session': sessionId, 'content-type': 'application/json' },
      payload: {
        email,
        firstName: 'Test',
        lastName: 'Guest',
        phone: '+56912345678',
        shippingAddress: {
          firstName: 'Test',
          lastName: 'Guest',
          line1: 'Av Siempre Viva 123',
          city: 'Santiago',
          region: 'Metropolitana',
          country: 'CL',
        },
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as Record<string, unknown>;
    expect(body.orderNumber).toMatch(/^NK-\d{4}-\d{6}$/);
    expect(body.email).toBe(email);

    // Stock should be 10 − 2 = 8
    const reloaded = await prisma.variant.findUnique({ where: { id: fixture.variantId } });
    expect(reloaded?.stock).toBe(8);

    // Totals must satisfy subtotalGross + shipping − discount = total
    const subtotalGross = body.subtotalGross as number;
    const shippingAmount = body.shippingAmount as number;
    const discountAmount = body.discountAmount as number;
    const total = body.total as number;
    expect(subtotalGross).toBe(fixture.priceGross * 2);
    expect(total).toBe(subtotalGross + shippingAmount - discountAmount);

    // Cart should be deleted post-checkout
    const cart = await prisma.cart.findUnique({ where: { sessionId } });
    expect(cart).toBeNull();
  });

  it('rejects checkout when stock is insufficient (atomic reservation)', async () => {
    const sessionId = testSession('-oos');
    const email = testEmail('-oos');
    await arrangeCart(sessionId, 5);

    // Drain stock from a parallel "competing" order so checkout now lacks stock
    await prisma.variant.update({
      where: { id: fixture.variantId },
      data: { stock: 2 }, // request was 5
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/orders/checkout',
      headers: { 'x-cart-session': sessionId, 'content-type': 'application/json' },
      payload: {
        email,
        firstName: 'Test',
        lastName: 'OOS',
        shippingAddress: {
          firstName: 'Test',
          lastName: 'OOS',
          line1: 'X',
          city: 'C',
          region: 'R',
        },
      },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { message?: string }).message).toMatch(/stock/i);

    // Stock unchanged (the 2 we set)
    const reloaded = await prisma.variant.findUnique({ where: { id: fixture.variantId } });
    expect(reloaded?.stock).toBe(2);
  });

  it('generates unique sequential order numbers (NK-YYYY-XXXXXX)', async () => {
    const numbers = new Set<string>();
    for (let i = 0; i < 3; i += 1) {
      const sessionId = testSession(`-seq-${i}`);
      const email = testEmail(`-seq-${i}`);
      await arrangeCart(sessionId, 1);

      const res = await app.inject({
        method: 'POST',
        url: '/api/orders/checkout',
        headers: { 'x-cart-session': sessionId, 'content-type': 'application/json' },
        payload: {
          email,
          firstName: 'Seq',
          lastName: String(i),
          shippingAddress: {
            firstName: 'Seq',
            lastName: String(i),
            line1: 'Dir',
            city: 'C',
            region: 'R',
          },
        },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json() as { orderNumber: string };
      expect(body.orderNumber).toMatch(/^NK-\d{4}-\d{6}$/);
      expect(numbers.has(body.orderNumber)).toBe(false);
      numbers.add(body.orderNumber);
    }
    expect(numbers.size).toBe(3);
  });

  it('creates a guest Customer (isGuest=true) on first checkout', async () => {
    const sessionId = testSession('-guest');
    const email = testEmail('-guest');
    await arrangeCart(sessionId, 1);

    await app.inject({
      method: 'POST',
      url: '/api/orders/checkout',
      headers: { 'x-cart-session': sessionId, 'content-type': 'application/json' },
      payload: {
        email,
        firstName: 'Guest',
        lastName: 'User',
        shippingAddress: {
          firstName: 'G',
          lastName: 'U',
          line1: 'X',
          city: 'C',
          region: 'R',
        },
      },
    });

    const customer = await prisma.customer.findUnique({ where: { email } });
    expect(customer).toBeTruthy();
    expect(customer?.isGuest).toBe(true);
  });
});
