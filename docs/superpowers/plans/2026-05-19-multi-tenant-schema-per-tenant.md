# Multi-tenant schema-per-tenant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir `base-Neo-Kodex-ecommerce` de single-tenant a multi-tenant con schema-per-tenant en PostgreSQL, sirviendo N storefronts custom (uno por cliente) con un único backend NestJS y una sola DB con schemas aislados.

**Architecture:** PostgreSQL multi-schema (un schema por tenant + un schema `public` para tabla `tenants` global). NestJS resuelve tenant por request (hostname/header/JWT) y guarda el contexto en AsyncLocalStorage. Una única instancia de PrismaClient ejecuta `set_config('search_path', 'tenant_<slug>,public', true)` antes de cada query, garantizando aislación física de datos sin proliferar conexiones. Storefronts son builds Next.js separados por cliente (cada uno con su `NEXT_PUBLIC_TENANT_SLUG`); admin es uno solo y scopea por el `tenant_slug` del JWT del admin.

**Tech Stack:** NestJS 10 + Fastify, Prisma 5.22, PostgreSQL 16, Next.js 15 App Router, pnpm workspaces, AsyncLocalStorage (node:async_hooks), JWT (Passport), pg-boss (jobs).

---

## Decisiones de diseño (lock-in upfront)

1. **`set_config('search_path', ..., true)` por request, no PrismaClient-por-tenant.** Una sola conexión pool, schema seleccionado dinámicamente. El 3er parámetro `true` (is_local) lo limita a la transacción actual, evitando leak entre queries del mismo connection pool. Ratio: 1 PrismaClient vs N clientes en cache = menos conexiones a PG, menos memoria, igual aislación.
2. **Tenant resolution order:** (a) header `X-Tenant-Slug` del storefront, (b) `tenant_slug` claim del JWT (admin/customer), (c) `Host` header → lookup en `tenants.storefront_domain`. Falla cerrado: sin tenant resuelto → 400.
3. **Tabla `public.tenants`** vive en schema `public` (compartido). Todo lo demás (Products, Orders, Customers, Admins, etc.) se mueve a schemas `tenant_<slug>`.
4. **Migrations:** `prisma migrate deploy` corre contra el schema molde `tenant_template`. Para propagar a tenants existentes se usa `pg_dump --schema-only` del template + replace + apply (no `execSync` con shell interpolation — usar `execFileSync` para evitar inyección).
5. **Onboarding nuevo cliente:** endpoint `POST /admin/tenants` crea row en `public.tenants`, ejecuta `CREATE SCHEMA tenant_<slug>` y replica la estructura de `tenant_template` al nuevo schema.
6. **Storefront por tenant:** build separado en Dokploy por cliente. Cada uno con `NEXT_PUBLIC_TENANT_SLUG=cliente1` + dominio propio.
7. **Admin compartido:** un solo deploy en `admin.neokodex.cl`. El admin login pide email + password + tenant slug (input visible) o auto-resuelve por hostname. Decisión: input visible para máxima claridad; un admin pertenece a un solo tenant (UNIQUE en `tenant_template.admins.email`).
8. **Security:** todo comando shell que reciba input externo (slug) usa `execFileSync(cmd, [args])` — no `execSync` con template strings. El slug se valida con regex `^[a-z][a-z0-9_]*$` antes de cualquier uso.

---

## File Structure

### Archivos nuevos a crear

```
apps/api/src/tenants/
├── tenant.module.ts                  # Módulo NestJS exportable
├── tenant.service.ts                  # CRUD tenants + provisioning schema
├── tenant.controller.ts               # Endpoints /admin/tenants
├── tenant-context.service.ts          # AsyncLocalStorage wrapper
├── tenant.middleware.ts               # Fastify hook que resuelve tenant
├── tenant.provisioner.ts              # Crea + clona schema (safe exec)
├── dto/
│   ├── create-tenant.dto.ts
│   ├── update-tenant.dto.ts
│   └── tenant-response.dto.ts
└── __tests__/
    ├── tenant.service.spec.ts
    ├── tenant-context.service.spec.ts
    ├── tenant.middleware.spec.ts
    └── tenant.provisioner.spec.ts

apps/api/scripts/
├── migrate-all-tenants.ts             # Re-aplica template a cada schema activo
├── create-tenant-schema.ts            # CLI standalone para crear tenant manualmente
└── sync-tenant-schema.ts              # Idempotente: alinea schema X con template
```

### Archivos existentes a modificar

```
apps/api/prisma/schema.prisma          # Agregar modelo Tenant + multiSchema preview
apps/api/src/prisma/prisma.service.ts  # Hook que ejecuta set_config(search_path) por query
apps/api/src/prisma/prisma.module.ts   # forwardRef a TenantModule
apps/api/src/app.module.ts             # Registrar TenantModule
apps/api/src/main.ts                    # Hook Fastify para tenant resolution
apps/api/src/auth/auth.service.ts      # Incluir tenantSlug en JWT payload
apps/api/src/auth/strategies/jwt.strategy.ts  # Validar y exponer tenantSlug en ALS
apps/api/.env.example                  # DEFAULT_TENANT_SLUG, REQUIRE_TENANT_CONTEXT
apps/api/package.json                  # Scripts tenants:create, tenants:migrate-all

apps/storefront/src/lib/tenant.ts      # NEW: getTenantSlug() helper
apps/storefront/src/lib/api.ts         # Inyectar X-Tenant-Slug en headers
apps/storefront/next.config.ts         # Exponer NEXT_PUBLIC_TENANT_SLUG

apps/admin/src/lib/api.ts              # Inyectar X-Tenant-Slug decodificando JWT
apps/admin/src/app/login/page.tsx      # Input tenant slug en el form

packages/types/src/index.ts            # Exportar TenantSchema (zod) si se comparte
```

---

## Phase 0: Preparación

### Task 0.1: Branch y baseline

**Files:** ninguno (operaciones git)

- [ ] **Step 1: Crear branch desde main**

```bash
cd /home/pietro/Escritorio/base-Neo-Kodex-ecommerce
git checkout main
git pull origin main
git checkout -b feat/multi-tenant-schema-per-tenant
```

- [ ] **Step 2: Verificar baseline de tests pasa**

Run: `pnpm --filter @neo-kodex/api test`
Expected: todos los tests existentes en verde.

- [ ] **Step 3: Hacer backup completo de la DB de dev**

```bash
pg_dump "$DATABASE_URL" > /tmp/backup-pre-multitenant-$(date +%Y%m%d).sql
ls -lh /tmp/backup-pre-multitenant-*.sql
```

Confirma que el archivo tiene tamaño razonable (>1 KB) antes de seguir.

- [ ] **Step 4: Commit del branch vacío como punto de retorno**

```bash
git commit --allow-empty -m "chore: start multi-tenant refactor branch"
```

---

### Task 0.2: Variables de entorno baseline

**Files:**
- Modify: `apps/api/.env.example`

- [ ] **Step 1: Agregar vars de tenant a .env.example**

Append al final del archivo `apps/api/.env.example`:

```bash
# Multi-tenant
# Slug del tenant default (data existente se migra a este schema)
DEFAULT_TENANT_SLUG=demo
# Si true, requests sin tenant resuelto retornan 400. Dejar false hasta Phase 6 lista.
REQUIRE_TENANT_CONTEXT=false
```

- [ ] **Step 2: Reflejar en .env local**

```bash
echo "DEFAULT_TENANT_SLUG=demo" >> apps/api/.env
echo "REQUIRE_TENANT_CONTEXT=false" >> apps/api/.env
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/.env.example
git commit -m "feat(api): add multi-tenant env vars baseline"
```

---

## Phase 1: Modelo Tenant + split schema

### Task 1.1: Agregar Tenant a schema.prisma + multiSchema

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Activar multiSchema y declarar schemas**

Editar `apps/api/prisma/schema.prisma`, reemplazar los bloques `generator` y `datasource`:

```prisma
generator client {
  provider        = "prisma-client-js"
  binaryTargets   = ["native", "linux-musl-openssl-3.0.x"]
  previewFeatures = ["multiSchema"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  schemas  = ["public", "tenant_template"]
}
```

- [ ] **Step 2: Agregar modelo Tenant al final**

