# API Speaks Protocol Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir la API NestJS de neo-kodex en una API **documentada (OpenAPI público), versionada (`/api/v1`), observada (pino + Sentry + health) y predecible (shape de error uniforme con códigos catalogados)**.

**Architecture:** Tres PRs independientes en orden observability-first (PR1 → PR2 → PR3). Cada PR es un deploy autónomo de Coolify. PR1 no toca rutas (cero riesgo); PR2 cambia shape de error (storefront/admin se actualizan en el mismo PR); PR3 migra rutas a `/api/v1` y publica Swagger UI.

**Tech Stack:** NestJS 10.4 + Fastify 4.28 + Prisma 5.22, `nestjs-pino` 4.x, `pino` 9.x, `pino-pretty`, `@sentry/node` 8.x, `@sentry/nestjs`, `@nestjs/swagger` 7.x, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-05-14-api-speaks-protocol-design.md` (commit `102da41`).

---

## Pre-flight

### Task 0: Branch convention

Cada PR vive en su propia branch desde `main`. Naming:
- PR1 → `feat/api-observability`
- PR2 → `feat/api-error-shape`
- PR3 → `feat/api-v1-openapi`

Cada branch arranca con `git checkout main && git pull && git checkout -b <branch>`. Cada commit dentro de la branch es bite-sized; merge a `main` dispara auto-deploy en Coolify.

---

## Phase 1: PR1 — Observability

**Branch:** `feat/api-observability`

**Goal:** Logs estructurados + Sentry opt-in + health endpoints. Cero cambios en rutas o shape de respuesta.

### Task 1.1: Install observability dependencies

**Files:**
- Modify: `apps/api/package.json`

- [ ] **Step 1: Install runtime deps**

Run:
```bash
pnpm --filter @neo-kodex/api add nestjs-pino@^4.4.0 pino@^9.6.0 pino-http@^10.4.0 @sentry/node@^8.50.0 @sentry/nestjs@^8.50.0
```

Expected: `apps/api/package.json` dependencies updated; lockfile updated.

- [ ] **Step 2: Install dev deps**

Run:
```bash
pnpm --filter @neo-kodex/api add -D pino-pretty@^13.0.0
```

- [ ] **Step 3: Verify install**

Run:
```bash
pnpm --filter @neo-kodex/api ls nestjs-pino pino @sentry/node
```

Expected: Three packages listed with their versions.

- [ ] **Step 4: Commit**

```bash
git add apps/api/package.json pnpm-lock.yaml
git commit -m "chore(api): add nestjs-pino + sentry deps"
```

### Task 1.2: Update .env.example with new vars

**Files:**
- Modify: `apps/api/.env.example`

- [ ] **Step 1: Append new section**

Add at the end of `apps/api/.env.example`:

```bash

# ===== Logging =====
LOG_LEVEL=info           # trace|debug|info|warn|error|fatal
LOG_PRETTY=false         # true en dev (.env.local) para pino-pretty

# ===== Sentry (off si SENTRY_DSN vacío) =====
SENTRY_DSN=
SENTRY_ENVIRONMENT=development
SENTRY_TRACES_SAMPLE_RATE=0.1
SENTRY_RELEASE=          # opcional, ej. commit SHA inyectado en build
SENTRY_CAPTURE_4XX=false # true para enviar errores 4xx también (debug)
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/.env.example
git commit -m "chore(api): document logging + sentry env vars"
```

### Task 1.3: Request context with AsyncLocalStorage

**Files:**
- Create: `apps/api/src/common/request-context.ts`
- Create: `apps/api/src/common/request-context.spec.ts`

- [ ] **Step 1: Write failing test**

Create `apps/api/src/common/request-context.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { requestContext, withRequestContext } from './request-context';

describe('request-context', () => {
  it('returns undefined when no context active', () => {
    expect(requestContext.getStore()).toBeUndefined();
  });

  it('exposes requestId inside withRequestContext', () => {
    let observed: string | undefined;
    withRequestContext({ requestId: 'abc-123' }, () => {
      observed = requestContext.getStore()?.requestId;
    });
    expect(observed).toBe('abc-123');
  });

  it('isolates context between concurrent runs', async () => {
    const results = await Promise.all([
      new Promise<string | undefined>((resolve) => {
        withRequestContext({ requestId: 'one' }, () => {
          setTimeout(() => resolve(requestContext.getStore()?.requestId), 10);
        });
      }),
      new Promise<string | undefined>((resolve) => {
        withRequestContext({ requestId: 'two' }, () => {
          setTimeout(() => resolve(requestContext.getStore()?.requestId), 5);
        });
      }),
    ]);
    expect(results).toEqual(['one', 'two']);
  });
});
```

- [ ] **Step 2: Run test (expect FAIL: module not found)**

Run:
```bash
pnpm --filter @neo-kodex/api test -- request-context
```

Expected: Failure with "Cannot find module './request-context'".

- [ ] **Step 3: Implement**

Create `apps/api/src/common/request-context.ts`:

```typescript
import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContextStore {
  requestId: string;
  userId?: string;
  userType?: 'admin' | 'customer';
}

export const requestContext = new AsyncLocalStorage<RequestContextStore>();

export function withRequestContext<T>(
  store: RequestContextStore,
  fn: () => T,
): T {
  return requestContext.run(store, fn);
}
```

- [ ] **Step 4: Run test (expect PASS)**

Run:
```bash
pnpm --filter @neo-kodex/api test -- request-context
```

Expected: 3/3 tests passing.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/common/request-context.ts apps/api/src/common/request-context.spec.ts
git commit -m "feat(api): add AsyncLocalStorage-based request context"
```

### Task 1.4: Configure nestjs-pino with redaction and request context

**Files:**
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Add LoggerModule import**

Edit `apps/api/src/app.module.ts`. Add to imports list (above `PrismaModule`):

```typescript
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
```

- [ ] **Step 2: Register LoggerModule in imports array**

In the `@Module({ imports: [...] })` array, insert AFTER `ScheduleModule.forRoot()` and BEFORE `PrismaModule`:

```typescript
LoggerModule.forRootAsync({
  inject: [],
  useFactory: () => ({
    pinoHttp: {
      level: process.env.LOG_LEVEL ?? 'info',
      transport:
        process.env.LOG_PRETTY === 'true'
          ? {
              target: 'pino-pretty',
              options: { singleLine: true, translateTime: 'SYS:standard' },
            }
          : undefined,
      genReqId: (req) => {
        const incoming =
          (req.headers['x-request-id'] as string | undefined) ?? undefined;
        return incoming ?? randomUUID();
      },
      customProps: (req) => ({
        requestId: (req as { id?: string }).id,
      }),
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.body.password',
          'req.body.passwordConfirm',
          'req.body.newPassword',
          'req.body.token',
          'req.body.refreshToken',
          'req.body.rut',
          '*.creditCard',
          '*.cvv',
        ],
        censor: '[REDACTED]',
      },
      serializers: {
        req: (req: { method: string; url: string; id?: string }) => ({
          method: req.method,
          url: req.url,
          requestId: req.id,
        }),
        res: (res: { statusCode: number }) => ({
          statusCode: res.statusCode,
        }),
      },
    },
  }),
}),
```

- [ ] **Step 3: Apply pino logger to the Nest app**

Edit `apps/api/src/main.ts`. At the top, add import:

```typescript
import { Logger as PinoLogger } from 'nestjs-pino';
```

After `const app = await NestFactory.create<NestFastifyApplication>(...)` (line 18), add:

```typescript
app.useLogger(app.get(PinoLogger));
```

- [ ] **Step 4: Manual validation**

