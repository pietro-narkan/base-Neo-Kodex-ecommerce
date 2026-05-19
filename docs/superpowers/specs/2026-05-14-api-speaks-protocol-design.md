# API Speaks Protocol — Design Spec

**Status:** Draft → Pending user approval
**Date:** 2026-05-14
**Sub-project:** A (de 4) del roadmap headless de Neo-Kodex
**Author/Owner:** pietro (decisiones), Claude Code (drafting)

## Contexto

Neo-Kodex es una base ecommerce **headless** reutilizable (API NestJS + admin Next.js como producto core; storefront Next.js es front de referencia acoplable). Para que sea verdaderamente headless tiene que ser **documentada**, **predecible** y **observada**. Hoy le faltan las tres cosas:

- No hay OpenAPI/Swagger. Un dev externo que quiera acoplar su front lee código.
- No hay versionado. Cualquier breaking change futuro rompe consumers silenciosamente.
- Logs son `console.log` style del Logger nativo NestJS; sin estructura, sin redaction de PII, sin request ID.
- Errores tienen shape inconsistente (mezcla de strings y objetos según el module).
- No hay error tracking en runtime — un crash en prod pasa desapercibido.
- No hay health endpoints para que el orchestrator (Coolify) tome decisiones de restart.

Este spec resuelve las 6 piezas en un único ciclo de mejora.

## Goals

1. La API expone su contrato vía **OpenAPI 3.0 navegable** (`/api/docs` UI + `/api/docs-json` JSON), público en prod.
2. Todas las rutas viven bajo `/api/v1/...`. Versionado URI estándar.
3. Logs son **JSON estructurados** (pino) con request ID + redaction de credenciales/PII.
4. Errores tienen shape **uniforme** `{ error: { code, message, details?, requestId } }` con códigos catalogados en módulos críticos (auth/payments/checkout/coupons).
5. Errores runtime se capturan en **Sentry** (con DSN configurable; off si no hay DSN).
6. `/health` (liveness) + `/health/ready` (readiness con DB + MinIO) operativos.

## Non-goals (explícitos)

- No incluye webhooks salientes (sub-proyecto B).
- No incluye API keys server-to-server (sub-proyecto B).
- No incluye idempotency keys (sub-proyecto B).
- No incluye cola de jobs (sub-proyecto B).
- No incluye búsqueda full-text ni filtros expresivos (sub-proyecto D).
- No incluye tests del core dominio (sub-proyecto C).
- No incluye SDK cliente TS (backlog post-A/B/C/D).
- No migra códigos específicos en módulos no-críticos (catalog, media, settings, etc.) — esos quedan con códigos HTTP genéricos hasta que se toquen.

## Decisiones cerradas (de brainstorming)

| # | Decisión | Razón |
|---|---|---|
| Alcance | Las 6 piezas en un único spec, 3 PRs | Coherente; ratio valor/riesgo óptimo |
| Versionado | `/api/v1` prefijo en TODAS las rutas | Estándar Stripe/Shopify; consistencia día 1 |
| OpenAPI | Público en prod | Producto headless; devs externos lo necesitan |
| Error tracking | Sentry SDK con DSN configurable | Compatible Sentry.io + GlitchTip self-hosted |
| Errores tipados | Filter global + códigos específicos en módulos críticos | Balance shape consistente / refactor acotado |
| Health | `/health` liveness + `/health/ready` readiness | Mínimo viable para orchestrators |
| Logging | `nestjs-pino` reemplaza Logger nativo | Estándar NestJS+Fastify; request logging + redaction |
| Implementation | Approach 1: observability-first en 3 PRs | Bajo riesgo; observability protege cambios siguientes |

## Arquitectura

Tres packs independientes, ejecutables en orden, cada uno como PR autocontenido:

```
PR1 (Pack A: Observability)        PR2 (Pack B: Error Shape)       PR3 (Pack C: Contract)
─────────────────────────────      ─────────────────────────       ──────────────────────────
• nestjs-pino + redaction          • GlobalHttpExceptionFilter     • app.enableVersioning URI
• AsyncLocalStorage requestId      • AppException class            • SwaggerModule setup
• Sentry SDK (DSN opcional)        • Error codes catalog           • @ApiTags/@ApiOperation
• HealthModule                     • Migración throws críticos     • DTOs anotados
                                                                   • Storefront/Admin update URLs
```