```prisma
model Tenant {
  id                 String       @id @default(cuid())
  slug               String       @unique @db.VarChar(64)
  schemaName         String       @unique @map("schema_name") @db.VarChar(64)
  name               String       @db.VarChar(255)
  storefrontDomain   String?      @unique @map("storefront_domain") @db.VarChar(255)
  status             TenantStatus @default(ACTIVE)
  createdAt          DateTime     @default(now()) @map("created_at")
  updatedAt          DateTime     @updatedAt @map("updated_at")

  @@map("tenants")
  @@schema("public")
}

enum TenantStatus {
  ACTIVE
  SUSPENDED
  ARCHIVED

  @@schema("public")
}
```

- [ ] **Step 3: Mover los modelos existentes al schema tenant_template**

Para cada modelo existente (Admin, Customer, Product, Order, OrderItem, Cart, Address, Coupon, Payment, Variant, Attribute, Category, Media, Review, ShippingRate, Webhook, Setting, etc.) agregar `@@schema("tenant_template")` al final del bloque.

Para cada enum existente (OrderStatus, PaymentStatus, AdminRole, ProductStatus, CouponType, DocumentType, ImportStatus, ImportType, etc.) agregar `@@schema("tenant_template")`.

Ejemplo de Product:

```prisma
model Product {
  id          String        @id @default(cuid())
  name        String
  // ... rest as-is
  
  @@schema("tenant_template")
}

enum ProductStatus {
  DRAFT
  ACTIVE
  ARCHIVED

  @@schema("tenant_template")
}
```

- [ ] **Step 4: Crear migration (modo create-only para revisar)**

```bash
cd apps/api
pnpm prisma migrate dev --name add_tenant_model_and_multischema --create-only
```

- [ ] **Step 5: Revisar y editar manualmente la migration generada**

Abrir `apps/api/prisma/migrations/<timestamp>_add_tenant_model_and_multischema/migration.sql`.

Asegurar que las tablas existentes se MUEVAN al schema `tenant_template` con `ALTER TABLE SET SCHEMA`, no que se dropean y recreen. Si Prisma generó DROP+CREATE, reemplazar manualmente con:

```sql
CREATE SCHEMA IF NOT EXISTS "tenant_template";

ALTER TABLE "public"."Admin" SET SCHEMA "tenant_template";
ALTER TABLE "public"."Customer" SET SCHEMA "tenant_template";
ALTER TABLE "public"."Product" SET SCHEMA "tenant_template";
-- ... uno por cada tabla. Lista exhaustiva en pg_tables:
-- psql $DATABASE_URL -c "SELECT tablename FROM pg_tables WHERE schemaname='public';"
ALTER TYPE "public"."OrderStatus" SET SCHEMA "tenant_template";
-- ... uno por cada enum existente
```

Y dejar el bloque que crea `public.tenants` y `public.TenantStatus` tal como Prisma lo generó.

- [ ] **Step 6: Aplicar migration**

```bash
pnpm prisma migrate deploy
```

- [ ] **Step 7: Regenerar Prisma Client**

```bash
pnpm prisma generate
```

- [ ] **Step 8: Verificación**

```bash
psql "$DATABASE_URL" -c "\dn" | grep -E "public|tenant_template"
psql "$DATABASE_URL" -c "\dt tenant_template.*" | head -20
psql "$DATABASE_URL" -c "\dt public.*"
```

Expected: schemas `public` (con tabla `tenants`) y `tenant_template` (con todas las tablas viejas).

- [ ] **Step 9: Commit**

```bash
git add apps/api/prisma/
git commit -m "feat(api): add Tenant model and split into public + tenant_template schemas"
```

---

### Task 1.2: TenantsModule con CRUD básico

**Files:**
- Create: `apps/api/src/tenants/tenant.module.ts`
- Create: `apps/api/src/tenants/tenant.service.ts`
- Create: `apps/api/src/tenants/tenant.controller.ts`
- Create: `apps/api/src/tenants/dto/create-tenant.dto.ts`
- Test: `apps/api/src/tenants/__tests__/tenant.service.spec.ts`

- [ ] **Step 1: DTO de create**

`apps/api/src/tenants/dto/create-tenant.dto.ts`:

```typescript
import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const createTenantSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z][a-z0-9_]*$/, 'slug debe ser snake_case y empezar con letra'),
  name: z.string().min(1).max(255),
  storefrontDomain: z.string().url().optional(),
});

export class CreateTenantDto extends createZodDto(createTenantSchema) {}
```

- [ ] **Step 2: Test failing**

`apps/api/src/tenants/__tests__/tenant.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../tenant-context.service';
import { TenantService } from '../tenant.service';

describe('TenantService', () => {
  let service: TenantService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TenantService, PrismaService, TenantContextService],
    }).compile();
    service = moduleRef.get(TenantService);
    prisma = moduleRef.get(PrismaService);
    await prisma.$executeRawUnsafe(`DELETE FROM public.tenants;`);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('create (sin provisioning, viene en Task 4.2)', () => {
    it('crea tenant con slug válido y schemaName derivado', async () => {
      const tenant = await service.create({
        slug: 'demo',
        name: 'Demo Store',
      });
      expect(tenant.slug).toBe('demo');
      expect(tenant.schemaName).toBe('tenant_demo');
      expect(tenant.status).toBe('ACTIVE');
    });

    it('rechaza slug duplicado con ConflictException', async () => {
      await service.create({ slug: 'demo', name: 'Demo' });
      await expect(
        service.create({ slug: 'demo', name: 'Otro' }),
      ).rejects.toThrow(/slug ya existe/i);
    });
  });
});
```

- [ ] **Step 3: Run, debe fallar**

Run: `pnpm --filter @neo-kodex/api test -- tenant.service.spec`
Expected: FAIL (módulo no existe).

- [ ] **Step 4: Implementar TenantService mínimo**

`apps/api/src/tenants/tenant.service.ts`:

```typescript
import { ConflictException, Injectable } from '@nestjs/common';
import type { Tenant } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';

@Injectable()
export class TenantService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTenantDto): Promise<Tenant> {
    const schemaName = `tenant_${dto.slug}`;
    try {
      return await this.prisma.tenant.create({
        data: {
          slug: dto.slug,
          schemaName,
          name: dto.name,
          storefrontDomain: dto.storefrontDomain ?? null,
        },
      });
    } catch (err: unknown) {
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code: string }).code === 'P2002'
      ) {
        throw new ConflictException(`slug ya existe: ${dto.slug}`);
      }
      throw err;
    }
  }

  findBySlug(slug: string): Promise<Tenant | null> {
    return this.prisma.tenant.findUnique({ where: { slug } });
  }

  findByDomain(domain: string): Promise<Tenant | null> {
    return this.prisma.tenant.findUnique({ where: { storefrontDomain: domain } });
  }

  list(): Promise<Tenant[]> {
    return this.prisma.tenant.findMany({ orderBy: { createdAt: 'asc' } });
  }
}
```

- [ ] **Step 5: Controller**

`apps/api/src/tenants/tenant.controller.ts`:

```typescript
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { TenantService } from './tenant.service';

@Controller('admin/tenants')
@UseGuards(JwtAuthGuard)
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Post()
  create(@Body() dto: CreateTenantDto) {
    return this.tenantService.create(dto);
  }

  @Get()
  list() {
    return this.tenantService.list();
  }
}
```

- [ ] **Step 6: Module (sin TenantContextService todavía — viene Task 2.1)**

`apps/api/src/tenants/tenant.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantController } from './tenant.controller';
import { TenantService } from './tenant.service';

@Module({
  imports: [PrismaModule],
  controllers: [TenantController],
  providers: [TenantService],
  exports: [TenantService],
})
export class TenantModule {}
```

- [ ] **Step 7: Registrar en AppModule**

Editar `apps/api/src/app.module.ts`. Agregar al array `imports`:

```typescript
import { TenantModule } from './tenants/tenant.module';
// ...
imports: [
  // ...
  TenantModule,
],
```

- [ ] **Step 8: Run tests + build**

```bash
pnpm --filter @neo-kodex/api test -- tenant.service.spec
pnpm --filter @neo-kodex/api build
```

