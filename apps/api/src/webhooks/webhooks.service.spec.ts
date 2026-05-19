import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { JobsService } from '../jobs/jobs.service';
import { WebhooksService } from './webhooks.service';

describe('WebhooksService.dispatch', () => {
  let prisma: PrismaClient;
  let service: WebhooksService;
  let enqueuedJobs: Array<{ name: string; data: unknown }>;

  beforeAll(async () => {
    prisma = globalThis.__testPrisma as PrismaClient;
    enqueuedJobs = [];

    const fakeJobs = {
      async enqueue(name: string, data: unknown): Promise<string> {
        enqueuedJobs.push({ name, data });
        return `job-${enqueuedJobs.length}`;
      },
    } as unknown as JobsService;

    service = new WebhooksService(prisma, fakeJobs);
  });

  beforeEach(async () => {
    enqueuedJobs.length = 0;
    await prisma.webhookDelivery.deleteMany({});
    await prisma.webhook.deleteMany({});
  });

  afterAll(async () => {
    await prisma.webhookDelivery.deleteMany({});
    await prisma.webhook.deleteMany({});
  });

  it('creates delivery + enqueues job for active webhook subscribed to event', async () => {
    const webhook = await prisma.webhook.create({
      data: {
        name: 'Test',
        url: 'https://example.test/webhook',
        secret: 'sec',
        events: ['order.paid'],
        active: true,
      },
    });

    await service.dispatch('order.paid', { order: { id: 'ord_1' } });

    const deliveries = await prisma.webhookDelivery.findMany({});
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0].webhookId).toBe(webhook.id);
    expect(deliveries[0].event).toBe('order.paid');

    expect(enqueuedJobs).toHaveLength(1);
    expect(enqueuedJobs[0].name).toBe('webhook-delivery');
    expect((enqueuedJobs[0].data as { deliveryId: string }).deliveryId).toBe(
      deliveries[0].id,
    );
  });

  it('skips inactive webhooks', async () => {
    await prisma.webhook.create({
      data: {
        name: 'Inactive',
        url: 'https://example.test/webhook',
        secret: 'sec',
        events: ['order.paid'],
        active: false,
      },
    });

    await service.dispatch('order.paid', { order: { id: 'ord_1' } });

    expect(await prisma.webhookDelivery.count()).toBe(0);
    expect(enqueuedJobs).toHaveLength(0);
  });

  it('skips webhooks not subscribed to the event', async () => {
    await prisma.webhook.create({
      data: {
        name: 'Only-paid',
        url: 'https://example.test/webhook',
        secret: 'sec',
        events: ['order.paid'],
        active: true,
      },
    });

    await service.dispatch('order.cancelled', { order: { id: 'ord_1' } });

    expect(await prisma.webhookDelivery.count()).toBe(0);
  });

  it('creates one delivery per matching webhook', async () => {
    await prisma.webhook.create({
      data: {
        name: 'A',
        url: 'https://a.test',
        secret: 'sec',
        events: ['order.paid'],
        active: true,
      },
    });
    await prisma.webhook.create({
      data: {
        name: 'B',
        url: 'https://b.test',
        secret: 'sec',
        events: ['order.paid', 'order.cancelled'],
        active: true,
      },
    });

    await service.dispatch('order.paid', { order: { id: 'ord_1' } });

    expect(await prisma.webhookDelivery.count()).toBe(2);
    expect(enqueuedJobs).toHaveLength(2);
  });
});
