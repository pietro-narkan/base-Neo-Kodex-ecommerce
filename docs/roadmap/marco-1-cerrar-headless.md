# Marco 1 — Cerrar roadmap headless

> **Meta:** dejar la base como **plataforma ecommerce headless completa**, vendible a clientes B2C/B2B chicos sin asumir vertical/mercado/currency específico.
>
> **Estado:** pendiente (creado 2026-05-19, post deploy de sub-A + sub-B-async).

---

## Estado actual (completado a 2026-05-19)

✅ Fases 0–6 + post-MVP (importador WC, scripts one-off órdenes)
✅ Sub-proyecto A "API speaks protocol" — DEPLOYADO
  - OpenAPI público `/api/docs` + JSON `/api/docs-json`
  - Versionado URI `/api/v1`
  - Observabilidad: pino estructurado + redaction + Sentry SDK + health endpoints
  - Error shape uniforme `{error:{code,message,details,requestId}}` + códigos catalogados
✅ Sub-proyecto B-async "Headless integrations: async jobs + webhooks" — DEPLOYADO
  - Cola pg-boss 10.x (Postgres-backed, sin Redis)
  - Webhooks salientes HMAC-SHA256 + timestamp + retry 8x48h
  - 5 eventos de orden (`order.created/paid/fulfilled/cancelled/refunded`)
  - Admin UI: CRUD + secret rotation + test send + delivery logs
  - Cleanup cron 30d

---

## Scope pendiente del Marco 1

### Sub-proyecto B-auth — "API keys + idempotency"

**Estimación:** ~4h / 1 sesión.

**Componentes:**
- **API keys server-to-server** con scopes:
  - Modelo Prisma `ApiKey` (id, name, hashedKey, scopes[], createdAt, lastUsedAt, expiresAt, active)
  - Guard/strategy que reconoce header `X-Api-Key` o `Authorization: Bearer <key>`
  - Scopes granulares: `orders:read`, `orders:write`, `products:read`, etc.
  - Admin UI: generar (key visible una sola vez), revocar, ver scopes/lastUsed
- **Idempotency keys** en endpoints críticos:
  - Modelo `IdempotencyKey` (key, requestHash, response, statusCode, createdAt)
  - Interceptor que lee `Idempotency-Key` header en `POST /api/v1/orders/checkout` y `POST /api/v1/payments/*`
  - Si key existe + hash matches → retorna respuesta cacheada
  - Si hash difiere → 422 conflict
  - TTL configurable (default 24h)

**Decisiones pre-brainstorming:**
- Hash de keys: bcrypt o argon2? (probable bcrypt para consistencia con passwords del proyecto)
- Scopes: enum cerrado en código o sistema más flexible? (probable enum cerrado)
- Idempotency response cache: completo (body+status) o solo status? (probable completo)

**Dependencias:** ninguna (independiente de B-async).

---

### Sub-proyecto C — "Core trust" (tests del dominio crítico)

**Estimación:** ~6-8h / 1-2 sesiones.

**Componentes:**
- **Tests del checkout** con race conditions:
  - Stock atomicidad (mismo variant comprado por 2 carritos concurrentes)
  - Cupón `maxUses` race (N carritos aplican un cupón con maxUses=1 simultáneo)
  - Order number generation no duplica con concurrencia
- **Tests del webhook delivery** con retry:
  - Failure 5xx programa retry con backoff correcto
  - 4xx no retry, marca failedAt
  - Idempotency del receptor via X-NK-Event-Id
- **Tests del idempotency middleware** (depende de B-auth)
- **Tests de refunds** (status transitions, stock restore)
- **CI ampliado** con coverage reporting (vitest --coverage)

**Decisiones pre-brainstorming:**
- Coverage threshold (¿80%? ¿solo módulos críticos?)
- Tests E2E vs unit ratio
- Integration tests usan Postgres real o mocks? (consistente con setup actual: Postgres real)

**Dependencias:** B-auth (idempotency tests).

---

### Sub-proyecto D — "Search & discovery"

**Estimación:** ~4h / 1 sesión.

**Componentes:**
- **Full-text search** en productos con Postgres `tsvector`:
  - Migration: agrega `searchVector` GENERATED ALWAYS AS column en Product
  - Index GIN sobre el vector
  - Endpoint `GET /api/v1/products?q=<query>` con ranking
- **Filtros expresivos en PLP**:
  - `priceRange` (min, max)
  - Multi-atributo (color=red,blue + talla=M)
  - `inStock=true` (variant con stock > 0)
  - Sort: precio asc/desc, novedad, popularidad