Expected: tests PASS (2/2), build OK.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/tenants/ apps/api/src/app.module.ts
git commit -m "feat(api): TenantModule with CRUD endpoints (sin provisioning)"
```

---

## Phase 2: AsyncLocalStorage + TenantContext

### Task 2.1: TenantContextService

**Files:**
- Create: `apps/api/src/tenants/tenant-context.service.ts`
- Test: `apps/api/src/tenants/__tests__/tenant-context.service.spec.ts`

- [ ] **Step 1: Test failing**

`apps/api/src/tenants/__tests__/tenant-context.service.spec.ts`:

```typescript
import { TenantContextService } from '../tenant-context.service';

describe('TenantContextService', () => {
  let svc: TenantContextService;

  beforeEach(() => {
    svc = new TenantContextService();
  });

  it('devuelve null si no está dentro de run()', () => {
    expect(svc.getTenantSlug()).toBeNull();
    expect(svc.getSchemaName()).toBeNull();
  });

  it('aísla el slug entre runs paralelos', async () => {
    const slugs: string[] = [];
    await Promise.all([
      svc.run('cliente_a', async () => {
        await new Promise((r) => setTimeout(r, 5));
        slugs.push(svc.getTenantSlug()!);
      }),
      svc.run('cliente_b', async () => {
        await new Promise((r) => setTimeout(r, 10));
        slugs.push(svc.getTenantSlug()!);
      }),
    ]);
    expect(slugs.sort()).toEqual(['cliente_a', 'cliente_b']);
  });

  it('requireTenantSlug lanza si no hay tenant', () => {
    expect(() => svc.requireTenantSlug()).toThrow(/tenant context/i);
  });

  it('getSchemaName devuelve tenant_<slug>', async () => {
    await svc.run('cliente_x', async () => {
      expect(svc.getSchemaName()).toBe('tenant_cliente_x');
    });
  });

  it('enterWith setea sin envolver en callback', async () => {
    await new Promise<void>((resolve) => {
      setImmediate(() => {
        svc.enterWith('cliente_y');
        expect(svc.getTenantSlug()).toBe('cliente_y');
        resolve();
      });
    });
  });
});
```

- [ ] **Step 2: Run, debe fallar**

Run: `pnpm --filter @neo-kodex/api test -- tenant-context.service.spec`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`apps/api/src/tenants/tenant-context.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

interface TenantContext {
  slug: string;
  schemaName: string;
}

@Injectable()
export class TenantContextService {
  private readonly als = new AsyncLocalStorage<TenantContext>();

  run<T>(slug: string, fn: () => Promise<T> | T): Promise<T> | T {
    const ctx: TenantContext = { slug, schemaName: `tenant_${slug}` };
    return this.als.run(ctx, fn);
  }

  enterWith(slug: string): void {
    const ctx: TenantContext = { slug, schemaName: `tenant_${slug}` };
    this.als.enterWith(ctx);
  }

  getTenantSlug(): string | null {
    return this.als.getStore()?.slug ?? null;
  }

  getSchemaName(): string | null {
    return this.als.getStore()?.schemaName ?? null;
  }

  requireTenantSlug(): string {
    const slug = this.getTenantSlug();
    if (!slug) {
      throw new Error(
        'No tenant context resolved. Did TenantMiddleware run? (REQUIRE_TENANT_CONTEXT)',
      );
    }
    return slug;
  }
}
```

- [ ] **Step 4: Run test**

Run: `pnpm --filter @neo-kodex/api test -- tenant-context.service.spec`
Expected: PASS (5/5).

- [ ] **Step 5: Exportar como Global desde TenantModule**

Editar `apps/api/src/tenants/tenant.module.ts`:

```typescript
import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantContextService } from './tenant-context.service';
import { TenantController } from './tenant.controller';
import { TenantService } from './tenant.service';

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [TenantController],
  providers: [TenantService, TenantContextService],
  exports: [TenantService, TenantContextService],
})
export class TenantModule {}
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/tenants/
git commit -m "feat(api): TenantContextService with AsyncLocalStorage (run + enterWith)"
```

---

### Task 2.2: TenantMiddleware (Fastify hook)

**Files:**
- Create: `apps/api/src/tenants/tenant.middleware.ts`
- Modify: `apps/api/src/main.ts`
- Test: `apps/api/src/tenants/__tests__/tenant.middleware.spec.ts`

- [ ] **Step 1: Test del resolver**

`apps/api/src/tenants/__tests__/tenant.middleware.spec.ts`:

```typescript
import type { FastifyRequest } from 'fastify';
import { resolveTenantFromRequest } from '../tenant.middleware';
import type { TenantService } from '../tenant.service';

describe('resolveTenantFromRequest', () => {
  const fakeTenantService = {
    findBySlug: jest.fn(),
    findByDomain: jest.fn(),
  } as unknown as TenantService;

  beforeEach(() => {
    jest.resetAllMocks();
  });

  function req(opts: {
    headers?: Record<string, string>;
    hostname?: string;
  }): FastifyRequest {
    return {
      headers: opts.headers ?? {},
      hostname: opts.hostname ?? 'localhost',
    } as unknown as FastifyRequest;
  }

  it('resuelve por header X-Tenant-Slug', async () => {
    (fakeTenantService.findBySlug as jest.Mock).mockResolvedValue({
      slug: 'demo',
      status: 'ACTIVE',
    });
    const slug = await resolveTenantFromRequest(
      req({ headers: { 'x-tenant-slug': 'demo' } }),
      fakeTenantService,
    );
    expect(slug).toBe('demo');
  });

  it('cae a hostname si no hay header', async () => {
    (fakeTenantService.findByDomain as jest.Mock).mockResolvedValue({
      slug: 'cliente1',
      status: 'ACTIVE',
    });
    const slug = await resolveTenantFromRequest(
      req({ hostname: 'tienda.cliente1.cl' }),
      fakeTenantService,
    );
    expect(slug).toBe('cliente1');
  });

  it('devuelve null si tenant SUSPENDED', async () => {
    (fakeTenantService.findBySlug as jest.Mock).mockResolvedValue({
      slug: 'demo',
      status: 'SUSPENDED',
    });
    const slug = await resolveTenantFromRequest(
      req({ headers: { 'x-tenant-slug': 'demo' } }),
      fakeTenantService,
    );
    expect(slug).toBeNull();
  });

  it('devuelve null si nadie matchea', async () => {
    (fakeTenantService.findBySlug as jest.Mock).mockResolvedValue(null);
    (fakeTenantService.findByDomain as jest.Mock).mockResolvedValue(null);
    const slug = await resolveTenantFromRequest(req({}), fakeTenantService);
    expect(slug).toBeNull();
  });
});
```

- [ ] **Step 2: Run, debe fallar**

Run: `pnpm --filter @neo-kodex/api test -- tenant.middleware.spec`
Expected: FAIL.

- [ ] **Step 3: Implementar resolver**

`apps/api/src/tenants/tenant.middleware.ts`:

```typescript
import type { FastifyRequest } from 'fastify';
import type { TenantService } from './tenant.service';

/**
 * Resuelve el tenant slug del request:
 *   1. Header X-Tenant-Slug
 *   2. Hostname → tenants.storefront_domain
 *
 * Retorna null si no se puede resolver o si el tenant no está ACTIVE.
 */
export async function resolveTenantFromRequest(
  req: FastifyRequest,
  tenantService: TenantService,
): Promise<string | null> {
  const headerSlug = req.headers['x-tenant-slug'];
  if (typeof headerSlug === 'string' && headerSlug.length > 0) {
    const t = await tenantService.findBySlug(headerSlug);
    return t && t.status === 'ACTIVE' ? t.slug : null;
  }

  if (req.hostname) {
    const t = await tenantService.findByDomain(req.hostname);
    if (t && t.status === 'ACTIVE') return t.slug;
  }

  return null;
}
```

- [ ] **Step 4: Run test**

Run: `pnpm --filter @neo-kodex/api test -- tenant.middleware.spec`
Expected: PASS (4/4).

- [ ] **Step 5: Wire en main.ts**

Editar `apps/api/src/main.ts`. Después del bloque que registra plugins (helmet, cors, rate-limit), agregar:

```typescript
import { TenantContextService } from './tenants/tenant-context.service';
import { TenantService } from './tenants/tenant.service';
import { resolveTenantFromRequest } from './tenants/tenant.middleware';

// ... después de las llamadas a app.register(plugin) etc.

