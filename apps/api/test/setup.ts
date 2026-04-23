// Runs once before each test file. Ensures we have a working DB connection
// and nothing is left over from previous runs.
//
// The suite uses the DEV Postgres (docker-compose) by default. Tests create
// their own fixtures prefixed with "TEST_" so they can be safely wiped without
// touching regular dev data.
//
// To use an isolated DB instead, export TEST_DATABASE_URL before running:
//   TEST_DATABASE_URL="postgresql://.../neokodex_test" pnpm test

import { PrismaClient } from '@prisma/client';

declare global {
  // Shared Prisma client for the whole test file (spawned per file thanks to
  // vitest's fork pool).
  // eslint-disable-next-line no-var
  var __testPrisma: PrismaClient | undefined;
}

process.env.NODE_ENV = 'test';
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
// Disable external side-effects during tests unless a test needs them.
process.env.EMAIL_PROVIDER = process.env.EMAIL_PROVIDER ?? 'noop';
process.env.PAYMENT_PROVIDER = process.env.PAYMENT_PROVIDER ?? 'manual';
process.env.DTE_PROVIDER = process.env.DTE_PROVIDER ?? 'mock';
process.env.SHIPPING_PROVIDER = process.env.SHIPPING_PROVIDER ?? 'flat';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-jwt-secret';
process.env.REFRESH_SECRET = process.env.REFRESH_SECRET ?? 'test-refresh-secret';

// Ensure the DB is reachable before running anything.
if (!globalThis.__testPrisma) {
  globalThis.__testPrisma = new PrismaClient();
}