Run dev server briefly:
```bash
pnpm --filter @neo-kodex/api dev
```

Open another terminal and curl:
```bash
curl -s http://localhost:3001/api/products | head
```

Expected: Server logs request as JSON line with `requestId`, `method`, `url`, `statusCode`. Kill the dev server.

- [ ] **Step 5: Run full test suite to verify no regression**

Run:
```bash
pnpm --filter @neo-kodex/api test
```

Expected: All existing tests pass (auth.e2e-spec.ts + orders-checkout.e2e-spec.ts + request-context.spec.ts).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/app.module.ts apps/api/src/main.ts
git commit -m "feat(api): replace default Logger with nestjs-pino + redaction"
```

### Task 1.5: Initialize Sentry SDK with DSN gating

**Files:**
- Create: `apps/api/src/common/sentry.ts`
- Modify: `apps/api/src/main.ts`

- [ ] **Step 1: Create sentry init helper**

Create `apps/api/src/common/sentry.ts`:

```typescript
import * as Sentry from '@sentry/node';

let initialized = false;

export function initSentry(): void {
  if (initialized) return;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    // eslint-disable-next-line no-console
    console.log('[sentry] disabled (SENTRY_DSN empty)');
    return;
  }
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? 'production',
    release: process.env.SENTRY_RELEASE ?? undefined,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
  });
  initialized = true;
  // eslint-disable-next-line no-console
  console.log('[sentry] initialized');
}

export function captureFromFilter(
  err: unknown,
  context: { requestId?: string; code?: string; statusCode: number },
): void {
  if (!initialized) return;
  const shouldCapture4xx = process.env.SENTRY_CAPTURE_4XX === 'true';
  if (context.statusCode < 500 && !shouldCapture4xx) return;
  Sentry.captureException(err, {
    tags: {
      requestId: context.requestId,
      code: context.code,
      statusCode: String(context.statusCode),
    },
  });
}

export { Sentry };
```

- [ ] **Step 2: Call initSentry BEFORE NestFactory.create**

Edit `apps/api/src/main.ts`. Add import at top:

```typescript
import { initSentry } from './common/sentry';
```

At the start of `async function bootstrap()`, BEFORE the `const app = ...` line:

```typescript
initSentry();
```

- [ ] **Step 3: Verify Sentry stays off in tests**

Tests set no `SENTRY_DSN` (see `apps/api/test/setup.ts`), so the init helper logs "disabled" and returns. No further test changes needed.

Run:
```bash
pnpm --filter @neo-kodex/api test
```

Expected: All tests still pass.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/common/sentry.ts apps/api/src/main.ts
git commit -m "feat(api): wire Sentry SDK with DSN gating"
```

### Task 1.6: Expose StorageService.isReachable()

**Files:**
- Modify: `apps/api/src/storage/storage.service.ts`

- [ ] **Step 1: Add public method**

Edit `apps/api/src/storage/storage.service.ts`. Add this method to the class (after `deleteObject`):

```typescript
async isReachable(): Promise<boolean> {
  try {
    await this.client.bucketExists(this.bucket);
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 2: Verify build**

Run:
```bash
pnpm --filter @neo-kodex/api typecheck
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/storage/storage.service.ts
git commit -m "feat(storage): expose isReachable() for health checks"
```

### Task 1.7: HealthModule with /health (liveness)

**Files:**
- Create: `apps/api/src/health/health.module.ts`
- Create: `apps/api/src/health/health.controller.ts`
- Create: `apps/api/src/health/health.controller.spec.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Write failing test for /health**

Create `apps/api/src/health/health.controller.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('GET /health returns ok with uptime', () => {
    const controller = new HealthController({} as never, {} as never);
    const result = controller.live();
    expect(result.status).toBe('ok');
    expect(typeof result.uptime).toBe('number');
    expect(result.uptime).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run test (expect FAIL: module not found)**

Run:
```bash
pnpm --filter @neo-kodex/api test -- health.controller
```

Expected: Failure with module-not-found.

- [ ] **Step 3: Implement HealthController**

Create `apps/api/src/health/health.controller.ts`:

```typescript
import { Controller, Get } from '@nestjs/common';

import { Public } from '../auth/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  @Public()
  @Get()
  live(): { status: 'ok'; uptime: number } {
    return { status: 'ok', uptime: Math.round(process.uptime()) };
  }

  @Public()
  @Get('ready')
  async ready(): Promise<{
    status: 'ok' | 'degraded';
    checks: { db: boolean; storage: boolean };
  }> {
    const [dbResult, storageResult] = await Promise.allSettled([
      this.prisma.$queryRaw`SELECT 1`,
      this.storage.isReachable(),
    ]);
    const db = dbResult.status === 'fulfilled';
    const storage =
      storageResult.status === 'fulfilled' && storageResult.value === true;
    const status = db && storage ? 'ok' : 'degraded';
    return { status, checks: { db, storage } };
  }
}
```

- [ ] **Step 4: Create HealthModule**

Create `apps/api/src/health/health.module.ts`:

```typescript
import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { HealthController } from './health.controller';

@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [HealthController],
})
export class HealthModule {}
```

- [ ] **Step 5: Register HealthModule in AppModule**

Edit `apps/api/src/app.module.ts`. Add import:

```typescript
import { HealthModule } from './health/health.module';
```

Add `HealthModule` to imports array (between `StorageModule` and `ProvidersModule`).

- [ ] **Step 6: Run controller unit test (expect PASS)**

Run:
```bash
pnpm --filter @neo-kodex/api test -- health.controller
```

Expected: 1/1 test passing.

- [ ] **Step 7: Manual smoke test endpoints**

Run dev server:
```bash
pnpm --filter @neo-kodex/api dev
```

Curl both endpoints:
```bash
curl -s http://localhost:3001/api/health
curl -s http://localhost:3001/api/health/ready
```

Expected:
- `/health`: `{"status":"ok","uptime":<seconds>}`
- `/health/ready`: `{"status":"ok","checks":{"db":true,"storage":true}}` (if Postgres + MinIO up)

Kill dev server.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/health/ apps/api/src/app.module.ts
git commit -m "feat(api): add /health liveness + /health/ready readiness"
```

### Task 1.8: E2E test for health endpoints

**Files:**
- Create: `apps/api/test/health.e2e-spec.ts`

- [ ] **Step 1: Write e2e test**

Create `apps/api/test/health.e2e-spec.ts`:

```typescript
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
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { status: string; uptime: number };
    expect(body.status).toBe('ok');
    expect(typeof body.uptime).toBe('number');
  });

  it('GET /api/health/ready returns 200 with checks payload', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health/ready' });
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
```

- [ ] **Step 2: Run e2e test**

Run:
```bash
pnpm --filter @neo-kodex/api test -- health.e2e
```