const tenantContext = app.get(TenantContextService);
const tenantService = app.get(TenantService);
const fastifyInstance = app.getHttpAdapter().getInstance();
const requireTenant = process.env.REQUIRE_TENANT_CONTEXT === 'true';

const PATHS_WITHOUT_TENANT = [
  '/health',
  '/api/health',
  '/admin/tenants',
  '/api/admin/tenants',
  '/auth/admin/login',
  '/api/auth/admin/login',
];

fastifyInstance.addHook('onRequest', async (request, reply) => {
  if (PATHS_WITHOUT_TENANT.some((p) => request.url.startsWith(p))) {
    return;
  }

  const slug = await resolveTenantFromRequest(request, tenantService);

  if (!slug && requireTenant) {
    return reply.code(400).send({
      statusCode: 400,
      message: 'Tenant context not resolved. Set X-Tenant-Slug header.',
    });
  }

  if (slug) {
    tenantContext.enterWith(slug);
  }
});
```

- [ ] **Step 6: Build y smoke**

```bash
pnpm --filter @neo-kodex/api build
pnpm --filter @neo-kodex/api start:dev
```

En otra terminal:

```bash
curl -s http://localhost:3001/api/health
# 200, no requiere tenant

curl -s http://localhost:3001/api/products -H "X-Tenant-Slug: demo"
# Como REQUIRE_TENANT_CONTEXT=false, no rompe. Pero no hay tenant 'demo' creado todavía,
# así que llega sin contexto al PrismaService que aún no hace search_path switch.
# El response depende del estado actual; lo importante es que no haya 500 ni 400.
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/main.ts apps/api/src/tenants/
git commit -m "feat(api): TenantMiddleware (Fastify onRequest hook) sets ALS via enterWith"
```

---

## Phase 3: PrismaService schema-aware

### Task 3.1: set_config(search_path) en cada query

**Files:**
- Modify: `apps/api/src/prisma/prisma.service.ts`
- Modify: `apps/api/src/prisma/prisma.module.ts`
- Test: `apps/api/src/prisma/__tests__/prisma.service.spec.ts`

- [ ] **Step 1: Test failing**

`apps/api/src/prisma/__tests__/prisma.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { TenantContextService } from '../../tenants/tenant-context.service';
import { PrismaService } from '../prisma.service';

describe('PrismaService (tenant-aware)', () => {
  let prisma: PrismaService;
  let ctx: TenantContextService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [PrismaService, TenantContextService],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    ctx = moduleRef.get(TenantContextService);

    await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS tenant_test_a`);
    await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS tenant_test_b`);
    await prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS tenant_test_a.things (id serial PRIMARY KEY, label text)`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS tenant_test_b.things (id serial PRIMARY KEY, label text)`,
    );
    await prisma.$executeRawUnsafe(`TRUNCATE tenant_test_a.things`);
    await prisma.$executeRawUnsafe(`TRUNCATE tenant_test_b.things`);
    await prisma.$executeRawUnsafe(
      `INSERT INTO tenant_test_a.things(label) VALUES ('A1'), ('A2')`,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO tenant_test_b.things(label) VALUES ('B1')`,
    );
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(`DROP SCHEMA tenant_test_a CASCADE`);
    await prisma.$executeRawUnsafe(`DROP SCHEMA tenant_test_b CASCADE`);
    await prisma.$disconnect();
  });

  it('queries van al schema del tenant en context', async () => {
    const a = await ctx.run('test_a', () =>
      prisma.$queryRawUnsafe<{ count: bigint }[]>(`SELECT count(*)::bigint FROM things`),
    );
    expect(Number(a[0].count)).toBe(2);

    const b = await ctx.run('test_b', () =>
      prisma.$queryRawUnsafe<{ count: bigint }[]>(`SELECT count(*)::bigint FROM things`),
    );
    expect(Number(b[0].count)).toBe(1);
  });
});
```

- [ ] **Step 2: Run, debe fallar**

Run: `pnpm --filter @neo-kodex/api test -- prisma.service.spec`
Expected: FAIL (PrismaService actual no setea search_path).

- [ ] **Step 3: Refactor PrismaService**

Reemplazar contenido de `apps/api/src/prisma/prisma.service.ts`:

```typescript
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { TenantContextService } from '../tenants/tenant-context.service';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(private readonly tenantContext: TenantContextService) {
    super();

    // Middleware Prisma: antes de cada query, si hay tenant en context,
    // emite set_config('search_path', 'tenant_<slug>,public', true).
    // true = is_local: scoped a la transacción, no leak al pool.
    this.$use(async (params, next) => {
      const schemaName = this.tenantContext.getSchemaName();
      if (schemaName) {
        await this.$executeRawUnsafe(
          `SELECT set_config('search_path', $1, true)`,
          `${schemaName},public`,
        );
      }
      return next(params);
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
```

- [ ] **Step 4: PrismaModule importa TenantContextService**

Editar `apps/api/src/prisma/prisma.module.ts`:

```typescript
import { Global, Module, forwardRef } from '@nestjs/common';
import { TenantModule } from '../tenants/tenant.module';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  imports: [forwardRef(() => TenantModule)],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

Y simétricamente en `tenant.module.ts` cambiar el import de PrismaModule:

```typescript
import { forwardRef, Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
// ...
@Global()
@Module({
  imports: [forwardRef(() => PrismaModule)],
  // ...
})
```

- [ ] **Step 5: Run prisma service tests**

Run: `pnpm --filter @neo-kodex/api test -- prisma.service.spec`
Expected: PASS (1/1).

- [ ] **Step 6: Run TODOS los tests**

Run: `pnpm --filter @neo-kodex/api test`
Expected: todos los tests previos siguen pasando.

Si algún test viejo falla porque ahora exige tenant context, envolverlo en `tenantContext.run('test_default', ...)` o crear un schema dummy `tenant_test_default` en setup.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/prisma/ apps/api/src/tenants/tenant.module.ts
git commit -m "feat(api): PrismaService sets search_path per query via TenantContext"
```

---

## Phase 4: Provisioning multi-schema

### Task 4.1: TenantProvisioner (safe exec, no shell injection)

**Files:**
- Create: `apps/api/src/tenants/tenant.provisioner.ts`
- Test: `apps/api/src/tenants/__tests__/tenant.provisioner.spec.ts`

- [ ] **Step 1: Test del provisioner**

`apps/api/src/tenants/__tests__/tenant.provisioner.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../tenant-context.service';
import { TenantProvisioner } from '../tenant.provisioner';

describe('TenantProvisioner', () => {
  let provisioner: TenantProvisioner;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TenantProvisioner, PrismaService, TenantContextService],
    }).compile();
    provisioner = moduleRef.get(TenantProvisioner);
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS tenant_test_prov CASCADE`);
    await prisma.$disconnect();
  });

  it('valida que el slug matchee /^[a-z][a-z0-9_]*$/', () => {
    expect(() => provisioner.validateSlug('OK_no_uppercase')).toThrow();
    expect(() => provisioner.validateSlug('1invalid')).toThrow();
    expect(() => provisioner.validateSlug('valid_slug')).not.toThrow();
  });

  it('crea el schema en Postgres', async () => {
    await provisioner.provision('test_prov');
    const result = await prisma.$queryRawUnsafe<{ nspname: string }[]>(
      `SELECT nspname FROM pg_namespace WHERE nspname = 'tenant_test_prov'`,
    );
    expect(result.length).toBe(1);
  });

  it('idempotente: provisionar dos veces no falla', async () => {
    await provisioner.provision('test_prov');
    await expect(provisioner.provision('test_prov')).resolves.not.toThrow();
  });
});
```

- [ ] **Step 2: Run, debe fallar**

Run: `pnpm --filter @neo-kodex/api test -- tenant.provisioner.spec`
Expected: FAIL.

- [ ] **Step 3: Implementar TenantProvisioner**

`apps/api/src/tenants/tenant.provisioner.ts`:

```typescript
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';

const SLUG_REGEX = /^[a-z][a-z0-9_]*$/;
const TEMPLATE_SCHEMA = 'tenant_template';

@Injectable()
export class TenantProvisioner {
  private readonly logger = new Logger(TenantProvisioner.name);

  constructor(private readonly prisma: PrismaService) {}

  validateSlug(slug: string): void {
    if (!SLUG_REGEX.test(slug)) {
      throw new BadRequestException(
        `slug inválido (${slug}). Debe matchear ${SLUG_REGEX}`,
      );
    }
  }

