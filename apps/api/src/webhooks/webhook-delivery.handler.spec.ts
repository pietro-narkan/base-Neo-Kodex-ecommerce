import type { Webhook, WebhookDelivery } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type PrismaService } from '../prisma/prisma.service';
import { BACKOFF_SECONDS, MAX_ATTEMPTS, WebhookDeliveryHandler } from './webhook-delivery.handler';

interface FakeDeliveryRow {
  delivery: WebhookDelivery;
  webhook: Webhook;
}

function makeRow(over: Partial<WebhookDelivery> = {}): FakeDeliveryRow {
  const webhook = {
    id: 'wh_1',
    name: 'Test',
    url: 'https://example.test/webhook',
    secret: 'topsecret',
    events: ['order.paid'],
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Webhook;
  const delivery = {
    id: 'd_1',
    webhookId: 'wh_1',
    event: 'order.paid',
    eventId: 'evt_x',
    payload: { id: 'evt_x', event: 'order.paid', data: {}, timestamp: 1, api_version: '1.0' },
    statusCode: null,
    responseBody: null,
    attemptCount: 0,
    deliveredAt: null,
    failedAt: null,
    nextAttemptAt: null,
    createdAt: new Date(),
    ...over,
  } as WebhookDelivery;
  return { delivery, webhook };
}

describe('WebhookDeliveryHandler', () => {
  const fetchMock = vi.fn();
  const updateMock = vi.fn();
  const enqueueMock = vi.fn();

  const prisma = {
    webhookDelivery: {
      findUnique: vi.fn(),
      update: updateMock,
    },
  } as unknown as PrismaService;

  const jobs = { enqueue: enqueueMock } as unknown as import('../jobs/jobs.service').JobsService;
  const handler = new WebhookDeliveryHandler(prisma, jobs, fetchMock as unknown as typeof fetch);

  beforeEach(() => {
    fetchMock.mockReset();
    updateMock.mockReset();
    enqueueMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('on 2xx: marks deliveredAt, no retry', async () => {
    const { delivery, webhook } = makeRow();
    vi.spyOn(prisma.webhookDelivery, 'findUnique').mockResolvedValueOnce(
      { ...delivery, webhook } as never,
    );

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => 'OK',
    });

    await handler.handle({ data: { deliveryId: 'd_1' } });

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'd_1' },
        data: expect.objectContaining({
          statusCode: 200,
          deliveredAt: expect.any(Date),
          attemptCount: 1,
        }),
      }),
    );
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('on 5xx with attemptCount < MAX: schedules retry with backoff', async () => {
    const { delivery, webhook } = makeRow({ attemptCount: 2 });
    vi.spyOn(prisma.webhookDelivery, 'findUnique').mockResolvedValueOnce(
      { ...delivery, webhook } as never,
    );

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: async () => 'Service Unavailable',
    });

    await handler.handle({ data: { deliveryId: 'd_1' } });

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          statusCode: 503,
          attemptCount: 3,
          nextAttemptAt: expect.any(Date),
          failedAt: null,
        }),
      }),
    );
    expect(enqueueMock).toHaveBeenCalledWith(
      'webhook-delivery',
      { deliveryId: 'd_1' },
      { startAfter: BACKOFF_SECONDS[3] },
    );
  });

  it('on 5xx with attemptCount at MAX-1: marks failedAt, no retry', async () => {
    const { delivery, webhook } = makeRow({ attemptCount: MAX_ATTEMPTS - 1 });
    vi.spyOn(prisma.webhookDelivery, 'findUnique').mockResolvedValueOnce(
      { ...delivery, webhook } as never,
    );

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: async () => 'Service Unavailable',
    });

    await handler.handle({ data: { deliveryId: 'd_1' } });

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          attemptCount: MAX_ATTEMPTS,
          failedAt: expect.any(Date),
        }),
      }),
    );
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('on 4xx: marks failedAt immediately, no retry', async () => {
    const { delivery, webhook } = makeRow();
    vi.spyOn(prisma.webhookDelivery, 'findUnique').mockResolvedValueOnce(
      { ...delivery, webhook } as never,
    );

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => 'Not Found',
    });

    await handler.handle({ data: { deliveryId: 'd_1' } });

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          statusCode: 404,
          failedAt: expect.any(Date),
          attemptCount: 1,
        }),
      }),
    );
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('on fetch timeout: treats as 5xx (retry)', async () => {
    const { delivery, webhook } = makeRow();
    vi.spyOn(prisma.webhookDelivery, 'findUnique').mockResolvedValueOnce(
      { ...delivery, webhook } as never,
    );

    fetchMock.mockRejectedValueOnce(new Error('Timeout: 10000ms'));

    await handler.handle({ data: { deliveryId: 'd_1' } });

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          attemptCount: 1,
          nextAttemptAt: expect.any(Date),
          failedAt: null,
        }),
      }),
    );
    expect(enqueueMock).toHaveBeenCalled();
  });

  it('sends correct headers and signed body', async () => {
    const { delivery, webhook } = makeRow();
    vi.spyOn(prisma.webhookDelivery, 'findUnique').mockResolvedValueOnce(
      { ...delivery, webhook } as never,
    );

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => '',
    });

    await handler.handle({ data: { deliveryId: 'd_1' } });

    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      { method: string; headers: Record<string, string>; body: string },
    ];
    expect(url).toBe('https://example.test/webhook');
    expect(init.method).toBe('POST');
    expect(init.headers['X-NK-Event']).toBe('order.paid');
    expect(init.headers['X-NK-Event-Id']).toBe('evt_x');
    expect(init.headers['X-NK-Signature']).toMatch(/^sha256=/);
    expect(init.headers['X-NK-Timestamp']).toBeDefined();
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('truncates responseBody to 4096 chars', async () => {
    const { delivery, webhook } = makeRow();
    vi.spyOn(prisma.webhookDelivery, 'findUnique').mockResolvedValueOnce(
      { ...delivery, webhook } as never,
    );

    const longBody = 'x'.repeat(8000);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => longBody,
    });

    await handler.handle({ data: { deliveryId: 'd_1' } });

    const updateCall = updateMock.mock.calls[0][0] as {
      data: { responseBody: string };
    };
    expect(updateCall.data.responseBody.length).toBe(4096);
  });
});