Expected: 2/2 tests passing. (Health endpoints must be `@Public()` so JWT guard doesn't block.)

- [ ] **Step 3: Commit**

```bash
git add apps/api/test/health.e2e-spec.ts
git commit -m "test(api): e2e for health endpoints"
```

### Task 1.9: Add healthcheck for api service in docker-compose.prod.yml

**Files:**
- Modify: `docker-compose.prod.yml`

- [ ] **Step 1: Add healthcheck block**

Edit `docker-compose.prod.yml`. Inside the `api:` service, after `ports:` block, add:

```yaml
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3001/api/health"]
      interval: 30s
      timeout: 5s
      retries: 5
      start_period: 30s
```

Note: `wget` ships with `node:22-alpine` (verified via `RUN apk list --installed`). If not available in the runtime image, switch to:

```yaml
      test: ["CMD-SHELL", "node -e \"require('http').get('http://localhost:3001/api/health',r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))\""]
```

- [ ] **Step 2: Commit**

```bash
git add docker-compose.prod.yml
git commit -m "chore(deploy): add Docker healthcheck for api service"
```

### Task 1.10: Final validation of PR1

- [ ] **Step 1: Full test suite**

Run:
```bash
pnpm --filter @neo-kodex/api test
```

Expected: ALL tests pass (auth, orders-checkout, request-context, health.controller, health.e2e).

- [ ] **Step 2: Typecheck**

Run:
```bash
pnpm --filter @neo-kodex/api typecheck
```

Expected: No errors.

- [ ] **Step 3: Lint**

Run:
```bash
pnpm --filter @neo-kodex/api lint
```

Expected: No errors (or auto-fixed in place).

- [ ] **Step 4: Verify branch history**

Run:
```bash
git log --oneline main..HEAD
```

Expected: ~9 commits on `feat/api-observability` covering deps, env vars, request context, pino, sentry, storage, health controller, health e2e, docker healthcheck.

### Task 1.11: Open PR1

- [ ] **Step 1: Push branch**

```bash
git push -u origin feat/api-observability
```

- [ ] **Step 2: Open PR**

```bash
gh pr create --title "feat(api): observability — pino + Sentry + health endpoints" --body "$(cat <<'EOF'
## Summary

PR1 del sub-proyecto **API speaks protocol** (spec en `docs/superpowers/specs/2026-05-14-api-speaks-protocol-design.md`).

Sin cambios de rutas ni shape de respuesta. Cero riesgo de regresión funcional.

- **nestjs-pino** reemplaza Logger nativo NestJS. Redaction de auth/cookies/password/token/refreshToken/rut. Request logging automático. Pretty print en dev, JSON en prod.
- **Request ID** vía AsyncLocalStorage; UUID por request (o reusa `X-Request-Id` header), inyectado en cada log line.
- **Sentry SDK** con DSN configurable (off si vacío). Helper `captureFromFilter` lo usa PR2.
- **HealthModule**: `/api/health` (liveness, sin chequeos) + `/api/health/ready` (Prisma + MinIO).
- **Docker healthcheck** del api service apunta a `/api/health`.

## New env vars

`LOG_LEVEL`, `LOG_PRETTY`, `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_TRACES_SAMPLE_RATE`, `SENTRY_RELEASE`, `SENTRY_CAPTURE_4XX`. Documentadas en `.env.example`. Sentry queda off si no se setea DSN.

## Test plan

- [ ] CI passes (typecheck + lint + test)
- [ ] Tras merge + deploy: `curl https://<api>/api/health` retorna 200
- [ ] Tras merge + deploy: `curl https://<api>/api/health/ready` retorna 200 con db+storage true
- [ ] Tras merge + deploy: logs en Coolify aparecen como JSON con `requestId`
- [ ] Si se setea SENTRY_DSN en Coolify y se fuerza un 500 manual, llega a Sentry

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL returned. Pegar URL en la conversación para tracking.

---

## Phase 2: PR2 — Error shape

**Branch:** `feat/api-error-shape` (desde `main` tras merge PR1)

**Goal:** Normalizar todos los errores al shape `{error:{code,message,details,requestId}}`. Migrar throws críticos a códigos específicos. Actualizar parser en storefront/admin.

### Task 2.1: Branch from main

- [ ] **Step 1**

```bash
git checkout main
git pull origin main
git checkout -b feat/api-error-shape
```

### Task 2.2: AppException class

**Files:**
- Create: `apps/api/src/common/errors/app-exception.ts`
- Create: `apps/api/src/common/errors/app-exception.spec.ts`

- [ ] **Step 1: Write failing test**

Create `apps/api/src/common/errors/app-exception.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { AppException } from './app-exception';

describe('AppException', () => {
  it('exposes code, message, status, details on the response', () => {
    const exc = new AppException('COUPON_EXPIRED', 'Cupón vencido', 400, {
      code: 'BIENVENIDA10',
    });
    expect(exc.code).toBe('COUPON_EXPIRED');
    expect(exc.message).toBe('Cupón vencido');
    expect(exc.getStatus()).toBe(400);
    expect(exc.details).toEqual({ code: 'BIENVENIDA10' });
    expect(exc.getResponse()).toMatchObject({
      code: 'COUPON_EXPIRED',
      message: 'Cupón vencido',
      details: { code: 'BIENVENIDA10' },
    });
  });

  it('allows omitting details', () => {
    const exc = new AppException('AUTH_INVALID_CREDENTIALS', 'Credenciales inválidas', 401);
    expect(exc.details).toBeUndefined();
    expect(exc.getResponse()).toMatchObject({
      code: 'AUTH_INVALID_CREDENTIALS',
      message: 'Credenciales inválidas',
    });
  });
});
```

- [ ] **Step 2: Run test (expect FAIL)**

```bash
pnpm --filter @neo-kodex/api test -- app-exception
```

Expected: Module not found.

- [ ] **Step 3: Implement**

Create `apps/api/src/common/errors/app-exception.ts`:

```typescript
import { HttpException } from '@nestjs/common';

export class AppException extends HttpException {
  constructor(
    public readonly code: string,
    message: string,
    status: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super({ code, message, details }, status);
  }
}
```

- [ ] **Step 4: Run test (expect PASS)**

```bash
pnpm --filter @neo-kodex/api test -- app-exception
```

Expected: 2/2 passing.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/common/errors/app-exception.ts apps/api/src/common/errors/app-exception.spec.ts
git commit -m "feat(api): add AppException class"
```

### Task 2.3: ErrorCodes catalog

**Files:**
- Create: `apps/api/src/common/errors/codes.ts`

- [ ] **Step 1: Write catalog**

Create `apps/api/src/common/errors/codes.ts`:

```typescript
export const ErrorCodes = {
  // Auth
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  AUTH_TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
  AUTH_FORBIDDEN: 'AUTH_FORBIDDEN',
  PASSWORD_TOO_WEAK: 'PASSWORD_TOO_WEAK',
  PASSWORD_RESET_TOKEN_INVALID: 'PASSWORD_RESET_TOKEN_INVALID',
  EMAIL_ALREADY_REGISTERED: 'EMAIL_ALREADY_REGISTERED',

  // Payments
  PAYMENT_INIT_FAILED: 'PAYMENT_INIT_FAILED',
  PAYMENT_VERIFY_FAILED: 'PAYMENT_VERIFY_FAILED',
  PAYMENT_REFUND_FAILED: 'PAYMENT_REFUND_FAILED',
  PAYMENT_PROVIDER_UNAVAILABLE: 'PAYMENT_PROVIDER_UNAVAILABLE',
  PAYMENT_VALIDATION: 'PAYMENT_VALIDATION',

  // Checkout / Orders
  STOCK_INSUFFICIENT: 'STOCK_INSUFFICIENT',
  CART_EMPTY: 'CART_EMPTY',
  CART_NOT_FOUND: 'CART_NOT_FOUND',
  INVALID_SHIPPING_REGION: 'INVALID_SHIPPING_REGION',
  ORDER_NOT_FOUND: 'ORDER_NOT_FOUND',
  ORDER_ITEM_NOT_FOUND: 'ORDER_ITEM_NOT_FOUND',
  ORDER_NOTE_NOT_FOUND: 'ORDER_NOTE_NOT_FOUND',
  ORDER_NOTE_EMPTY: 'ORDER_NOTE_EMPTY',
  ORDER_QUANTITY_INVALID: 'ORDER_QUANTITY_INVALID',
  ORDER_STATE_INVALID: 'ORDER_STATE_INVALID',

  // Coupons
  COUPON_NOT_FOUND: 'COUPON_NOT_FOUND',
  COUPON_INVALID: 'COUPON_INVALID',
  COUPON_EXPIRED: 'COUPON_EXPIRED',
  COUPON_NOT_YET_VALID: 'COUPON_NOT_YET_VALID',
  COUPON_MAX_USES_REACHED: 'COUPON_MAX_USES_REACHED',
  COUPON_MIN_AMOUNT_NOT_MET: 'COUPON_MIN_AMOUNT_NOT_MET',
  COUPON_INACTIVE: 'COUPON_INACTIVE',
  COUPON_PERCENTAGE_OUT_OF_RANGE: 'COUPON_PERCENTAGE_OUT_OF_RANGE',
  COUPON_CODE_ALREADY_EXISTS: 'COUPON_CODE_ALREADY_EXISTS',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/common/errors/codes.ts
git commit -m "feat(api): add ErrorCodes catalog"
```

### Task 2.4: GlobalHttpExceptionFilter

**Files:**
- Create: `apps/api/src/common/errors/global-exception.filter.ts`
- Create: `apps/api/src/common/errors/global-exception.filter.spec.ts`

- [ ] **Step 1: Write failing test**

Create `apps/api/src/common/errors/global-exception.filter.spec.ts`:

```typescript
import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, it, expect } from 'vitest';

import { AppException } from './app-exception';
import { GlobalHttpExceptionFilter } from './global-exception.filter';
import { withRequestContext } from '../request-context';

describe('GlobalHttpExceptionFilter', () => {
  const filter = new GlobalHttpExceptionFilter();

  it('normalizes AppException preserving code/details', () => {
    let statusCode = 0;
    let payload: unknown;
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({
          status(code: number) {
            statusCode = code;
            return this;
          },
          send(body: unknown) {
            payload = body;
            return this;
          },
        }),
        getRequest: () => ({ id: 'req-1', method: 'POST', url: '/api/x' }),
      }),
    };
    withRequestContext({ requestId: 'req-1' }, () => {
      filter.catch(
        new AppException('COUPON_EXPIRED', 'Cupón vencido', 400, { code: 'X' }),
        host as never,
      );
    });
    expect(statusCode).toBe(400);
    expect(payload).toEqual({
      error: {
        code: 'COUPON_EXPIRED',
        message: 'Cupón vencido',
        details: { code: 'X' },
        requestId: 'req-1',
      },
    });
  });

  it('maps HttpException (BadRequest) to BAD_REQUEST generic code', () => {
    let statusCode = 0;
    let payload: { error: { code: string; message: string } } | undefined;
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({
          status(code: number) {
            statusCode = code;
            return this;
          },
          send(body: { error: { code: string; message: string } }) {
            payload = body;
            return this;
          },
        }),
        getRequest: () => ({ id: 'r', method: 'POST', url: '/api/x' }),
      }),
    };
    filter.catch(new BadRequestException('Algo'), host as never);
    expect(statusCode).toBe(400);
    expect(payload?.error.code).toBe('BAD_REQUEST');
    expect(payload?.error.message).toBe('Algo');
  });

  it('maps PrismaClientKnownRequestError P2025 to RESOURCE_NOT_FOUND (404)', () => {
    let statusCode = 0;
    let payload: { error: { code: string } } | undefined;
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({
          status(code: number) {
            statusCode = code;
            return this;
          },
          send(body: { error: { code: string } }) {
            payload = body;
            return this;
          },
        }),
        getRequest: () => ({ id: 'r', method: 'POST', url: '/api/x' }),
      }),
    };
    const err = new Prisma.PrismaClientKnownRequestError('Not found', {
      code: 'P2025',
      clientVersion: '5.0',
    });
    filter.catch(err, host as never);
    expect(statusCode).toBe(404);
    expect(payload?.error.code).toBe('RESOURCE_NOT_FOUND');
  });

  it('maps generic Error to INTERNAL_ERROR with 500', () => {
    let statusCode = 0;
    let payload: { error: { code: string; message: string } } | undefined;
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({
          status(code: number) {
            statusCode = code;
            return this;
          },
          send(body: { error: { code: string; message: string } }) {
            payload = body;
            return this;
          },
        }),
        getRequest: () => ({ id: 'r', method: 'GET', url: '/api/x' }),
      }),
    };
    filter.catch(new Error('boom'), host as never);
    expect(statusCode).toBe(500);
    expect(payload?.error.code).toBe('INTERNAL_ERROR');
    expect(payload?.error.message).toBe('Internal server error');
  });
});
```

- [ ] **Step 2: Run test (expect FAIL)**

```bash
pnpm --filter @neo-kodex/api test -- global-exception.filter
```

Expected: Module not found.

- [ ] **Step 3: Implement filter**

Create `apps/api/src/common/errors/global-exception.filter.ts`:

```typescript
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { requestContext } from '../request-context';
import { captureFromFilter } from '../sentry';
import { AppException } from './app-exception';