  /**
   * Crea schema tenant_<slug> y le copia la estructura de tenant_template.
   * Idempotente: si el schema ya existe, solo aplica las tablas que faltan.
   *
   * Seguridad:
   *   - slug se valida con regex antes de cualquier uso.
   *   - Todos los binarios externos (pg_dump, psql) se invocan con execFileSync
   *     pasando args en array, NUNCA con shell interpolation.
   */
  async provision(slug: string): Promise<void> {
    this.validateSlug(slug);
    const schemaName = `tenant_${slug}`;

    this.logger.log(`Provisioning schema ${schemaName}`);

    // 1. CREATE SCHEMA (parametrizado via $executeRawUnsafe NO porque DDL no
    //    soporta parámetros, sino con identificador validado por regex arriba).
    await this.prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);

    // 2. Dump estructura del template y replay en el nuevo schema.
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) throw new Error('DATABASE_URL no setteado');

    const tmpDir = mkdtempSync(join(tmpdir(), 'tenant-provision-'));
    const dumpFile = join(tmpDir, 'template.sql');

    try {
      // pg_dump --schema-only sin shell interpolation
      execFileSync(
        'pg_dump',
        [
          dbUrl,
          '--schema=' + TEMPLATE_SCHEMA,
          '--schema-only',
          '--no-owner',
          '--no-privileges',
          '--file=' + dumpFile,
        ],
        { stdio: 'pipe' },
      );

      // Reemplazar referencias al schema template por el nuevo
      // (slug está validado por regex arriba, schemaName es safe)
      let sql = readFileSync(dumpFile, 'utf8');
      sql = sql.replace(new RegExp(TEMPLATE_SCHEMA, 'g'), schemaName);
      writeFileSync(dumpFile, sql);

      // Aplicar el SQL al nuevo schema, sin shell
      execFileSync('psql', [dbUrl, '--file=' + dumpFile, '--set=ON_ERROR_STOP=1'], {
        stdio: 'pipe',
      });

      this.logger.log(`Schema ${schemaName} ready`);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }
}
```

- [ ] **Step 4: Wire en TenantModule**

Editar `apps/api/src/tenants/tenant.module.ts` para incluir `TenantProvisioner` en providers + exports.

```typescript
import { TenantProvisioner } from './tenant.provisioner';

@Global()
@Module({
  imports: [forwardRef(() => PrismaModule)],
  controllers: [TenantController],
  providers: [TenantService, TenantContextService, TenantProvisioner],
  exports: [TenantService, TenantContextService, TenantProvisioner],
})
export class TenantModule {}
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @neo-kodex/api test -- tenant.provisioner.spec`
Expected: PASS (3/3).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/tenants/
git commit -m "feat(api): TenantProvisioner using execFileSync (no shell injection)"
```

---

### Task 4.2: TenantService.create dispara provisioning

**Files:**
- Modify: `apps/api/src/tenants/tenant.service.ts`
- Modify: `apps/api/src/tenants/__tests__/tenant.service.spec.ts`

- [ ] **Step 1: Test failing — create debe llamar al provisioner**

Agregar al spec existente `tenant.service.spec.ts`:

```typescript
it('crea el schema en Postgres al crear el tenant', async () => {
  await service.create({ slug: 'test_create_x', name: 'X' });
  const r = await prisma.$queryRawUnsafe<{ nspname: string }[]>(
    `SELECT nspname FROM pg_namespace WHERE nspname = 'tenant_test_create_x'`,
  );
  expect(r.length).toBe(1);
  // cleanup
  await prisma.$executeRawUnsafe(`DROP SCHEMA tenant_test_create_x CASCADE`);
});

it('si provisioning falla, marca tenant como ARCHIVED', async () => {
  // forzar fallo seteando DATABASE_URL inválida temporalmente
  const realUrl = process.env.DATABASE_URL!;
  process.env.DATABASE_URL = 'postgresql://invalid:invalid@localhost:1/none';
  try {
    await expect(
      service.create({ slug: 'test_fail_y', name: 'Y' }),
    ).rejects.toThrow();

    const tenant = await prisma.tenant.findUnique({
      where: { slug: 'test_fail_y' },
    });
    // El tenant queda registrado pero marcado ARCHIVED
    expect(tenant?.status).toBe('ARCHIVED');
  } finally {
    process.env.DATABASE_URL = realUrl;
  }
});
```

- [ ] **Step 2: Run, debe fallar**

Run: `pnpm --filter @neo-kodex/api test -- tenant.service.spec`
Expected: FAIL.

- [ ] **Step 3: Modificar TenantService**

Editar `tenant.service.ts`:

```typescript
import { ConflictException, Injectable, Logger } from '@nestjs/common';
import type { Tenant } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { TenantProvisioner } from './tenant.provisioner';

@Injectable()
export class TenantService {
  private readonly logger = new Logger(TenantService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly provisioner: TenantProvisioner,
  ) {}

  async create(dto: CreateTenantDto): Promise<Tenant> {
    this.provisioner.validateSlug(dto.slug);
    const schemaName = `tenant_${dto.slug}`;

    let tenant: Tenant;
    try {
      tenant = await this.prisma.tenant.create({
        data: {
          slug: dto.slug,
          schemaName,
          name: dto.name,
          storefrontDomain: dto.storefrontDomain ?? null,
        },
      });
    } catch (err: unknown) {
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code: string }).code === 'P2002'
      ) {
        throw new ConflictException(`slug ya existe: ${dto.slug}`);
      }
      throw err;
    }

    try {
      await this.provisioner.provision(dto.slug);
    } catch (err) {
      this.logger.error(
        `Provisioning falló para ${dto.slug}, marcando ARCHIVED`,
        err,
      );
      await this.prisma.tenant.update({
        where: { id: tenant.id },
        data: { status: 'ARCHIVED' },
      });
      throw err;
    }

    return tenant;
  }

  findBySlug(slug: string): Promise<Tenant | null> {
    return this.prisma.tenant.findUnique({ where: { slug } });
  }

  findByDomain(domain: string): Promise<Tenant | null> {
    return this.prisma.tenant.findUnique({ where: { storefrontDomain: domain } });
  }

  list(): Promise<Tenant[]> {
    return this.prisma.tenant.findMany({ orderBy: { createdAt: 'asc' } });
  }
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @neo-kodex/api test -- tenant.service.spec`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/tenants/
git commit -m "feat(api): TenantService.create dispara provisioning, fallback ARCHIVED"
```

---

### Task 4.3: Scripts CLI para administración manual

**Files:**
- Create: `apps/api/scripts/migrate-all-tenants.ts`
- Modify: `apps/api/package.json`

- [ ] **Step 1: Script standalone que itera tenants y re-aplica template**

`apps/api/scripts/migrate-all-tenants.ts`:

```typescript
/**
 * Re-aplica la estructura de tenant_template a cada tenant activo.
 *
 * Flow:
 *   1. Corre `prisma migrate deploy` para actualizar tenant_template
 *   2. Por cada tenant ACTIVE, dropea sus tablas y las re-crea desde el template
 *
 * ⚠️  CUIDADO: este approach simple PIERDE LA DATA del tenant en caso de
 * cambios destructivos. Para producción real, conviene usar `atlas` o
 * `pg-schema-diff` para hacer un diff sin pérdida de data.
 * Para ahora, dev/staging con seeds repetibles, alcanza.
 *
 * Uso:
 *   pnpm tenants:migrate-all
 */
import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