- **Cursor pagination** para listas grandes (orders admin, audit log)

**Decisiones pre-brainstorming:**
- Idioma del FTS (spanish o multi-language config)
- Sinónimos / stemming
- Si rinde con tsvector solo o conviene Meili/Typesense desde el inicio

**Dependencias:** ninguna técnica (puede ir antes o después de B-auth).

---

### Backlog: Providers reales

**Estimación:** ~6-12h total, depende cuántos. Cada uno ~1-2h.

Implementaciones reales de los providers ya abstraídos (strategy pattern interno, no plugins):

| Categoría | Providers | Estimado por uno |
|---|---|---|
| **Payments** | MercadoPago, Flow, Khipu | ~1-2h cada |
| **DTE (Chile)** | Openfactura, Haulmer | ~1-2h cada |
| **Shipping** | Chilexpress, Starken | ~1-2h cada |
| **Email** | Resend (Brevo ya está) | ~1h |

**Decisiones pre-brainstorming:**
- ¿Implementar todos los 8 o solo los del primer cliente?
- ¿Sandbox vs prod credentials per provider?
- ¿Cada provider necesita UI admin para configurar API keys o solo env vars?

**Dependencias:** ninguna técnica; benefician de B-auth (admin UI para activar/configurar).

---

## Orden sugerido de ejecución

```
1. B-auth          (4h)    → desbloquea idempotency tests + UI activation de providers
2. C (parcial)     (3h)    → tests críticos del core: checkout, webhooks, idempotency
3. D               (4h)    → search + filtros (mejora UX storefront sin esperar)
4. Providers       (6-12h) → empezar por los más urgentes según primer cliente
5. C (resto)       (3-5h)  → tests cross-cutting, coverage targets, e2e ampliado
```

**Razones del orden:**
- B-auth primero porque desbloquea tests de C (idempotency) y UI de providers
- D temprano porque es independiente y aporta valor visible al storefront sin tocar prod
- Providers después de B-auth para que el admin UI de configuración tenga API keys protection
- C cierra el ciclo: cuando tenemos todas las features, locked-in con tests del dominio

---

## Total estimado

| Bloque | Esfuerzo | Sesiones (3-4h c/u) |
|---|---|---|
| B-auth | 4h | 1 |
| C (tests core) | 6-8h | 1-2 |
| D (search) | 4h | 1 |
| Providers reales (4-8 de ellos) | 6-12h | 2-3 |
| **TOTAL** | **20-28h** | **5-7 sesiones** |

Con contingencias (debugging deploy, fixes durante implementación — patrón observado en sesiones anteriores): **×1.3-1.5 = 26-42h reales / 7-10 sesiones**.

---

## Decisiones pendientes pre-brainstorming (cuando arranquemos cada sub-proyecto)

Cada sub-proyecto se brainstorm/spec/implementa por separado siguiendo el patrón establecido en sub-A y sub-B-async:
1. `superpowers:brainstorming` para confirmar scope + decisiones
2. `superpowers:writing-plans` para plan ejecutable
3. `superpowers:subagent-driven-development` para implementación

---

## Out of scope de Marco 1 (a futuro)

Lo siguiente NO entra en Marco 1, va al backlog post-cierre:

- Returns/RMAs (flujo devoluciones con stock restock)
- Inventory multi-bodega (stock_locations)
- Promotions engine sofisticado (BOGO, free-shipping condicional)
- Multi-currency, multi-region tax
- B2B features (customer groups, price lists)
- Subscriptions / recurring orders
- Gift cards
- SDK cliente TypeScript (`packages/sdk`)
- Refunds parciales

Estos NO están descartados — pueden volver al backlog si un cliente concreto los pide. Pero no son meta de Marco 1 (que apunta a "plataforma headless completa para B2C/B2B chicos vendibles").

---

## Cómo retomar este Marco

Cuando vuelvas a una sesión y quieras seguir:
1. Decime "arrancamos con B-auth" (o el sub-proyecto que prefieras).
2. Yo invoco `superpowers:brainstorming` → cierra scope + decisiones técnicas → escribe spec.
3. Invoco `superpowers:writing-plans` → plan ejecutable.
4. Invoco `superpowers:subagent-driven-development` → implementación con review per task.
5. Cuando todos los PRs están listos, cascade merge + deploy (con `docker system prune` periódico para evitar OOM como aprendimos en sub-B-async).