interface ErrorPayload {
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
}

const HTTP_STATUS_TO_CODE: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'TOO_MANY_REQUESTS',
};

const PRISMA_CODE_MAP: Record<string, { status: number; code: string }> = {
  P2002: { status: 409, code: 'RESOURCE_CONFLICT' },
  P2025: { status: 404, code: 'RESOURCE_NOT_FOUND' },
  P2003: { status: 409, code: 'RESOURCE_CONFLICT' },
};

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<{
      status(code: number): { send(body: unknown): void };
    }>();
    const request = ctx.getRequest<{ id?: string }>();
    const requestId =
      requestContext.getStore()?.requestId ?? request.id ?? undefined;

    const { status, payload } = this.normalize(exception);
    const responseBody: { error: ErrorPayload } = {
      error: { ...payload, requestId },
    };

    // Side effects: log + Sentry capture
    if (status >= 500) {
      this.logger.error(
        { code: payload.code, requestId, err: this.stack(exception) },
        payload.message,
      );
    } else {
      this.logger.warn(
        { code: payload.code, requestId },
        payload.message,
      );
    }
    captureFromFilter(exception, {
      requestId,
      code: payload.code,
      statusCode: status,
    });

    response.status(status).send(responseBody);
  }

  private normalize(exception: unknown): {
    status: number;
    payload: ErrorPayload;
  } {
    if (exception instanceof AppException) {
      return {
        status: exception.getStatus(),
        payload: {
          code: exception.code,
          message: exception.message,
          details: exception.details,
        },
      };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      const message =
        typeof raw === 'string'
          ? raw
          : (raw as { message?: string | string[] }).message
            ? Array.isArray((raw as { message: string[] }).message)
              ? (raw as { message: string[] }).message.join('; ')
              : ((raw as { message: string }).message)
            : exception.message;
      return {
        status,
        payload: {
          code: HTTP_STATUS_TO_CODE[status] ?? 'HTTP_ERROR',
          message,
        },
      };
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const map = PRISMA_CODE_MAP[exception.code];
      if (map) {
        return {
          status: map.status,
          payload: { code: map.code, message: 'Resource error' },
        };
      }
      return {
        status: 500,
        payload: { code: 'DATABASE_ERROR', message: 'Database error' },
      };
    }
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      payload: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
      },
    };
  }

  private stack(exception: unknown): string | undefined {
    if (
      typeof exception === 'object' &&
      exception !== null &&
      'stack' in exception &&
      typeof (exception as { stack: unknown }).stack === 'string'
    ) {
      return (exception as { stack: string }).stack;
    }
    return undefined;
  }
}
```

- [ ] **Step 4: Run test (expect PASS)**

```bash
pnpm --filter @neo-kodex/api test -- global-exception.filter
```

Expected: 4/4 tests passing.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/common/errors/global-exception.filter.ts apps/api/src/common/errors/global-exception.filter.spec.ts
git commit -m "feat(api): add GlobalHttpExceptionFilter"
```