### Pack A — Observability (PR1)

**Componentes:**

1. **`nestjs-pino`** registrado en `AppModule`:
   - Reemplaza `Logger` nativo NestJS (`app.useLogger(app.get(Logger))`).
   - Plugin Fastify para request logging automático (método, url, status, latency).
   - Pretty print en dev (`pino-pretty`), JSON en prod (gobernado por `LOG_PRETTY` env var).
   - Nivel configurable por `LOG_LEVEL` env var (default `info`).
   - Redaction declarativa para:
     ```
     req.headers.authorization
     req.headers.cookie
     req.body.password
     req.body.passwordConfirm
     req.body.token
     req.body.refreshToken
     req.body.rut
     *.creditCard
     *.cvv
     ```

2. **Request ID middleware** (`apps/api/src/common/request-id.middleware.ts`):
   - Genera UUID v4 por request (o reusa `X-Request-Id` header si llega).
   - Lo pone en `AsyncLocalStorage` (`apps/api/src/common/request-context.ts`).
   - Lo agrega a cada log line vía pino `genReqId`.
   - Lo emite en response header `X-Request-Id` para que el cliente lo conserve para soporte.

3. **Sentry SDK** (`@sentry/node` + `@sentry/nestjs`):
   - Inicializado en `main.ts` ANTES de `NestFactory.create()` (requerimiento del SDK).
   - Solo se inicializa si `SENTRY_DSN` está definido y no vacío.
   - Captura uncaught exceptions + unhandled promise rejections (default del SDK).
   - Tags por request: `requestId`, `userId` si autenticado, `userType` (admin/customer).
   - `tracesSampleRate` configurable; default 0.1.
   - Integration con Exception Filter (definido en Pack B); en Pack A solo se inicializa.

4. **HealthModule** (`apps/api/src/health/`):
   - `GET /health` (liveness): retorna `{ status: 'ok', uptime: <seconds> }` con 200. NO toca DB ni MinIO. Coolify lo usa para detectar proceso vivo.
   - `GET /health/ready` (readiness):
     ```typescript
     async ready() {
       const checks = await Promise.allSettled([
         this.prisma.$queryRaw`SELECT 1`,
         this.storage.client.bucketExists(this.storage.bucket),
       ]);
       // retorna 200 con detalle si todas pasan; 503 con detalle si alguna falla
     }
     ```
   - Sin auth (anotados con `@Public()`).

### Pack B — Error Shape (PR2)

**Componentes:**

