import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts', 'test/**/*.e2e-spec.ts'],
    setupFiles: ['test/setup.ts'],
    // Tests hit a real Postgres; don't run in parallel to avoid cross-test data races.
    pool: 'forks',
    forks: { singleFork: true },
    testTimeout: 30_000,
    hookTimeout: 30_000,
    reporters: ['verbose'],
  },
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
});