### Task 2.5: Register filter globally in main.ts

**Files:**
- Modify: `apps/api/src/main.ts`

- [ ] **Step 1: Add import**

Edit `apps/api/src/main.ts`. Add import:

```typescript
import { GlobalHttpExceptionFilter } from './common/errors/global-exception.filter';
```

- [ ] **Step 2: Register filter**

After `app.useGlobalPipes(...)` block (around line 76), add:

```typescript
app.useGlobalFilters(new GlobalHttpExceptionFilter());
```

- [ ] **Step 3: Manual smoke test**

Run dev server:
```bash
pnpm --filter @neo-kodex/api dev
```

Curl an invalid login:
```bash
curl -s -X POST http://localhost:3001/api/auth/admin/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"none","password":"x"}'
```

Expected response shape (NOT the new code yet — still generic UNAUTHORIZED until Task 2.6):
```json
{"error":{"code":"UNAUTHORIZED","message":"Credenciales inválidas","requestId":"<uuid>"}}
```

Kill dev server.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/main.ts
git commit -m "feat(api): register GlobalHttpExceptionFilter"
```

### Task 2.6: Migrate auth module throws to AppException

**Files:**
- Modify: `apps/api/src/auth/auth.service.ts`
- Modify: `apps/api/src/auth/password-reset.service.ts`
- Modify: `apps/api/src/auth/guards/admin-only.guard.ts`
- Modify: `apps/api/src/auth/guards/roles.guard.ts`
- Modify: `apps/api/src/auth/guards/jwt-auth.guard.ts`

- [ ] **Step 1: Migrate auth.service.ts**

Open `apps/api/src/auth/auth.service.ts`. Replace each `throw new UnauthorizedException('Credenciales inválidas')` (lines 34, 46, 127, 131) with:

```typescript
throw new AppException(
  ErrorCodes.AUTH_INVALID_CREDENTIALS,
  'Credenciales inválidas',
  401,
);
```

Replace `throw new UnauthorizedException()` at lines 146, 155 with:

```typescript
throw new AppException(
  ErrorCodes.AUTH_TOKEN_INVALID,
  'Token inválido',
  401,
);
```

Replace `throw new ConflictException('Email ya registrado')` at line 75:

```typescript
throw new AppException(
  ErrorCodes.EMAIL_ALREADY_REGISTERED,
  'Email ya registrado',
  409,
);
```

Add at top of file:

```typescript
import { AppException } from '../common/errors/app-exception';
import { ErrorCodes } from '../common/errors/codes';
```

Remove unused imports from `@nestjs/common` (UnauthorizedException, ConflictException) if no other code in the file uses them.

- [ ] **Step 2: Migrate password-reset.service.ts**

Open `apps/api/src/auth/password-reset.service.ts`. Replace `throw new BadRequestException('Token inválido o expirado')` at line 106:

```typescript
throw new AppException(
  ErrorCodes.PASSWORD_RESET_TOKEN_INVALID,
  'Token inválido o expirado',
  400,
);
```

Add imports at top:

```typescript
import { AppException } from '../common/errors/app-exception';
import { ErrorCodes } from '../common/errors/codes';
```

- [ ] **Step 3: Migrate guards**

Open `apps/api/src/auth/guards/admin-only.guard.ts`. Replace line 15 `throw new ForbiddenException('Requiere permisos de admin')`:

```typescript
throw new AppException(
  ErrorCodes.AUTH_FORBIDDEN,
  'Requiere permisos de admin',
  403,
);
```

Open `apps/api/src/auth/guards/roles.guard.ts`. Replace each `throw new ForbiddenException(<msg>)` (lines 33, 41, 49, 52) with `AppException` using `ErrorCodes.AUTH_FORBIDDEN`, status 403, preserving the original message string.

Open `apps/api/src/auth/guards/jwt-auth.guard.ts`. Replace line 28 `throw new UnauthorizedException()`:

```typescript
throw new AppException(
  ErrorCodes.AUTH_TOKEN_INVALID,
  'Sesión inválida',
  401,
);
```

Add the `AppException` + `ErrorCodes` imports to each modified file.

- [ ] **Step 4: Update auth e2e tests**

Edit `apps/api/test/auth.e2e-spec.ts`. The tests check `body.message` directly — they need to handle the new shape `body.error.message`. Replace assertions like:

```typescript
const body = res.json() as { message: string | string[] };
const message = Array.isArray(body.message) ? body.message.join(' ') : body.message;
```

with:

```typescript
const body = res.json() as
  | { message: string | string[] }
  | { error: { message: string | string[] } };
const raw =
  'error' in body && body.error
    ? (body.error as { message: string | string[] }).message
    : (body as { message: string | string[] }).message;
const message = Array.isArray(raw) ? raw.join(' ') : raw;
```

Note: `ValidationPipe` errors (`PASSWORD_TOO_WEAK`, weak passwords) still come from `BadRequestException` thrown by Nest internals — those are normalized by the filter into `{error:{code:'BAD_REQUEST',message:'...'}}`. The assertion above handles both cases.

- [ ] **Step 5: Run auth tests**

```bash
pnpm --filter @neo-kodex/api test -- auth.e2e
```

Expected: All auth tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/auth apps/api/test/auth.e2e-spec.ts
git commit -m "feat(api): migrate auth module to AppException codes"
```

### Task 2.7: Migrate coupons module throws

**Files:**
- Modify: `apps/api/src/coupons/coupons.service.ts`

- [ ] **Step 1: Migrate throws**

Open `apps/api/src/coupons/coupons.service.ts`. Apply these replacements:

| Line | From | To |
|------|------|-----|
| 50, 58 | `throw new NotFoundException('Cupón no encontrado')` | `throw new AppException(ErrorCodes.COUPON_NOT_FOUND, 'Cupón no encontrado', 404)` |
| 67 | `throw new ConflictException('Código ya existe')` | `throw new AppException(ErrorCodes.COUPON_CODE_ALREADY_EXISTS, 'Código ya existe', 409)` |
| 70, 94 | `throw new BadRequestException('Porcentaje debe ser entre 1 y 100')` | `throw new AppException(ErrorCodes.COUPON_PERCENTAGE_OUT_OF_RANGE, 'Porcentaje debe ser entre 1 y 100', 400)` |
| 124 | `throw new BadRequestException('Cupón inválido')` | `throw new AppException(ErrorCodes.COUPON_INVALID, 'Cupón inválido', 400)` |
| 127 | `throw new BadRequestException('Cupón inactivo')` | `throw new AppException(ErrorCodes.COUPON_INACTIVE, 'Cupón inactivo', 400)` |
| 131 | `throw new BadRequestException('Cupón aún no válido')` | `throw new AppException(ErrorCodes.COUPON_NOT_YET_VALID, 'Cupón aún no válido', 400)` |
| 134 | `throw new BadRequestException('Cupón expirado')` | `throw new AppException(ErrorCodes.COUPON_EXPIRED, 'Cupón expirado', 400)` |
| 138 | `throw new BadRequestException('Cupón agotado')` | `throw new AppException(ErrorCodes.COUPON_MAX_USES_REACHED, 'Cupón agotado', 400)` |
| 146 | `throw new BadRequestException(<min amount message>)` | `throw new AppException(ErrorCodes.COUPON_MIN_AMOUNT_NOT_MET, <message>, 400)` |

