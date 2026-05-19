import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildTestApp } from './helpers/app';

describe('OpenAPI spec', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /api/docs-json returns OpenAPI 3.0 document', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/docs-json' });
    expect(res.statusCode).toBe(200);
    const spec = res.json() as {
      openapi: string;
      info: { title: string; version: string };
      paths: Record<string, unknown>;
    };
    expect(spec.openapi).toMatch(/^3\./);
    expect(spec.info.title).toBe('Neo-Kodex Ecommerce API');
    expect(Object.keys(spec.paths).length).toBeGreaterThan(10);
  });

  it('all documented paths are prefixed with /api/v1', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/docs-json' });
    const spec = res.json() as { paths: Record<string, unknown> };
    for (const path of Object.keys(spec.paths)) {
      expect(path).toMatch(/^\/api\/v1(\/|$)/);
    }
  });
});
