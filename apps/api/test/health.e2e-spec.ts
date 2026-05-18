import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildTestApp } from './helpers/app';

describe('Health endpoints', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /api/health returns 200 with uptime', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { status: string; uptime: number };
    expect(body.status).toBe('ok');
    expect(typeof body.uptime).toBe('number');
  });

  it('GET /api/health/ready returns 200 with checks payload', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/health/ready' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      status: string;
      checks: { db: boolean; storage: boolean };
    };
    expect(['ok', 'degraded']).toContain(body.status);
    expect(typeof body.checks.db).toBe('boolean');
    expect(typeof body.checks.storage).toBe('boolean');
  });
});