Add imports at top:

```typescript
import { AppException } from '../common/errors/app-exception';
import { ErrorCodes } from '../common/errors/codes';
```

Remove now-unused imports from `@nestjs/common`.

- [ ] **Step 2: Run all tests**

```bash
pnpm --filter @neo-kodex/api test
```

Expected: All pass.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/coupons/coupons.service.ts
git commit -m "feat(api): migrate coupons module to AppException codes"
```

### Task 2.8: Migrate orders module throws

**Files:**
- Modify: `apps/api/src/orders/orders.service.ts`
- Modify: `apps/api/src/orders/orders.controller.ts`

- [ ] **Step 1: Migrate orders.service.ts**

Apply these replacements in `apps/api/src/orders/orders.service.ts`:

| Line | Original | New code |
|------|----------|----------|
| 82 | `throw new BadRequestException('El carrito está vacío')` | `throw new AppException(ErrorCodes.CART_EMPTY, 'El carrito está vacío', 400)` |
| 113 | `throw new BadRequestException(<stock message>)` | `throw new AppException(ErrorCodes.STOCK_INSUFFICIENT, <message>, 400)` |
| 270, 277 | `throw new BadRequestException(<message>)` | `throw new AppException(ErrorCodes.ORDER_STATE_INVALID, <message>, 400)` — preserve the original message string verbatim |
| 364, 605 | `throw new NotFoundException('Orden no encontrada')` | `throw new AppException(ErrorCodes.ORDER_NOT_FOUND, 'Orden no encontrada', 404)` |
| 494 | `throw new BadRequestException('El contenido de la nota es obligatorio')` | `throw new AppException(ErrorCodes.ORDER_NOTE_EMPTY, 'El contenido de la nota es obligatorio', 400)` |
| 525 | `throw new NotFoundException('Nota no encontrada')` | `throw new AppException(ErrorCodes.ORDER_NOTE_NOT_FOUND, 'Nota no encontrada', 404)` |
| 642 | `throw new BadRequestException('Cantidad inválida (debe ser >= 1)')` | `throw new AppException(ErrorCodes.ORDER_QUANTITY_INVALID, 'Cantidad inválida (debe ser >= 1)', 400)` |
| 646, 715 | `throw new NotFoundException('Item no encontrado en esta orden')` | `throw new AppException(ErrorCodes.ORDER_ITEM_NOT_FOUND, 'Item no encontrado en esta orden', 404)` |
| 660, 829 | `throw new BadRequestException(<stock issue>)` | `throw new AppException(ErrorCodes.STOCK_INSUFFICIENT, <message>, 400)` |
| 1107, 1115 | `throw new NotFoundException('No hay carrito activo')` | `throw new AppException(ErrorCodes.CART_NOT_FOUND, 'No hay carrito activo', 404)` |
| 1118 | `throw new BadRequestException(<message>)` | `throw new AppException(ErrorCodes.ORDER_STATE_INVALID, <message>, 400)` |

Add imports at top:

```typescript
import { AppException } from '../common/errors/app-exception';
import { ErrorCodes } from '../common/errors/codes';
```

- [ ] **Step 2: Migrate orders.controller.ts**

In `apps/api/src/orders/orders.controller.ts`, lines 50 and 61:

```typescript
// Line 50
throw new AppException(
  ErrorCodes.AUTH_FORBIDDEN,
  'Solo clientes pueden ver sus órdenes',
  403,
);
// Line 61
throw new AppException(ErrorCodes.AUTH_FORBIDDEN, 'Forbidden', 403);
```

Add imports.

- [ ] **Step 3: Update orders-checkout e2e test**

Edit `apps/api/test/orders-checkout.e2e-spec.ts`. Same pattern as Task 2.6 step 4: any assertion that reads `body.message` must handle `body.error.message` shape.

- [ ] **Step 4: Run orders tests**

```bash
pnpm --filter @neo-kodex/api test -- orders-checkout
```

Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/orders apps/api/test/orders-checkout.e2e-spec.ts
git commit -m "feat(api): migrate orders module to AppException codes"
```

### Task 2.9: Migrate payments module throws

**Files:**
- Modify: `apps/api/src/payments/payments.controller.ts`

- [ ] **Step 1: Migrate throw**

Replace line 59:

```typescript
throw new AppException(
  ErrorCodes.PAYMENT_VALIDATION,
  'value debe ser un string',
  400,
);
```

