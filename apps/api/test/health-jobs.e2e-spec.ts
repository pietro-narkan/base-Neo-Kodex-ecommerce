import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildTestApp } from './helpers/app';

describe('Health: jobs', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /api/v1/health/jobs returns 200 with queues payload', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/health/jobs' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      status: string;
      queues: Array<{ name: string; queueSize: number; scheduledCount: number }>;
    };
    expect(['ok', 'degraded']).toContain(body.status);
    expect(Array.isArray(body.queues)).toBe(true);
    const webhookQueue = body.queues.find((q) => q.name === 'webhook-delivery');
    expect(webhookQueue).toBeDefined();
    expect(typeof webhookQueue?.queueSize).toBe('number');
  });
});
