# Marco 1 — Cerrar base para uso interno de agencia

> **Meta:** dejar la base como **plataforma operativa para instanciar N clientes de agencia**. Modelo de negocio: uso interno propio (no producto público, no se vende como tal). Para cada cliente: 1 instancia con admin sólido + storefront Next.js custom hecho por el dueño (no por terceros).
>
> **Estado:** pendiente (revisión 2026-05-19 post-clarificación de modelo de negocio).

---

## Modelo de negocio (lente que define prioridades)

- **No hay terceros consumiendo la API.** El user (agencia) construye los fronts custom de cada cliente. NO se planea ecosistema de integradores externos.
- **Cada cliente = 1 instancia separada.** Bootstrap rápido por cliente es central al workflow.
- **Los clientes son admins activos.** Usan el dashboard, no consumen la API. UX del admin es producto, no afterthought.
- **Sin asunción de vertical/mercado/currency** — la base sirve cualquier rubro (ver [[feedback_base_estandar]]).
- **Sin plugin architecture** — features se agregan editando código directamente (ver [[feedback_no_plugins]]).

---

## Estado actual (completado a 2026-05-19)

✅ Fases 0–6 + post-MVP (importador WC, scripts one-off órdenes)
✅ Sub-proyecto A "API speaks protocol" — DEPLOYADO
✅ Sub-proyecto B-async "Headless integrations: async jobs + webhooks" — DEPLOYADO

---

## Scope del Marco 1 (re-priorizado para uso interno de agencia)

### 1. Idempotency keys (parte de B-auth original)

**Estimación:** ~2-3h / mitad de 1 sesión.
**Prioridad:** ALTA — protege checkout/pagos de doble-submit. Bug class real en cada cliente concreto.

**Componentes:**
- Modelo Prisma `IdempotencyKey` (key, requestHash, response, statusCode, createdAt)
- Interceptor que lee `Idempotency-Key` header en `POST /api/v1/orders/checkout` y `POST /api/v1/payments/*`
- Si key existe + hash matches → retorna respuesta cacheada
- Si hash difiere → 422 conflict
- TTL configurable (default 24h), cleanup cron

**Decisiones pre-brainstorming:**
- Hash de body completo o partial?
- Response cache: completo (body+status+headers) o solo body+status?

**Dependencias:** ninguna.

---

### 2. Tests del core dominio (sub-proyecto C)

**Estimación:** ~6-8h / 1-2 sesiones.
**Prioridad:** ALTA — confianza al evolucionar la base con N clientes en prod. Sin esto, cada cambio en main es jugar a la lotería.

**Componentes:**
- **Tests del checkout** con race conditions: stock atomicidad, cupón maxUses race, order number generation concurrente.
- **Tests del webhook delivery** con retry: 5xx → backoff correcto, 4xx → failedAt sin retry, idempotency receptor.
- **Tests del idempotency middleware** (depende del item 1).
- **Tests de refunds** y status transitions con stock restore.
- **CI ampliado** con coverage reporting (vitest --coverage); target inicial 70% en módulos críticos.

**Decisiones pre-brainstorming:**
- Coverage threshold (¿70% módulos críticos solo o 80% global?).
- Mock vs Postgres real (consistente con setup actual: Postgres real para integration).

**Dependencias:** idempotency (item 1).

---

### 3. Search & discovery (sub-proyecto D)

**Estimación:** ~4h / 1 sesión.
**Prioridad:** ALTA — cualquier catálogo > 30 SKUs lo necesita. Mejora UX storefront directamente.

**Componentes:**
- **Full-text search** en productos con Postgres `tsvector`: column `searchVector` GENERATED ALWAYS AS + index GIN.
- Endpoint `GET /api/v1/products?q=<query>` con ranking ts_rank.
- **Filtros expresivos en PLP**: priceRange (min/max), multi-atributo (color=red,blue + talla=M), inStock=true, sort por precio/novedad.
- **Cursor pagination** para listas grandes (orders admin, audit log, deliveries).

**Decisiones pre-brainstorming:**
- Idioma del FTS (config español default vs multi-language config).
- Si full-text Postgres es suficiente o conviene Meili/Typesense desde el inicio (probable: Postgres alcanza para volumen esperado).

**Dependencias:** ninguna técnica.

---

### 4. Bootstrap script "nuevo cliente" 🆕

**Estimación:** ~3-4h / 1 sesión.
**Prioridad:** ALTA — central al workflow de agencia. Instanciar un cliente debe ser 1 comando, no 30 min de pasos manuales.

**Componentes:**
- Script `scripts/bootstrap-client.sh <client-slug>`:
  - Genera secrets nuevos (JWT_SECRET, REFRESH_SECRET, MINIO credentials, POSTGRES_PASSWORD)
  - Crea aplicación en Coolify via API (POST `/applications/public` con el compose template, basado en patrón del PR cliente 1)
  - Set de env vars vía Coolify API
  - Trigger primer deploy
  - Output: URLs sslip provisorias + credenciales admin iniciales
- Template de `docker-compose.client.yml` parametrizable (variables Coolify-magic + secrets via env)
- Doc: `docs/clients/bootstrap.md` con el flujo end-to-end

**Decisiones pre-brainstorming:**
- ¿Crear cliente con DB completamente fresh (migrations + seed) o restaurar de un snapshot template?
- ¿Subdominio por cliente o sslip.io provisorio + DNS manual después?
- Branding inicial (logo, store name): por seed config o post-deploy en /admin?

**Dependencias:** ninguna técnica. Se beneficia de Sub-A ya deployado (los nuevos clientes tienen observabilidad de entrada).

---

### 5. Providers reales