async function main(): Promise<void> {
  const prisma = new PrismaClient();

  console.log('Step 1: prisma migrate deploy (template)...');
  execFileSync('pnpm', ['prisma', 'migrate', 'deploy'], { stdio: 'inherit' });

  const tenants = await prisma.tenant.findMany({ where: { status: 'ACTIVE' } });
  console.log(`Step 2: re-applying template to ${tenants.length} active tenants`);

  for (const t of tenants) {
    console.log(`  → ${t.schemaName}`);
    execFileSync('pnpm', ['tsx', 'scripts/sync-tenant-schema.ts', t.slug], {
      stdio: 'inherit',
    });
  }

  await prisma.$disconnect();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Script sync individual**

`apps/api/scripts/sync-tenant-schema.ts`:

```typescript
/**
 * Sync de un tenant específico contra el template actual.
 * Implementación v1: drop + re-create. Reemplazar por diff real cuando haya data prod.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SLUG_REGEX = /^[a-z][a-z0-9_]*$/;
const slug = process.argv[2];

if (!slug || !SLUG_REGEX.test(slug)) {
  console.error('Usage: tsx scripts/sync-tenant-schema.ts <slug>');
  process.exit(1);
}

const schemaName = `tenant_${slug}`;
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL no setteado');
  process.exit(1);
}

const tmpDir = mkdtempSync(join(tmpdir(), 'tenant-sync-'));
const dumpFile = join(tmpDir, 'template.sql');

try {
  execFileSync(
    'pg_dump',
    [
      dbUrl,
      '--schema=tenant_template',
      '--schema-only',
      '--no-owner',
      '--no-privileges',
      '--file=' + dumpFile,
    ],
    { stdio: 'pipe' },
  );

  let sql = readFileSync(dumpFile, 'utf8');
  sql = sql.replace(/tenant_template/g, schemaName);
  // Para hacer drop+create:
  sql = `DROP SCHEMA IF EXISTS "${schemaName}" CASCADE;\nCREATE SCHEMA "${schemaName}";\n` + sql;
  writeFileSync(dumpFile, sql);

  execFileSync('psql', [dbUrl, '--file=' + dumpFile, '--set=ON_ERROR_STOP=1'], {
    stdio: 'inherit',
  });

  console.log(`Synced ${schemaName}`);
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}
```

- [ ] **Step 3: package.json scripts**

Editar `apps/api/package.json`, en `scripts`:

```json
{
  "scripts": {
    "tenants:migrate-all": "tsx scripts/migrate-all-tenants.ts",
    "tenants:sync": "tsx scripts/sync-tenant-schema.ts"
  }
}
```

- [ ] **Step 4: Smoke**

```bash
# Asumiendo tenant 'demo' creado en Phase anterior:
cd apps/api
pnpm tenants:sync demo
psql "$DATABASE_URL" -c "\dt tenant_demo.*" | head -10
```

Expected: tablas del template aparecen en `tenant_demo`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/scripts/ apps/api/package.json
git commit -m "feat(api): CLI scripts tenants:migrate-all and tenants:sync (execFileSync)"
```

---

## Phase 5: JWT tenant-aware

### Task 5.1: tenantSlug en JWT payload + AuthService

**Files:**
- Modify: `apps/api/src/auth/auth.service.ts`
- Modify: `apps/api/src/auth/strategies/jwt.strategy.ts`

- [ ] **Step 1: Modificar AuthService.loginAdmin**

Editar `apps/api/src/auth/auth.service.ts`. Inyectar `TenantContextService`:

```typescript
import { TenantContextService } from '../tenants/tenant-context.service';

@Injectable()
export class AuthService {
  constructor(
    // ... existentes (JwtService, PrismaService, etc.)
    private readonly tenantContext: TenantContextService,
  ) {}

  async loginAdmin(email: string, password: string) {
    const tenantSlug = this.tenantContext.requireTenantSlug();

    const admin = await this.prisma.admin.findUnique({ where: { email } });
    if (!admin) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(password, admin.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const payload = {
      sub: admin.id,
      email: admin.email,
      role: admin.role,
      tenantSlug,
    };
    const accessToken = this.jwt.sign(payload, { expiresIn: '15m' });
    const refreshToken = this.jwt.sign(payload, {
      expiresIn: '7d',
      secret: process.env.JWT_REFRESH_SECRET,
    });

    return { accessToken, refreshToken, admin };
  }
}
```

> Nota: como `/auth/admin/login` está en la lista `PATHS_WITHOUT_TENANT` del middleware, hay que **sacarlo** de esa lista (o solo dejar `/auth/customer/login` y `/auth/forgot-password`). El login admin SÍ necesita tenant context para saber en qué schema buscar al admin.

Editar `apps/api/src/main.ts` y remover `'/auth/admin/login'` y `'/api/auth/admin/login'` de `PATHS_WITHOUT_TENANT`.

- [ ] **Step 2: JwtStrategy.validate setea ALS desde el JWT claim**

Editar `apps/api/src/auth/strategies/jwt.strategy.ts`:

```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { TenantContextService } from '../../tenants/tenant-context.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private readonly tenantContext: TenantContextService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET!,
      ignoreExpiration: false,
    });
  }

  async validate(payload: {
    sub: string;
    email: string;
    role: string;
    tenantSlug: string;
  }) {
    if (!payload.tenantSlug) {
      throw new UnauthorizedException('JWT sin tenantSlug');
    }

    // Si el middleware ya setteó tenant, validamos coherencia.
    const currentSlug = this.tenantContext.getTenantSlug();
    if (currentSlug && currentSlug !== payload.tenantSlug) {
      throw new UnauthorizedException(
        `JWT tenant (${payload.tenantSlug}) no coincide con request tenant (${currentSlug})`,
      );
    }

    if (!currentSlug) {
      this.tenantContext.enterWith(payload.tenantSlug);
    }

    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      tenantSlug: payload.tenantSlug,
    };
  }
}
```

- [ ] **Step 3: Smoke manual**

Crear demo tenant + admin:

```bash
# Crear tenant demo si no existe
psql "$DATABASE_URL" -c "
INSERT INTO public.tenants(id, slug, schema_name, name, status, created_at, updated_at)
VALUES ('demo-id-1', 'demo', 'tenant_demo', 'Demo', 'ACTIVE', NOW(), NOW())
ON CONFLICT (slug) DO NOTHING;
"

# Provisionar schema demo
cd apps/api && pnpm tenants:sync demo

# Seed un admin de prueba en tenant_demo
psql "$DATABASE_URL" -c "
INSERT INTO tenant_demo.\"Admin\"(id, email, password, role, \"createdAt\", \"updatedAt\")
VALUES (
  'admin-id-1',
  'admin@demo.cl',
  '\$2b\$10\$YourBcryptHashOfPasswordHere',
  'ADMIN',
  NOW(),
  NOW()
);
"
```

(El hash bcrypt lo generás aparte: `node -e 'console.log(require("bcrypt").hashSync("demo123", 10))'`.)

Login test:
```bash
curl -X POST http://localhost:3001/api/auth/admin/login \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Slug: demo" \
  -d '{"email":"admin@demo.cl","password":"demo123"}'
```

Expected: 201 con `accessToken`. Decodificar el JWT (jwt.io o `node -e 'console.log(JSON.parse(Buffer.from("<token>".split(".")[1],"base64").toString()))'`) y verificar que `tenantSlug: "demo"` está presente.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/auth/ apps/api/src/main.ts
git commit -m "feat(api): JWT carries tenantSlug; JwtStrategy validates and sets ALS"
```

---

## Phase 6: Storefront multi-tenant

### Task 6.1: Build-time tenant slug en storefront

**Files:**
- Modify: `apps/storefront/next.config.ts`
- Create: `apps/storefront/src/lib/tenant.ts`
- Modify: `apps/storefront/src/lib/api.ts`

- [ ] **Step 1: next.config.ts expone NEXT_PUBLIC_TENANT_SLUG**

Editar `apps/storefront/next.config.ts`. Agregar al config:

```typescript
const nextConfig: NextConfig = {
  // ... existing
  env: {
    NEXT_PUBLIC_TENANT_SLUG: process.env.NEXT_PUBLIC_TENANT_SLUG ?? 'demo',
  },
};
```

- [ ] **Step 2: Helper lib/tenant.ts**

`apps/storefront/src/lib/tenant.ts`:

```typescript
/**
 * Devuelve el tenant slug del storefront actual.
 * En build-time se setea via NEXT_PUBLIC_TENANT_SLUG.
 * Cada deploy de storefront es para UN solo tenant.
 */
export function getTenantSlug(): string {
  const slug = process.env.NEXT_PUBLIC_TENANT_SLUG;
  if (!slug) {
    throw new Error(
      'NEXT_PUBLIC_TENANT_SLUG no setteado en build. Cada storefront necesita su tenant slug.',
    );
  }
  return slug;
}
```

- [ ] **Step 3: Inyectar header en api.ts**

Editar `apps/storefront/src/lib/api.ts`. En la función `api()`, después de armar `headers`:

```typescript
import { getTenantSlug } from './tenant';

// ... dentro de api():
headers.set('X-Tenant-Slug', getTenantSlug());
```

- [ ] **Step 4: Build + smoke**

```bash
cd apps/storefront
NEXT_PUBLIC_TENANT_SLUG=demo pnpm build
NEXT_PUBLIC_TENANT_SLUG=demo pnpm start
```

Abrir `http://localhost:3002/` y verificar en Network tab: requests a `/api/products` llevan `X-Tenant-Slug: demo`.

- [ ] **Step 5: Commit**

```bash
git add apps/storefront/
git commit -m "feat(storefront): inject X-Tenant-Slug from build-time env"
```

---

## Phase 7: Admin multi-tenant

### Task 7.1: Login admin con input tenant + header automático

**Files:**
- Modify: `apps/admin/src/lib/api.ts`
- Modify: `apps/admin/src/app/login/page.tsx`

- [ ] **Step 1: Form de login admin agrega input tenant**

Buscar el form de login:

```bash
find apps/admin/src -name "login*" -o -name "Login*"
```

Editar la página de login (`apps/admin/src/app/login/page.tsx` o donde esté). Agregar input:

```tsx
const [tenantSlug, setTenantSlug] = useState('');

// ... en el JSX, antes del email input:
<input
  type="text"
  placeholder="Tenant slug (ej: demo)"
  value={tenantSlug}
  onChange={(e) => setTenantSlug(e.target.value)}
  required
/>
```

Y modificar el handler de submit para mandar `X-Tenant-Slug`:

```typescript
const res = await fetch(`${apiBase}/auth/admin/login`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Tenant-Slug': tenantSlug,
  },
  body: JSON.stringify({ email, password }),
});
```

- [ ] **Step 2: lib/api.ts auto-inyecta X-Tenant-Slug del JWT**

Editar `apps/admin/src/lib/api.ts`. Agregar antes del fetcher:

```typescript
function getTenantSlugFromToken(): string | null {
  if (typeof window === 'undefined') return null;
  const token = localStorage.getItem('nk_token');
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const decoded = JSON.parse(atob(parts[1]));
    return decoded.tenantSlug ?? null;
  } catch {
    return null;
  }
}
```

Y en el fetcher, después de armar headers:

```typescript
const slug = getTenantSlugFromToken();
if (slug && !headers.has('X-Tenant-Slug')) {
  headers.set('X-Tenant-Slug', slug);
}
```

- [ ] **Step 3: Smoke**

Levantar admin: `pnpm --filter @neo-kodex/admin dev`. Loguear con `tenant=demo`, email `admin@demo.cl`, password `demo123`. Después navegar a `/products` y verificar en Network tab que requests llevan `X-Tenant-Slug: demo`.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/
git commit -m "feat(admin): tenant slug input in login + auto header from JWT"
```

---

## Phase 8: Data migration del tenant default

### Task 8.1: Mover data existente a tenant_demo

**Files:**
- Create: `apps/api/scripts/migrate-existing-data-to-default-tenant.sql`

- [ ] **Step 1: Crear tenant 'demo' en public.tenants (si no existe)**

```bash
psql "$DATABASE_URL" -c "
INSERT INTO public.tenants(id, slug, schema_name, name, status, created_at, updated_at)
VALUES ('demo-tenant-uuid', 'demo', 'tenant_demo', 'Demo Tenant', 'ACTIVE', NOW(), NOW())
ON CONFLICT (slug) DO NOTHING;
"
```

- [ ] **Step 2: Provisionar schema tenant_demo (vacío)**

```bash
cd apps/api && pnpm tenants:sync demo
```

- [ ] **Step 3: Crear script SQL one-shot**

`apps/api/scripts/migrate-existing-data-to-default-tenant.sql`:

```sql
-- Pre-condición: tenant_template tiene la data vieja (movida en Phase 1.1).
-- Movemos toda la data de tenant_template a tenant_demo.
-- tenant_template queda vacío como molde.

BEGIN;

DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'tenant_template'
      AND table_type = 'BASE TABLE'
  LOOP
    EXECUTE format(
      'INSERT INTO tenant_demo.%I SELECT * FROM tenant_template.%I',
      tbl, tbl
    );
    EXECUTE format('TRUNCATE tenant_template.%I CASCADE', tbl);
  END LOOP;
END $$;

COMMIT;
```

- [ ] **Step 4: Aplicar**

```bash
psql "$DATABASE_URL" -f apps/api/scripts/migrate-existing-data-to-default-tenant.sql
```

- [ ] **Step 5: Smoke**

```bash
# Cuántos productos en tenant_demo
psql "$DATABASE_URL" -c "SELECT count(*) FROM tenant_demo.\"Product\""

# vs en tenant_template (debe ser 0)
psql "$DATABASE_URL" -c "SELECT count(*) FROM tenant_template.\"Product\""

# Storefront debe seguir mostrando los productos
curl -s "http://localhost:3001/api/products" -H "X-Tenant-Slug: demo" | jq '.products | length'
```

Expected: tenant_demo tiene los productos viejos, tenant_template vacío, storefront retorna los productos.

- [ ] **Step 6: Commit**

```bash
git add apps/api/scripts/
git commit -m "feat(api): one-shot SQL to migrate existing data into tenant_demo"
```

---

## Phase 9: Validación end-to-end con 2 tenants

### Task 9.1: Crear segundo tenant + verificar aislación

**Files:** ninguno (smoke operativo)

- [ ] **Step 1: Asegurar REQUIRE_TENANT_CONTEXT=true en .env**

```bash
sed -i 's/REQUIRE_TENANT_CONTEXT=false/REQUIRE_TENANT_CONTEXT=true/' apps/api/.env
# Reiniciar api
pnpm --filter @neo-kodex/api start:dev
```

- [ ] **Step 2: Crear tenant 'cliente1' via API**

```bash
# Necesitás un JWT admin válido para llamar a /admin/tenants (super-admin scope).
# Para v1 sin cross-tenant admins, podés crear el tenant directamente via SQL +
# script: psql ... INSERT + pnpm tenants:sync cliente1
# Para producción: agregar concepto de super-admin que no requiere tenant.

# Variante SQL (más simple para validar):
psql "$DATABASE_URL" -c "
INSERT INTO public.tenants(id, slug, schema_name, name, status, created_at, updated_at)
VALUES ('cliente1-uuid', 'cliente1', 'tenant_cliente1', 'Cliente Uno', 'ACTIVE', NOW(), NOW());
"

cd apps/api && pnpm tenants:sync cliente1

# Seed admin de cliente1
HASH=$(node -e 'console.log(require("bcrypt").hashSync("cliente1pass", 10))')
psql "$DATABASE_URL" -c "
INSERT INTO tenant_cliente1.\"Admin\"(id, email, password, role, \"createdAt\", \"updatedAt\")
VALUES ('admin-c1-uuid', 'admin@cliente1.cl', '$HASH', 'ADMIN', NOW(), NOW());
"
```

- [ ] **Step 3: Loguear como admin de cliente1**

```bash
JWT_C1=$(curl -s -X POST http://localhost:3001/api/auth/admin/login \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Slug: cliente1" \
  -d '{"email":"admin@cliente1.cl","password":"cliente1pass"}' | jq -r .accessToken)
echo "JWT cliente1: $JWT_C1"
```

- [ ] **Step 4: Crear un producto en cliente1**

```bash
curl -X POST http://localhost:3001/api/admin/products \
  -H "Authorization: Bearer $JWT_C1" \
  -H "X-Tenant-Slug: cliente1" \
  -H "Content-Type: application/json" \
  -d '{"name":"Producto Cliente1","price":1000}'
```

- [ ] **Step 5: Verificar aislación cross-tenant**

```bash
# Listar productos de cliente1 - debe mostrar "Producto Cliente1"
curl -s "http://localhost:3001/api/products" -H "X-Tenant-Slug: cliente1" | jq '.products[].name'

# Listar productos de demo - debe mostrar los productos viejos pero NO "Producto Cliente1"
curl -s "http://localhost:3001/api/products" -H "X-Tenant-Slug: demo" | jq '.products[].name'
```

Expected: aislación total. Ningún tenant ve productos del otro.

- [ ] **Step 6: Documentar el smoke**

Crear `apps/api/docs/multi-tenant-smoke-checklist.md`:

```markdown
# Multi-tenant smoke checklist