Add imports.

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/payments/payments.controller.ts
git commit -m "feat(api): migrate payments module to AppException codes"
```

### Task 2.10: Update storefront ApiError parser

**Files:**
- Modify: `apps/storefront/src/lib/api.ts`

- [ ] **Step 1: Update parser**

In `apps/storefront/src/lib/api.ts`, replace the block (lines 114-123):

```typescript
if (!res.ok) {
  const errBody = await res.json().catch(() => ({ message: res.statusText }));
  const message =
    typeof (errBody as { message?: unknown }).message === 'string'
      ? (errBody as { message: string }).message
      : Array.isArray((errBody as { message?: unknown }).message)
        ? (errBody as { message: string[] }).message.join('; ')
        : res.statusText;
  throw new ApiError(res.status, message, errBody);
}
```

with:

```typescript
if (!res.ok) {
  const errBody = await res.json().catch(() => ({}));
  const errObj = (errBody as { error?: { code?: string; message?: string | string[] } }).error;
  let message = res.statusText;
  if (errObj?.message) {
    message = Array.isArray(errObj.message) ? errObj.message.join('; ') : errObj.message;
  } else if (typeof (errBody as { message?: unknown }).message === 'string') {
    message = (errBody as { message: string }).message;
  } else if (Array.isArray((errBody as { message?: unknown }).message)) {
    message = (errBody as { message: string[] }).message.join('; ');
  }
  throw new ApiError(res.status, message, errBody);
}
```

Update `ApiError` class to expose `code`:

```typescript
export class ApiError extends Error {
  public readonly code?: string;
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
    const errObj = (body as { error?: { code?: string } } | undefined)?.error;
    this.code = errObj?.code;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/storefront/src/lib/api.ts
git commit -m "feat(storefront): parse new {error:{code,message}} shape"
```

### Task 2.11: Update admin ApiError parser

**Files:**
- Modify: `apps/admin/src/lib/api.ts`

- [ ] **Step 1: Apply the same diff as Task 2.10 step 1**

(Same code, identical structure — copy parser block + ApiError class update.)

- [ ] **Step 2: Commit**

```bash
git add apps/admin/src/lib/api.ts
git commit -m "feat(admin): parse new {error:{code,message}} shape"
```

### Task 2.12: Final validation of PR2

- [ ] **Step 1: Full test suite**

```bash
pnpm --filter @neo-kodex/api test
```

Expected: all green.

- [ ] **Step 2: Typecheck all packages**

```bash
pnpm typecheck
```

Expected: no errors in api/admin/storefront.

- [ ] **Step 3: Lint**

```bash
pnpm lint
```

- [ ] **Step 4: Manual smoke**

Boot dev stack:
```bash
docker compose up -d
pnpm dev
```

Trigger 3 errors manually and check shape:
- `curl -s -X POST http://localhost:3001/api/auth/admin/login -H 'Content-Type: application/json' -d '{"email":"x","password":"y"}'` → expect `{error:{code:"AUTH_INVALID_CREDENTIALS",...}}`
- `curl -s http://localhost:3001/api/products/non-existent-slug` → expect `{error:{code:"NOT_FOUND",...}}` (no AppException, filter assigns generic)
- Try `POST /api/cart/coupon` with expired coupon → expect `{error:{code:"COUPON_EXPIRED",...}}`

- [ ] **Step 5: Verify storefront/admin flows**

Open storefront in browser (`http://localhost:3002`), try to apply expired/invalid coupon. Error message should display correctly (not "undefined" or raw JSON).

Same in admin (`http://localhost:3000`): login with bad password → error message visible.

### Task 2.13: Open PR2

- [ ] **Step 1: Push**

```bash
git push -u origin feat/api-error-shape
```

- [ ] **Step 2: Open PR**

```bash
gh pr create --title "feat(api): error shape — uniform {error:{code,message,details,requestId}}" --body "$(cat <<'EOF'
## Summary

PR2 del sub-proyecto **API speaks protocol**. Depende de PR1 (mergeado).

- Nueva clase `AppException` + catalog `ErrorCodes` (32 códigos enumerados).
- `GlobalHttpExceptionFilter` registrado globalmente. Normaliza shape de TODO el error output:
  ```json
  {"error":{"code":"COUPON_EXPIRED","message":"Cupón vencido","details":{...},"requestId":"abc-123"}}
  ```
- Migrados los throws en módulos críticos: auth, coupons, orders, payments.
- Sentry captura 5xx siempre; 4xx solo con `SENTRY_CAPTURE_4XX=true`.
- Storefront + admin: `ApiError` actualizado para parsear el nuevo shape. Expone `error.code` para mensajes localizados por código.

## Breaking changes

- Shape de error pasa de `{message:..., statusCode:...}` a `{error:{code,message,details,requestId}}`. Consumidores externos no neo-kodex tendrían que actualizar; el storefront y admin de este repo ya están actualizados en el mismo PR.

## Test plan

- [ ] CI passes
- [ ] Manual: login con creds malas → mensaje correcto en storefront/admin
- [ ] Manual: aplicar cupón expirado → `COUPON_EXPIRED` visible en network panel
- [ ] Manual: forzar 500 (drop DB) → llega a Sentry (si DSN está)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Phase 3: PR3 — Contract (versionado + OpenAPI)

**Branch:** `feat/api-v1-openapi` (desde `main` tras merge PR2)

**Goal:** Migrar todas las rutas a `/api/v1/...`. Servir Swagger UI público en `/api/docs` + JSON spec en `/api/docs-json`.

### Task 3.1: Branch from main

- [ ] **Step 1**

```bash
git checkout main && git pull && git checkout -b feat/api-v1-openapi
```

### Task 3.2: Install @nestjs/swagger

- [ ] **Step 1**

```bash
pnpm --filter @neo-kodex/api add @nestjs/swagger@^7.4.0
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/package.json pnpm-lock.yaml
git commit -m "chore(api): add @nestjs/swagger"
```

### Task 3.3: Activate Swagger CLI plugin

**Files:**
- Modify: `apps/api/nest-cli.json`

- [ ] **Step 1: Update nest-cli.json**

Replace `apps/api/nest-cli.json` with:

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true,
    "plugins": [
      {
        "name": "@nestjs/swagger",
        "options": {
          "classValidatorShim": true,
          "introspectComments": true
        }
      }
    ]
  }
}
```

- [ ] **Step 2: Verify build still works**

```bash
pnpm --filter @neo-kodex/api build
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/api/nest-cli.json
git commit -m "chore(api): activate @nestjs/swagger CLI plugin"
```

### Task 3.4: Enable URI versioning + Swagger setup in main.ts

**Files:**
- Modify: `apps/api/src/main.ts`

- [ ] **Step 1: Add imports**

```typescript
import { VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
```

- [ ] **Step 2: Enable versioning AFTER setGlobalPrefix**

Replace line 78 `app.setGlobalPrefix('api');` with:

```typescript
app.setGlobalPrefix('api');
app.enableVersioning({
  type: VersioningType.URI,
  defaultVersion: '1',
  prefix: 'v',
});
```

- [ ] **Step 3: Update rate-limit AUTH_PATHS for versioned URLs**

In `main.ts`, replace the AUTH_PATHS set (lines 40-45):

```typescript
const AUTH_PATHS = new Set([
  '/api/v1/auth/admin/login',
  '/api/v1/auth/customer/login',
  '/api/v1/auth/forgot-password',
  '/api/v1/auth/reset-password',
]);
```

- [ ] **Step 4: Wire Swagger module**

After `app.useGlobalFilters(...)`, BEFORE `await app.listen(...)`, add:

```typescript
const swaggerConfig = new DocumentBuilder()
  .setTitle('Neo-Kodex Ecommerce API')
  .setDescription(
    'Headless ecommerce platform API. ' +
      'Auth via Bearer JWT. Errors follow {error:{code,message,details,requestId}}.',
  )
  .setVersion('1.0')
  .addBearerAuth()
  .addServer('/', 'Current host')
  .build();
const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
SwaggerModule.setup('api/docs', app, swaggerDocument, {
  jsonDocumentUrl: 'api/docs-json',
});
```

- [ ] **Step 5: Update startup log**

Replace line 82:

```typescript
console.log(
  `[api] listening on http://localhost:${port}/api/v1 (docs: /api/docs)`,
);
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/main.ts
git commit -m "feat(api): enable /api/v1 versioning + serve Swagger UI"
```

### Task 3.5: Update storefront api helper to prefix /v1

**Files:**
- Modify: `apps/storefront/src/lib/api.ts`

- [ ] **Step 1: Update fetch call**

Replace line 100:

```typescript
const res = await fetch(`${API_URL}${path}`, {
```

with:

```typescript
const res = await fetch(`${API_URL}/v1${path}`, {
```

Replace line 55 inside `refreshAccessToken`:

```typescript
const res = await fetch(`${API_URL}/v1/auth/refresh`, {
```

- [ ] **Step 2: Commit**

```bash
git add apps/storefront/src/lib/api.ts
git commit -m "feat(storefront): prefix API calls with /v1"
```

### Task 3.6: Update admin api helper to prefix /v1

**Files:**
- Modify: `apps/admin/src/lib/api.ts`

- [ ] **Step 1: Apply same diff as Task 3.5**

(Identical changes to admin's `lib/api.ts`: prefix `/v1` in both the main `fetch` and the `refreshAccessToken` call.)

- [ ] **Step 2: Check for components doing direct fetch**

```bash
grep -rn "fetch.*API_URL\|fetch.*api/" apps/admin/src
```

If any direct fetch is found (especially `media-manager.tsx` per spec context), update its URL to include `/v1`.

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src
git commit -m "feat(admin): prefix API calls with /v1"
```

### Task 3.7: Update e2e test URLs to /api/v1

**Files:**
- Modify: `apps/api/test/auth.e2e-spec.ts`
- Modify: `apps/api/test/orders-checkout.e2e-spec.ts`

- [ ] **Step 1: Find all test URLs**

```bash
grep -rn "url: '/api/" apps/api/test
```

- [ ] **Step 2: Replace `/api/` with `/api/v1/` in all `url:` properties**

Use a global find/replace in your editor on both `.e2e-spec.ts` files. Pattern: `url: '/api/` → `url: '/api/v1/`. Verify each replacement is intentional.

- [ ] **Step 3: Run all tests**

```bash
pnpm --filter @neo-kodex/api test
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add apps/api/test
git commit -m "test(api): update e2e URLs to /api/v1"
```

### Task 3.8: Add @ApiTags + @ApiBearerAuth to controllers

**Files:**
- Modify: 28 controllers in `apps/api/src/**/*.controller.ts`

- [ ] **Step 1: Tag public controllers**

For each public controller (e.g., `products.controller.ts`, `categories.controller.ts`, `cart.controller.ts`, `orders.controller.ts`, `auth.controller.ts`, `health.controller.ts`, `seo.controller.ts`, `reviews.controller.ts`, `analytics.controller.ts`, `coupons.controller.ts`, `customers.controller.ts`, `attributes.controller.ts`, `payments.controller.ts`, `webpay-return.controller.ts`, `settings.controller.ts`, `shipping-rates.controller.ts`, `app.controller.ts`):

Add at top:

```typescript
import { ApiTags } from '@nestjs/swagger';
```

Decorate the controller class:

```typescript
@ApiTags('<TagName>')
@Controller(...)
export class XxxController { ... }
```

Use these tags (one per module):
- `Auth`, `Products`, `Categories`, `Attributes`, `Variants`, `Cart`, `Orders`, `Coupons`, `Customers`, `Payments`, `Shipping`, `Reviews`, `Media`, `Health`, `Settings`, `SEO`, `Analytics`, `Audit`, `Dashboard`, `Import`, `Admins`, `Emails`.

- [ ] **Step 2: Tag admin controllers + add bearer auth**

For each admin controller (`admin-*.controller.ts`, plus the `admin-only` prefix variants):

```typescript
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Admin · <Resource>')
@ApiBearerAuth()
@Controller(...)
export class AdminXxxController { ... }
```

- [ ] **Step 3: Validate Swagger UI**

Run dev:
```bash
pnpm --filter @neo-kodex/api dev
```

Open browser at `http://localhost:3001/api/docs`. Expected:
- Swagger UI loads
- Tags grouped: `Auth`, `Products`, `Admin · Products`, etc.
- "Authorize" button accepts Bearer token
- Each endpoint shows method, path, params

Kill dev.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src
git commit -m "feat(api): annotate controllers with @ApiTags + @ApiBearerAuth"
```

### Task 3.9: Smoke test Swagger JSON

- [ ] **Step 1: Add smoke test**

Create `apps/api/test/openapi.e2e-spec.ts`:

```typescript
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
      // Allow health endpoints which are versioned too, plus any other route
      expect(path).toMatch(/^\/api\/v1\//);
    }
  });
});
```

NOTE: `buildTestApp` must also call `enableVersioning` and `SwaggerModule.setup` for this test to work. Check `apps/api/test/helpers/app.ts` and add the same setup as `main.ts` (versioning + swagger setup). If `buildTestApp` already mirrors `main.ts`, no change needed.

- [ ] **Step 2: Update buildTestApp to mirror main.ts setup**

Verified: `apps/api/test/helpers/app.ts` already calls `app.setGlobalPrefix('api')` but does NOT call `enableVersioning` or `SwaggerModule.setup`. Add both.

Edit `apps/api/test/helpers/app.ts`:

```typescript
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import fastifyMultipart from '@fastify/multipart';

import { AppModule } from '../../src/app.module';

export async function buildTestApp(): Promise<NestFastifyApplication> {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter({ logger: false }),
  );
  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
    prefix: 'v',
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );
  await app.register(fastifyMultipart);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Neo-Kodex Ecommerce API')
    .setDescription('Test build')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs-json',
  });

  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}