**Estimación:** ~6-12h total, depende cuántos. Cada uno ~1-2h.
**Prioridad:** ALTA — cada cliente concreto necesita pagos/DTE/shipping reales.

Implementaciones reales de los providers ya abstraídos (strategy pattern interno, no plugins):

| Categoría | Providers | Por uno |
|---|---|---|
| **Payments** | MercadoPago, Flow, Khipu (Webpay ya está) | ~1-2h |
| **DTE (Chile)** | Openfactura, Haulmer | ~1-2h |
| **Shipping** | Chilexpress, Starken | ~1-2h |
| **Email** | Resend (Brevo ya está) | ~1h |

**Decisiones pre-brainstorming:**
- ¿Implementar todos los 8 o solo los del primer cliente concreto?
- ¿Cada provider necesita UI admin para configurar API keys o solo env vars?
- ¿Sandbox vs prod credentials per provider?

**Dependencias:** ninguna técnica. Se beneficia de UI admin de Settings (item 6).

---

### 6. Audit log UI navegable + Reportes admin 🆕

**Estimación:** ~4-5h / 1-2 sesiones.
**Prioridad:** MEDIA-ALTA — tus clientes son admins activos. El modelo `AuditLog` ya existe en schema pero sin UI navegable; los reportes básicos ya están en `DashboardModule` pero limitados.

**Componentes:**
- **Audit log UI** (`/admin/audit-log`): tabla paginada con filtros (admin, action, dateRange), JSON viewer expandible para metadata, exportable a CSV.
- **Reportes ampliados** en `/admin/dashboard` o nueva ruta `/admin/reports`:
  - Sales por período (día/semana/mes)
  - Top N productos vendidos
  - Low stock alert (variantes < N stock)
  - Customer cohort básico (nuevos vs returning últimos 30d)
  - Orders por status (pie chart)
- **Stock alerts notification** (email a admin cuando variant baja de umbral configurable).

**Decisiones pre-brainstorming:**
- Charts library (recharts vs chart.js vs algo más simple? actualmente no hay).
- Estos reportes corren on-demand o se cachean en una tabla materializada?

**Dependencias:** ninguna técnica.

---

## Orden sugerido de ejecución

```
1. Idempotency keys     (~2-3h)   → protege checkout/pagos
2. C tests core         (~6-8h)   → confianza al evolucionar con N clientes
3. D search + filtros   (~4h)     → mejora UX storefront sin tocar prod
4. Bootstrap script     (~3-4h)   → desbloquea workflow de agencia
5. Providers reales     (~6-12h)  → empezar por los del primer cliente concreto
6. Audit UI + reportes  (~4-5h)   → admin pulido para clientes activos
```

**Razones del orden:**
- Idempotency primero porque es bug class real + chico + no bloquea nada.
- Tests segundo porque desbloquea evolucionar sin miedo.
- Search tercero porque es independiente y aporta valor visible al storefront sin tocar prod.
- Bootstrap script cuarto porque después de eso, instanciar clientes es rápido.
- Providers después de bootstrap porque cada cliente nuevo va a necesitar configurar los suyos.
- Audit/reportes último porque es polish del admin, no bloquea ningún cliente arrancar.

---

## Total estimado

| Bloque | Esfuerzo | Sesiones (3-4h c/u) |
|---|---|---|
| 1. Idempotency | 2-3h | 0.5-1 |
| 2. C tests core | 6-8h | 1.5-2 |
| 3. D search | 4h | 1 |
| 4. Bootstrap script | 3-4h | 1 |
| 5. Providers reales (4-8 de ellos) | 6-12h | 2-3 |
| 6. Audit + reportes | 4-5h | 1-2 |
| **TOTAL** | **25-36h** | **7-10 sesiones** |

Con contingencias (debugging deploy, fixes durante implementación — patrón observado): **×1.3-1.5 = 32-54h reales / 8-13 sesiones**.

---

## Out of scope de Marco 1

### Movido a "futuro cuando aparezca demanda"
- **API keys server-to-server con scopes**: solo tiene sentido si un cliente concreto pide que un ERP/CRM externo le consuma la API. Si pasa, se hace en ese momento. Mientras tanto, admin con JWT alcanza.

### Descartado del scope (no aplica al modelo de negocio)
- **SDK cliente TypeScript** (`packages/sdk`): vos escribís cada front custom directamente con fetch o un helper interno por cliente. No se necesita SDK formal.
- **Auto-deploy webhook GitHub-Coolify**: nice-to-have, no bloqueante. Se activa cuando vos quieras vía Coolify UI.

### Backlog futuro (sin compromiso de Marco 1)
- Returns/RMAs (flujo devoluciones con stock restock)
- Refunds parciales
- Inventory multi-bodega (stock_locations)
- Promotions engine sofisticado (BOGO, free-shipping condicional)
- Multi-currency, multi-region tax
- B2B features (customer groups, price lists)
- Subscriptions / recurring orders
- Gift cards

Estos NO están descartados — pueden volver si un cliente concreto los pide. Pero no son meta de Marco 1.

---

## Cómo retomar este Marco

Cuando vuelvas a una sesión y quieras seguir:
1. Decime **"arrancamos con idempotency"** (o el item que prefieras).
2. Yo invoco `superpowers:brainstorming` → cierra scope + decisiones técnicas → escribe spec.
3. Invoco `superpowers:writing-plans` → plan ejecutable.
4. Invoco `superpowers:subagent-driven-development` → implementación con review per task.
5. Cuando todos los PRs están listos, cascade merge + deploy con cleanup periódico (`docker system prune`) para evitar OOM.

Pattern aprendido en sub-A y sub-B-async funciona bien — replicar.