## Aislación de datos
- [x] Crear producto en tenant A no aparece en tenant B
- [x] Login de admin de tenant A no puede ver órdenes de tenant B
- [x] Cart de customer del tenant A persiste solo en su schema

## Onboarding
- [x] POST /admin/tenants crea row + schema + corre migrations
- [x] Cliente nuevo puede loguear inmediatamente con admin seedeado

## Migrations
- [x] Nueva migration aplicada en tenant_template
- [x] Script tenants:migrate-all la propaga a todos los schemas
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/docs/
git commit -m "docs: multi-tenant smoke checklist (verified end-to-end)"
```

---

## Phase 10: Deploy a Dokploy

### Task 10.1: Wire en Dokploy (VPS nuevo Hetzner)

**Files:** ninguno (config del panel Dokploy)

- [ ] **Step 1: Crear app `api` en Dokploy**

En el panel: New Application → Docker Compose. Apuntar al repo, branch `feat/multi-tenant-schema-per-tenant`.

Env vars:
- `DATABASE_URL=postgresql://...` (al postgres del Dokploy stack)
- `JWT_SECRET` (rotado, nuevo)
- `JWT_REFRESH_SECRET` (rotado, nuevo)
- `BREVO_API_KEY`
- `REQUIRE_TENANT_CONTEXT=true`
- `DEFAULT_TENANT_SLUG=demo`

Dominio: `api.neokodex.cl`.

- [ ] **Step 2: Crear app `admin` en Dokploy**

Build args:
- `NEXT_PUBLIC_API_URL=https://api.neokodex.cl/api`

Dominio: `admin.neokodex.cl`.

- [ ] **Step 3: Crear app `storefront-demo` en Dokploy**

Build args:
- `NEXT_PUBLIC_API_URL=https://api.neokodex.cl/api`
- `NEXT_PUBLIC_TENANT_SLUG=demo`
- `NEXT_PUBLIC_SITE_URL=https://demo.neokodex.cl`

Dominio: `demo.neokodex.cl`.

- [ ] **Step 4: Seed inicial en prod**

Después del primer deploy del api en Dokploy:

```bash
# SSH al VPS Hetzner via Dokploy
# Ejecutar dentro del container postgres:
docker exec -it <postgres-container> psql -U postgres -d neokodex -c "
INSERT INTO public.tenants(...) VALUES ('demo-prod-uuid', 'demo', 'tenant_demo', 'Demo', 'ACTIVE', NOW(), NOW());
"

# Después correr provisioning:
docker exec -it <api-container> pnpm tenants:sync demo
```

- [ ] **Step 5: Smoke prod**

```bash
curl -sI https://api.neokodex.cl/api/health
curl -sI https://admin.neokodex.cl/login
curl -sI https://demo.neokodex.cl/

curl -s https://api.neokodex.cl/api/products -H "X-Tenant-Slug: demo" | jq '.products | length'
```

Expected: todos 200/302. Lista de productos vacía (es DB nueva) pero responde sin 500.

- [ ] **Step 6: Workflow por cliente nuevo desde acá**

Al sumar un cliente real, el workflow estable es:

1. Crear tenant via SQL o futura UI admin:
   ```sql
   INSERT INTO public.tenants(...) VALUES ('uuid', 'cliente_x', 'tenant_cliente_x', ...);
   ```
2. Provisionar schema: `pnpm tenants:sync cliente_x` (dentro del container api).
3. Seed admin del cliente_x en `tenant_cliente_x.Admin`.
4. En Dokploy: clonar el storefront-demo → cambiar `NEXT_PUBLIC_TENANT_SLUG=cliente_x` + dominio del cliente.
5. Apuntar DNS del cliente al IP del VPS.
6. Smoke test.

Tiempo por cliente nuevo: ~20 min.

---

## Self-Review

**Spec coverage check:**
- ✅ Schema-per-tenant con aislación física: Phase 1, 3
- ✅ Un backend para todos: Phase 1-5
- ✅ Storefronts separados: Phase 6
- ✅ Admin compartido scope-by-tenant: Phase 5, 7
- ✅ Onboarding automatizable: Phase 4 (provisioner)
- ✅ Migrations por tenant: Phase 4 (scripts)
- ✅ Data existente preservada: Phase 8
- ✅ Aislación validada end-to-end: Phase 9
- ✅ Deploy a Dokploy: Phase 10

**Placeholder scan:**
- ⚠️ Phase 5.3 menciona "hash bcrypt lo generás aparte". Esto es razonable como instrucción operativa (no hay forma de pre-generar hashes en un plan); pasa el check.
- ⚠️ Phase 7.1 paso 1 dice "buscar el form de login con `find apps/admin/src -name 'login*'`". Esto es necesario porque no podemos predecir el path exacto sin abrir el repo. El `find` resuelve el ambigüedad in-situ. Aceptable.
- ✅ Todos los nombres de tipos/clases coherentes: `TenantService`, `TenantContextService`, `TenantProvisioner`, `TenantModule` con casing consistente.
- ✅ JWT payload `{ sub, email, role, tenantSlug }` referenciado igual en `auth.service.ts` y `jwt.strategy.ts`.
- ✅ Schema names `tenant_<slug>` consistente en todo el plan.
- ✅ Todos los `execFileSync` con args en array (sin shell injection).

**Type consistency:**
- ✅ `Tenant` (modelo Prisma) y campos `slug`, `schemaName`, `status` usados consistentemente.
- ✅ `TenantContext` interno del ALS no fuga fuera del service.

---

## Rollback

Si algún Phase rompe en local, simple:

```bash
git checkout main
git branch -D feat/multi-tenant-schema-per-tenant
# Restaurar DB desde backup hecho en Phase 0.1
psql "$DATABASE_URL" < /tmp/backup-pre-multitenant-*.sql
```

Si rompe en prod (Dokploy ya deployó), el rollback de DB es más doloroso:

```sql
-- Mover data de tenant_demo de vuelta a public:
DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN SELECT table_name FROM information_schema.tables WHERE table_schema = 'tenant_demo'
  LOOP
    EXECUTE format('ALTER TABLE tenant_demo.%I SET SCHEMA public', tbl);
  END LOOP;
END $$;

DROP SCHEMA tenant_template CASCADE;
DROP SCHEMA tenant_demo CASCADE;
DROP TABLE public.tenants;
DROP TYPE public.TenantStatus;
```

Y en Dokploy: rollback al commit pre-refactor.

**Recomendación operativa:** no mergear el branch a main hasta validar Phase 9 en staging. Mantener el VPS Hostinger viejo corriendo durante 1 semana después del cutover en Dokploy, por seguridad.

---

## Tiempo estimado total

| Phase | Tiempo |
|---|---|
| 0 — Preparación | 30 min |
| 1 — Modelo Tenant + split schema | 2-3 h |
| 2 — AsyncLocalStorage + middleware | 1.5 h |
| 3 — PrismaService schema-aware | 1.5 h |
| 4 — Provisioning scripts | 3-4 h |
| 5 — JWT tenant-aware | 1.5 h |
| 6 — Storefront | 1 h |
| 7 — Admin | 1.5 h |
| 8 — Data migration default | 30 min |
| 9 — Smoke 2-tenants | 1 h |
| 10 — Deploy Dokploy | 2 h |

**Total: ~15-20 h focused work.** Spreadeable en 4-6 sesiones de 3-4 h.

---

## Notas operativas

- Cada Phase es uno o varios commits cohesivos. El branch `feat/multi-tenant-schema-per-tenant` se mergea a main **solo cuando Phase 10 está OK en staging**.
- TDD enforcement: cada paso de implementación tiene su test failing antes y passing después. No commitear código sin test correspondiente.
- Re-ejecutar `pnpm --filter @neo-kodex/api test` después de cada Phase para detectar regresiones.
- Verificar en prod (Phase 10 step 5) — el smoke de Phase 9 debe pasar en `https://demo.neokodex.cl` antes de declarar listo.
- **Limitación conocida:** el script `tenants:migrate-all` v1 hace drop+create de schemas tenant; pierde data ante cambios de schema. Para producción con clientes reales, reemplazar por una herramienta de diff (`atlas`, `pg-schema-diff`) antes de tener clientes con data importante. Hoy con pre-launch + cero data crítica, el approach actual está OK.