```

- [ ] **Step 3: Run smoke test**

```bash
pnpm --filter @neo-kodex/api test -- openapi
```

Expected: 2/2 passing.

- [ ] **Step 4: Commit**

```bash
git add apps/api/test/openapi.e2e-spec.ts apps/api/test/helpers/app.ts
git commit -m "test(api): smoke test for OpenAPI spec"
```

### Task 3.10: Update README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add API reference section**

Insert in `README.md` (under the "Stack" or "Quickstart" section, wherever fits):

```markdown
## API reference

Once the API is running, the live spec and interactive UI are available at:

- **Swagger UI**: http://localhost:3001/api/docs
- **OpenAPI JSON**: http://localhost:3001/api/docs-json

All endpoints live under `/api/v1/`. Auth is via Bearer JWT (admin endpoints) or `X-Cart-Session` header (guest cart).

Errors follow this shape:

```json
{
  "error": {
    "code": "COUPON_EXPIRED",
    "message": "Cupón vencido",
    "details": { "code": "BIENVENIDA10" },
    "requestId": "abc-123-def"
  }
}
```
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add API reference section pointing to /api/docs"
```

### Task 3.11: Final validation of PR3

- [ ] **Step 1: Full test suite**

```bash
pnpm --filter @neo-kodex/api test
```

Expected: ALL tests pass (auth, orders-checkout, health, openapi, request-context, app-exception, global-exception.filter, health.controller).

- [ ] **Step 2: Typecheck + lint**

```bash
pnpm typecheck && pnpm lint
```

- [ ] **Step 3: Manual smoke — Swagger**

```bash
pnpm --filter @neo-kodex/api dev
```

Visit `http://localhost:3001/api/docs`. Verify:
- All endpoints appear under their tags
- Tagged "Admin · X" requires bearer token
- Try out one public endpoint (e.g. `GET /api/v1/products`) and confirm 200 response

Kill dev.

- [ ] **Step 4: Manual smoke — Storefront**

```bash
docker compose up -d
pnpm dev
```

Open `http://localhost:3002`:
- Home loads products
- PDP works
- Add to cart works
- Checkout completes

Open `http://localhost:3000`:
- Login admin (`admin@neo-kodex.local` / `changeme123`)
- Navigate to /products, /orders, /coupons — all CRUDs work

### Task 3.12: Open PR3

- [ ] **Step 1**

```bash
git push -u origin feat/api-v1-openapi
```

- [ ] **Step 2**

```bash
gh pr create --title "feat(api): contract — /api/v1 versioning + Swagger UI público" --body "$(cat <<'EOF'
## Summary

PR3 del sub-proyecto **API speaks protocol**. Cierra el ciclo. Depende de PR1 + PR2 (mergeados).

- `app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1', prefix: 'v' })` → todas las rutas viven en `/api/v1/...`.
- `@nestjs/swagger` 7.x + plugin nest-cli activado. Swagger UI público en `/api/docs`, JSON spec en `/api/docs-json`.
- Controllers anotados con `@ApiTags` agrupados por dominio; admin controllers también `@ApiBearerAuth`.
- Storefront + admin actualizan sus helpers `lib/api.ts` para prefijar `/v1`.
- Tests e2e existentes actualizados a `/api/v1/...`. Nuevo smoke test `openapi.e2e-spec.ts` valida que el JSON spec es OpenAPI 3.x y que todas las rutas viven bajo `/api/v1/`.
- Rate-limit AUTH_PATHS actualizado.
- README documenta la API reference.

## Breaking changes

- Rutas migran de `/api/<resource>` a `/api/v1/<resource>`. Storefront, admin y tests actualizados en este PR. Consumidores externos (si hubiera) tendrán que actualizar.

## Test plan

- [ ] CI passes
- [ ] Tras deploy: `/api/docs` accesible y muestra todos los endpoints
- [ ] Tras deploy: `/api/v1/health` y `/api/v1/health/ready` responden
- [ ] Tras deploy: storefront y admin funcionan end-to-end (login, checkout, gestión)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Definition of Done (cierra el sub-proyecto A)

- PR1, PR2, PR3 merged a `main`
- 3 deploys exitosos en Coolify
- `/api/docs` accesible públicamente
- `/api/health/ready` retorna 200 con `db: true, storage: true`
- Logs en Coolify se ven como JSON con `requestId`
- Si Sentry DSN está configurado, eventos llegan al dashboard
- Storefront y admin funcionan sin regresiones

Siguiente sub-proyecto del roadmap: **B — Headless integrations layer** (webhooks salientes + API keys + cola + idempotency).
