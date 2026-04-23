import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildTestApp } from './helpers/app';

const TEST_ADMIN_EMAIL = 'test-admin@test.local';
const TEST_ADMIN_PWD = 'password123';

describe('Auth', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;

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
        name: 'Test Admin',
      },
    });
  });

  afterAll(async () => {
    await prisma.admin.deleteMany({ where: { email: { startsWith: 'test-admin' } } });
    await prisma.passwordResetToken.deleteMany({});
    await prisma.auditLog.deleteMany({
      where: { actorEmail: { startsWith: 'test-' } },
    });
    await app?.close();
  });

  afterEach(async () => {
    await prisma.auditLog.deleteMany({
      where: { actorEmail: { startsWith: 'test-' } },
    });
    await prisma.passwordResetToken.deleteMany({});
  });

  describe('POST /auth/admin/login', () => {
    it('returns access + refresh tokens on valid credentials', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/admin/login',
        payload: { email: TEST_ADMIN_EMAIL, password: TEST_ADMIN_PWD },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json() as Record<string, unknown>;
      expect(typeof body.accessToken).toBe('string');
      expect(typeof body.refreshToken).toBe('string');
      const user = body.user as { email: string; role: string; type: string };
      expect(user.email).toBe(TEST_ADMIN_EMAIL);
      expect(user.role).toBe('ADMIN');
      expect(user.type).toBe('admin');
    });

    it('returns 401 on wrong password', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/admin/login',
        payload: { email: TEST_ADMIN_EMAIL, password: 'wrong' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('returns 401 on unknown email', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/admin/login',
        payload: { email: 'no-such-email@test.local', password: 'x' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('audits failed login attempts', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/auth/admin/login',
        payload: { email: TEST_ADMIN_EMAIL, password: 'wrong' },
      });
      const entries = await prisma.auditLog.findMany({
        where: { actorEmail: TEST_ADMIN_EMAIL, action: 'login.failed' },
      });
      expect(entries.length).toBe(1);
      expect(entries[0].metadata).toEqual({ reason: 'bad_password' });
    });
  });

  describe('Password reset flow', () => {
    it('requestReset returns ok even for unknown emails (anti-enumeration)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/forgot-password',
        payload: { email: 'does-not-exist@test.local', userKind: 'ADMIN' },
      });
      expect(res.statusCode).toBe(201);
      expect((res.json() as { ok: boolean }).ok).toBe(true);
    });

    it('creates a PasswordResetToken for a known admin', async () => {
      await prisma.passwordResetToken.deleteMany({});
      await app.inject({
        method: 'POST',
        url: '/api/auth/forgot-password',
        payload: { email: TEST_ADMIN_EMAIL, userKind: 'ADMIN' },
      });
      const admin = await prisma.admin.findUnique({ where: { email: TEST_ADMIN_EMAIL } });
      const tokens = await prisma.passwordResetToken.findMany({
        where: { userId: admin!.id, userKind: 'ADMIN' },
      });
      expect(tokens.length).toBe(1);
      expect(tokens[0].usedAt).toBeNull();
      expect(tokens[0].expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('rejects expired or invalid tokens', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/reset-password',
        payload: { token: 'bogus', userKind: 'ADMIN', newPassword: 'newpass123' },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('Refresh token endpoint', () => {
    it('rotates tokens when given a valid refresh token', async () => {
      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/auth/admin/login',
        payload: { email: TEST_ADMIN_EMAIL, password: TEST_ADMIN_PWD },
      });
      const { refreshToken } = loginRes.json() as { refreshToken: string };

      const refreshRes = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        headers: { authorization: `Bearer ${refreshToken}` },
      });
      expect(refreshRes.statusCode).toBe(201);
      const body = refreshRes.json() as Record<string, unknown>;
      expect(typeof body.accessToken).toBe('string');
      expect(body.accessToken).not.toBe(refreshToken);
    });

    it('returns 401 without refresh token', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
      });
      expect(res.statusCode).toBe(401);
    });
  });
});