1. **`AppException`** (`apps/api/src/common/errors/app-exception.ts`):
   ```typescript
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

2. **Codes catalog** (`apps/api/src/common/errors/codes.ts`):
   ```typescript
   export const ErrorCodes = {
     // Auth
     AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
     AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
     AUTH_TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
     AUTH_FORBIDDEN: 'AUTH_FORBIDDEN',
     PASSWORD_TOO_WEAK: 'PASSWORD_TOO_WEAK',
     PASSWORD_RESET_TOKEN_INVALID: 'PASSWORD_RESET_TOKEN_INVALID',
     // Payments
     PAYMENT_INIT_FAILED: 'PAYMENT_INIT_FAILED',
     PAYMENT_VERIFY_FAILED: 'PAYMENT_VERIFY_FAILED',
     PAYMENT_REFUND_FAILED: 'PAYMENT_REFUND_FAILED',
     PAYMENT_PROVIDER_UNAVAILABLE: 'PAYMENT_PROVIDER_UNAVAILABLE',
     // Checkout / Orders
     STOCK_INSUFFICIENT: 'STOCK_INSUFFICIENT',
     CART_EMPTY: 'CART_EMPTY',
     CART_NOT_FOUND: 'CART_NOT_FOUND',
     INVALID_SHIPPING_REGION: 'INVALID_SHIPPING_REGION',
     ORDER_NOT_FOUND: 'ORDER_NOT_FOUND',
     // Coupons
     COUPON_INVALID: 'COUPON_INVALID',
     COUPON_EXPIRED: 'COUPON_EXPIRED',
     COUPON_MAX_USES_REACHED: 'COUPON_MAX_USES_REACHED',
     COUPON_MIN_AMOUNT_NOT_MET: 'COUPON_MIN_AMOUNT_NOT_MET',
     COUPON_INACTIVE: 'COUPON_INACTIVE',
   } as const;

   export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];
   ```

3. **`GlobalHttpExceptionFilter`** (`apps/api/src/common/errors/global-exception.filter.ts`):
   - Registrado vía `app.useGlobalFilters(new GlobalHttpExceptionFilter())` en `main.ts`.
   - Maneja:
     - `AppException` → usa `code`/`message`/`details` directos.
     - `HttpException` (NestJS estándar) → mapea HTTP status a código genérico (`BAD_REQUEST`, `NOT_FOUND`, etc.).
     - `PrismaClientKnownRequestError` → mapea códigos Prisma (`P2002` unique constraint → `RESOURCE_CONFLICT`, `P2025` not found → `RESOURCE_NOT_FOUND`, etc.).
     - `Error` genérico → `INTERNAL_ERROR`, status 500.
   - Shape de response:
     ```json
     {
       "error": {
         "code": "COUPON_EXPIRED",
         "message": "Cupón vencido",
         "details": { "code": "BIENVENIDA10", "expiredAt": "2026-04-01T00:00:00Z" },
         "requestId": "abc-123-def"
       }
     }
     ```
   - Side effects:
     - Loggea con pino al nivel apropiado (`warn` para 4xx, `error` para 5xx).
     - Captura con `Sentry.captureException(err, { tags: { requestId, code } })` para 5xx siempre; para 4xx solo si `SENTRY_CAPTURE_4XX=true` (default `false`).
     - En prod (`NODE_ENV=production`), NO incluye `stack` en details. En dev, sí.

4. **Migración de throws en módulos críticos:**
   - `apps/api/src/auth/*` → reemplazar `throw new UnauthorizedException(...)` por `throw new AppException(ErrorCodes.AUTH_INVALID_CREDENTIALS, '...', 401)`.
   - `apps/api/src/payments/*` → códigos `PAYMENT_*`.
   - `apps/api/src/orders/*` (checkout, status transitions) → `STOCK_INSUFFICIENT`, `CART_EMPTY`, etc.
   - `apps/api/src/coupons/*` → `COUPON_*`.
   - Resto de módulos (products, categories, attributes, media, settings, customers, admins, shipping, import, reviews, emails, audit, analytics, dashboard, providers, seo, storage): quedan con `HttpException` estándar y el filter les asigna código genérico. Migración incremental futura.

5. **Updates en storefront + admin:**
   - `apps/storefront/lib/api.ts` y `apps/admin/lib/api.ts`: la `ApiError` class actualiza para parsear shape nuevo `{ error: { code, message, details, requestId } }` en lugar del shape mezclado actual.
   - Componentes que muestran errores específicos (login, checkout, coupon apply) pueden ramificar por `error.code` para mostrar mensajes localizados.

### Pack C — Contract (PR3)

**Componentes:**

1. **Versionado URI** en `main.ts`:
   ```typescript
   app.setGlobalPrefix('api');
   app.enableVersioning({
     type: VersioningType.URI,
     defaultVersion: '1',
     prefix: 'v',
   });
   ```
   Resultado: todas las rutas viven bajo `/api/v1/<resource>`.

2. **Controllers actualizados** — los `@Controller('admin/orders')` pasan a `@Controller({ path: 'admin/orders', version: '1' })`. Quitar prefijos hardcoded de strings de rutas; usar la convention NestJS.

3. **Swagger setup** (`apps/api/src/main.ts`):
   ```typescript
   const config = new DocumentBuilder()
     .setTitle('Neo-Kodex Ecommerce API')
     .setDescription('Headless ecommerce platform API')
     .setVersion('1.0')
     .addBearerAuth()
     .addServer('/', 'Current host')
     .build();
   const document = SwaggerModule.createDocument(app, config);
   SwaggerModule.setup('api/docs', app, document, {
     jsonDocumentUrl: 'api/docs-json',
   });
   ```

4. **Anotaciones en controllers:**
   - `@ApiTags('Auth')` por controller (agrupa en UI).
   - `@ApiOperation({ summary: '...' })` por endpoint.
   - `@ApiResponse({ status: 200, type: ResponseDto })` para success.
   - `@ApiResponse({ status: 400, schema: ErrorSchema })` para errores comunes.
   - `@ApiBearerAuth()` en endpoints protegidos.
   - DTOs anotados con `@ApiProperty({ description, example })` solo donde class-validator no alcanza (descripción human-readable, ejemplos).
   - **Activar nestjs-cli plugin** (`@nestjs/swagger/plugin`) en `nest-cli.json` para auto-anotar properties basadas en class-validator decorators. Reduce boilerplate; estándar en proyectos NestJS+Swagger.

5. **Updates de clients:**
   - **Decisión**: `NEXT_PUBLIC_API_URL` se mantiene como hoy (`http://host:3001/api`); los fetches cambian para incluir `/v1/` como primer segmento de path. Ej.: `${API_URL}/v1/auth/admin/login` en lugar de `${API_URL}/auth/admin/login`. Razón: env var ya está set en Coolify y en `.env.example`; cambiarla rompe inadvertidamente. El path versioning queda explícito en cada call.
   - `apps/storefront/lib/api.ts` y `apps/admin/lib/api.ts`: actualizar la helper `api()` para prefijar `/v1` a los paths recibidos.
   - Actualizar todos los `fetch('/api/...')` directos (ej. `MediaManager` en admin que llama a `/admin/media`) a `/api/v1/...`.
   - Actualizar tests e2e (`apps/api/test/*.e2e-spec.ts`) a las nuevas URLs `/api/v1/...`.

6. **README.md** — agregar sección "API Reference: `http://<host>/api/docs`".

## Data flow (ejemplo: checkout con cupón expirado)

```
1. POST /api/v1/orders/checkout llega a Fastify
2. Request ID middleware genera UUID `abc-123` y lo pone en AsyncLocalStorage
3. nestjs-pino loggea: { level: info, msg: "request", method: "POST", url: "/api/v1/orders/checkout", requestId: "abc-123" }
4. JwtAuthGuard (Optional) → Controller → OrdersService.checkout → CouponsService.validateAndCalculate
5. CouponsService detecta validUntil < now → throw new AppException(
     ErrorCodes.COUPON_EXPIRED,
     "Cupón vencido",
     400,
     { code: "BIENVENIDA10", expiredAt: "2026-04-01T00:00:00Z" }
   )
6. GlobalHttpExceptionFilter captura:
   - pino loggea: { level: warn, msg: "request failed", code: "COUPON_EXPIRED", requestId: "abc-123" }
   - Sentry NO captura (es 4xx y el flag opt-in está off)
   - response 400 JSON:
     {
       "error": {
         "code": "COUPON_EXPIRED",
         "message": "Cupón vencido",
         "details": { "code": "BIENVENIDA10", "expiredAt": "2026-04-01T00:00:00Z" },
         "requestId": "abc-123"
       }
     }
   - response header X-Request-Id: abc-123
7. Storefront recibe, parsea error.code, muestra mensaje localizado al usuario.
```

## Testing strategy

**PR1 (Observability):**
- Smoke test: `GET /health` retorna 200 con `{status: "ok", uptime}`.
- Smoke test: `GET /health/ready` retorna 200 con detalle de db+storage cuando ambos OK.
- Smoke test: `GET /health/ready` retorna 503 con detalle cuando DB caída (simulado).
- Unit test: request ID middleware genera UUID si no hay header; reusa si hay `X-Request-Id`.
- Unit test: AsyncLocalStorage propaga requestId entre layers (controller → service → log).
- Manual validation post-deploy: Sentry recibe error de prueba; Coolify probe usa `/health/ready`.

**PR2 (Error shape):**
- Unit test del filter: cada tipo de exception se normaliza al shape esperado.
- Unit test: AppException con código específico se preserva intacto.
- Unit test: PrismaClientKnownRequestError `P2025` → 404 con `RESOURCE_NOT_FOUND`.
- E2E test: `POST /api/v1/orders/checkout` con cupón expirado retorna shape `{ error: { code: "COUPON_EXPIRED", ... } }`.
- E2E test: `POST /api/v1/auth/admin/login` con creds inválidas → `AUTH_INVALID_CREDENTIALS`.
- Update tests existentes para esperar nuevo shape.

**PR3 (Contract):**
- Smoke test: `GET /api/docs-json` retorna OpenAPI 3.x válido (parseable con `openapi3-ts`).
- Smoke test: `GET /api/docs` sirve HTML.
- E2E test: rutas `/api/v1/*` funcionan; rutas sin prefijo retornan 404.
- Update todos los tests e2e existentes a URLs `/api/v1/*`.
- Manual: navegar Swagger UI, probar endpoints autenticados con bearer token.

## Configuration / env vars nuevas

```bash
# Logging
LOG_LEVEL=info           # trace|debug|info|warn|error|fatal
LOG_PRETTY=false         # true en dev (.env.local) para pino-pretty

# Sentry (off si SENTRY_DSN vacío)
SENTRY_DSN=
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.1
SENTRY_RELEASE=          # opcional, ej. commit SHA inyectado en build
SENTRY_CAPTURE_4XX=false # true para enviar 4xx también (útil debug)
```

Actualizar `.env.example` y `docker-compose.prod.yml` para listar las nuevas vars.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| PR2 cambia shape de error → storefront/admin que parseen el shape viejo dejan de funcionar | Actualizar ambos clients en el mismo PR2. Sin retrocompat (proyecto pre-launch). |
| PR3 mueve TODAS las rutas a `/api/v1` → tests e2e + storefront + admin rompen | Actualizar todo en el mismo PR3. Sin alias de compat. |
| Swagger UI público en prod expone superficie de API | Aceptado como decisión de producto headless. Rate-limit existente (100/min global) protege contra abuso. |
| Sentry DSN expuesto en logs por error | El DSN va por env var; no se loggea. SDK loggea `[Sentry] Initialized` sin DSN. |
| pino redaction insuficiente — escape de PII | Listado de redaction paths revisable; tests con payloads con password deben validar que no aparece en logs. |
| Migración de throws en módulos críticos rompe tests existentes | Tests e2e validan response status, no shape. Actualizar tests al nuevo shape en el mismo PR. |
| Lag entre PR1 y PR2 — período donde Sentry recibe errores con shape viejo | Aceptable; PR2 viene inmediatamente después. Sentry agrupa por `exception.type` no por shape. |

## Migration order

```
1. Branch feat/observability ──── PR1 ──── merge → deploy
   ↓ validar Sentry recibe + Coolify probe usa /health/ready
2. Branch feat/error-shape ────── PR2 ──── merge → deploy
   ↓ validar Sentry recibe errores normalizados, storefront/admin OK
3. Branch feat/api-v1-openapi ─── PR3 ──── merge → deploy
   ↓ validar /api/docs accesible, storefront/admin funcionan
```

Cada PR es un deploy de Coolify independiente; el auto-deploy webhook lo dispara al merge a `main`. Si un PR falla en prod, el siguiente espera hasta resolver.

## Open questions (resueltas durante brainstorming)

Ninguna. Todas las decisiones están en el cuadro "Decisiones cerradas" arriba.

## Out of scope para este spec — backlog post-A

- API keys server-to-server, webhooks salientes, idempotency keys, cola de jobs → **Sub-proyecto B**
- Tests del core dominio (checkout race conditions, etc.) → **Sub-proyecto C**
- Búsqueda full-text + filtros expresivos → **Sub-proyecto D**
- Códigos específicos en módulos no-críticos (products, media, settings, etc.) → migración incremental futura
- SDK cliente TypeScript → backlog post-A/B/C/D
- Refunds parciales, tax engine extensible, providers reales (MercadoPago/Flow/Khipu/Openfactura/Haulmer/Chilexpress) → backlog

---

**Siguiente paso post-aprobación de este spec:** invocar skill `superpowers:writing-plans` para armar el plan de implementación detallado (tareas, archivos a tocar, orden de commits, criterios de done).
