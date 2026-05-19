import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildTestApp } from './helpers/app';

const TEST_ADMIN_EMAIL = 'test-admin-webhooks@test.local';
const TEST_ADMIN_PWD = 'password123';

async function getAdminToken(app: NestFastifyApplication): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/admin/login',
    payload: { email: TEST_ADMIN_EMAIL, password: TEST_ADMIN_PWD },
  });
  return (res.json() as { accessToken: string }).accessToken;
}

describe('Webhooks admin', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  let token: string;

  beforeAll(async () => {
    app = await buildTestApp();
    prisma = globalThis.__testPrisma as PrismaClient;
    await prisma.admin.upsert({
      where: { email: TEST_ADMIN_EMAIL },
      update: {
        passwordHash: await bcrypt.hash(TEST_ADMIN_PWD, 10),
        role: 'ADMIN',
        active: true,
      },
      create: {
        email: TEST_ADMIN_EMAIL,
        passwordHash: await bcrypt.hash(TEST_ADMIN_PWD, 10),
        role: 'ADMIN',
        active: true,
        name: 'Test Webhooks Admin',
      },
    });
    token = await getAdminToken(app);
  });

  afterAll(async () => {
    await prisma.webhookDelivery.deleteMany({});
    await prisma.webhook.deleteMany({});
    await prisma.admin.deleteMany({ where: { email: TEST_ADMIN_EMAIL } });
    await app?.close();
  });

  afterEach(async () => {
    await prisma.webhookDelivery.deleteMany({});
    await prisma.webhook.deleteMany({});
  });

  it('POST /admin/webhooks creates a webhook with secret visible once', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/webhooks',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: 'Test webhook',
        url: 'https://example.test/webhook',
        events: ['order.paid'],
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      id: string;
      secret: string;
      name: string;
      events: string[];
      active: boolean;
    };
    expect(body.secret).toMatch(/^[0-9a-f]{64}$/);
    expect(body.events).toEqual(['order.paid']);
    expect(body.active).toBe(true);
  });

  it('POST /admin/webhooks rejects empty events array', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/webhooks',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: 'Bad',
        url: 'https://example.test/webhook',
        events: [],
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET /admin/webhooks does NOT expose secret', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/v1/admin/webhooks',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: 'Xw',
        url: 'https://example.test/webhook',
        events: ['order.paid'],
      },
    });

    const list = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/webhooks',
      headers: { authorization: `Bearer ${token}` },
    });
    const body = list.json() as { data: Array<{ secret?: unknown }> };
    expect(body.data[0].secret).toBeUndefined();
  });

  it('POST /admin/webhooks/:id/rotate-secret returns new secret', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/webhooks',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: 'Xw',
        url: 'https://example.test/webhook',
        events: ['order.paid'],
      },
    });
    const { id, secret: oldSecret } = created.json() as { id: string; secret: string };

    const rotated = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/webhooks/${id}/rotate-secret`,
      headers: { authorization: `Bearer ${token}` },
    });
    const { secret: newSecret } = rotated.json() as { secret: string };
    expect(newSecret).toMatch(/^[0-9a-f]{64}$/);
    expect(newSecret).not.toBe(oldSecret);
  });

  it('POST /admin/webhooks/:id/test creates delivery row', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/webhooks',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: 'Xw',
        url: 'https://example.test/webhook',
        events: ['order.paid'],
      },
    });
    const { id } = created.json() as { id: string };

    const test = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/webhooks/${id}/test`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(test.statusCode).toBe(201);
    const { deliveryId } = test.json() as { deliveryId: string };
    const row = await prisma.webhookDelivery.findUnique({ where: { id: deliveryId } });
    expect(row).not.toBeNull();
    expect(row?.event).toBe('test.ping');
  });

  it('GET /admin/webhooks/:id/deliveries lists deliveries', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/webhooks',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: 'Xw',
        url: 'https://example.test/webhook',
        events: ['order.paid'],
      },
    });
    const { id } = created.json() as { id: string };
    await app.inject({
      method: 'POST',
      url: `/api/v1/admin/webhooks/${id}/test`,
      headers: { authorization: `Bearer ${token}` },
    });

    const list = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/webhooks/${id}/deliveries?limit=10`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(list.statusCode).toBe(200);
    const { data } = list.json() as { data: Array<{ event: string }> };
    expect(data.length).toBeGreaterThanOrEqual(1);
    expect(data[0].event).toBe('test.ping');
  });

  it('DELETE /admin/webhooks/:id cascades deliveries', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/webhooks',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: 'Xw',
        url: 'https://example.test/webhook',
        events: ['order.paid'],
      },
    });
    const { id } = created.json() as { id: string };
    await app.inject({
      method: 'POST',
      url: `/api/v1/admin/webhooks/${id}/test`,
      headers: { authorization: `Bearer ${token}` },
    });

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/v1/admin/webhooks/${id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(del.statusCode).toBe(200);

    const orphans = await prisma.webhookDelivery.findMany({ where: { webhookId: id } });
    expect(orphans).toHaveLength(0);
  });
});
