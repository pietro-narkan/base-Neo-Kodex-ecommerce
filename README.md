# Neo-Kodex Ecommerce

Base ecommerce headless reutilizable para clientes en Chile. Monorepo con NestJS (API), Next.js (admin + storefront), Prisma + Postgres, MinIO (media), Docker + Coolify para deploy.

## Stack

- **API**: NestJS 10 + Fastify + Prisma 5
- **Admin**: Next.js 15 (App Router) + Tailwind + UI shadcn-style (sin Radix)
- **Storefront**: Next.js 15 (App Router) + Tailwind
- **DB**: PostgreSQL 16
- **Storage**: MinIO (S3-compatible, self-hosted)
- **Monorepo**: pnpm workspaces
- **Deploy**: Docker Compose + Coolify
- **CI**: GitHub Actions (typecheck + tests)

## Requisitos

- Node.js >= 22 (recomendado Volta)
- pnpm 9.15 (`volta install pnpm@9.15.0`)
- Docker + Docker Compose

## Setup inicial

```bash
# 1. Instalar dependencias del monorepo
pnpm install

# 2. Copiar archivos .env
cp apps/api/.env.example apps/api/.env
cp apps/admin/.env.example apps/admin/.env.local
cp apps/storefront/.env.example apps/storefront/.env.local

# 3. Levantar Postgres + MinIO
docker compose up -d

# 4. Generar Prisma client, correr migraciones y seed
pnpm --filter @neo-kodex/api prisma:generate
pnpm --filter @neo-kodex/api prisma:migrate
pnpm --filter @neo-kodex/api prisma:seed

# 5. Levantar todo en paralelo (api + admin + storefront)
pnpm -r --parallel dev
```

## Servicios locales

| Servicio | URL | Credenciales |
|---|---|---|
| API | http://localhost:3001/api | — |
| Admin | http://localhost:3000 | ver seed |
| Storefront | http://localhost:3002 | — |
| Postgres | localhost:5433 | user/pass/db: `neokodex` |
| MinIO API | http://localhost:9000 | `minioadmin` / `minioadmin` |
| MinIO Console | http://localhost:9001 | `minioadmin` / `minioadmin` |

> Postgres corre en **5433** (no 5432) para no chocar con otros proyectos en la misma máquina.

## Credenciales iniciales (post-seed)

- **Admin**: `admin@neo-kodex.local` / `changeme123` — **cambiar en producción**
- **Coupon de ejemplo**: `BIENVENIDA10` (10% OFF, 100 usos)

## Estructura del monorepo

```
neo-kodex-ecommerce/
├── apps/
│   ├── api/        # NestJS + Fastify + Prisma
│   ├── admin/      # Next.js admin panel
│   └── storefront/ # Next.js tienda publica
├── packages/
│   ├── types/      # Tipos + Zod compartidos
│   └── config/     # Constantes (CLP, IVA, Settings keys)
├── docker-compose.yml          # Desarrollo local
├── docker-compose.prod.yml     # Producción (Coolify)
└── pnpm-workspace.yaml
```

## Scripts útiles

```bash
# Prisma Studio (GUI de la DB)
pnpm --filter @neo-kodex/api prisma:studio

# Tests de la API (Vitest + supertest)
pnpm --filter @neo-kodex/api test

# Typecheck todo el monorepo
pnpm typecheck

# Formatear con prettier
pnpm format

# Reset completo de la DB (borra todo)
pnpm --filter @neo-kodex/api prisma:reset

# Apagar contenedores
docker compose down

# Apagar y borrar volumenes (cuidado: borra data)
docker compose down -v
```

## Features implementadas

### Core ecommerce
- **Catálogo**: productos con `status` (DRAFT/ACTIVE/ARCHIVED) + soft delete (`deletedAt`), variantes con atributos flexibles, categorías en árbol, media en MinIO
- **Precios**: CLP como `Int`. Precio regular + `compareAtPrice` (tachado) + **sale price programado** (`saleStartAt`/`saleEndAt`) que activa automáticamente una oferta en un rango de fechas
- **Carrito**: guest (header `X-Cart-Session`) + customer (JWT), merge al login, cupones con fechas + usos máximos
- **Checkout**: reserva atómica de stock (`updateMany` con `stock: { gte: qty }`), órdenes transaccionales con `orderNumber` incremental `NK-YYYY-XXXXXX`
- **Órdenes**: búsqueda (email/nombre/número), filtros por fecha, export CSV, edición inline de cantidad/dirección, remove item con restauración de stock
- **Shipping por región**: tabla `ShippingRate` con las 16 regiones de Chile, costo + umbral free shipping por región, fallback a tarifa plana global
- **Emails transaccionales**: orden recibida, pago confirmado, orden despachada, cancelada, reembolsada, bienvenida cliente, alerta admin nueva orden, reset password. Provider actual: `console` (loggea); setup de Brevo es 1 clase nueva cuando haya dominio
- **DTE (boleta/factura SII)**: interfaz + mock. Integración real con OpenFactura/Haulmer diferida

### Admin panel (`/admin`)
- **Multi-admin con roles**: ADMIN (super) + CATALOG_MANAGER + ORDERS_MANAGER + VIEWER. Nav condicional según rol. Guard re-consulta DB en cada request → role stale no grants privilegios
- **Audit log**: toda mutation sensible loggeada con actor + before/after + metadata; filtros por entity + rango de fechas
- **Dashboard**: ventas hoy/7d/30d, pendientes de pago/envío, stock bajo (<5), top 5 productos del mes, customers nuevos, últimas 10 órdenes
- **Customers**: lista con buscador + filtro guest/registrado, detalle con LTV + historial de compras + direcciones
- **Settings**: página editable con todos los `Setting` agrupados por tabs (Tienda, Impuestos, Envíos, Pagos, Emails)
- **Envíos**: tabla editable de las 16 regiones con tarifas + free threshold + ETA
- **Órdenes**: timeline de actividad (audit log + notas) + notas internas/públicas por orden
- **Password reset flow**: "olvidé mi contraseña" manda link con token hasheado (TTL 60min, anti-enumeration)
- **Importador masivo** de productos (ver sección abajo)

### Seguridad
- **Rate limiting**: 10 intentos / 15min en `/auth/*` + 100/min global (por IP)
- **Password policy**: zxcvbn score ≥ 2 (rechaza `password`, `12345678`, patrones comunes)
- **CSP estricta** en admin + storefront con allowlist dinámico (API + MinIO)
- **Security headers**: X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
- **SSRF guard** en importer de productos (bloquea IPs privadas)
- **Helmet** + CORS con whitelist

### Testing + CI
- **15 tests** (Vitest + supertest): checkout atómico, order numbers únicos, stock reservation, guest/customer flows, auth login (éxito/falla), password reset, refresh tokens, password policy
- **GitHub Actions**: typecheck + tests en cada push/PR
- **Dependabot**: chequeo semanal de CVEs en deps + GitHub actions

## Importar productos masivamente

Disponible en admin → **Productos → Importar productos**. Acepta exports CSV de WooCommerce (formato estándar) y se auto-detectan los headers. Soporta hasta ~5.000 productos por archivo.

**Wizard de 3 pasos**:

1. **Subir CSV** — upload del archivo.
2. **Asignar columnas** — tabla con columna CSV + ejemplo de la primera fila a la izquierda, dropdown del campo Neo-Kodex a la derecha. Si el CSV es WooCommerce, los mappings vienen pre-asignados. Toggle "Precios incluyen IVA" (default ON).
3. **Importar** — progress en vivo + reporte con creados/actualizados/fallidos y CSV descargable de errores.

**Features**:

- Upsert por SKU (crea o actualiza; idempotente en re-imports).
- Árbol de categorías padre/hijo creado on-the-fly (`"Estar > Baúl"` → crea Estar + Baúl con relación).
- Descarga paralela de imágenes (máx 6 simultáneas, timeout 30s, guard SSRF) → sube a MinIO.
- Idempotencia de imágenes por `Media.sourceUrl` (no re-descarga en re-imports).
- Extracción de IVA del precio con `Setting store.tax_rate_bp`.
- HTML → texto limpio en descripciones (strippea `<p data-start=…>`, decode entities, bullets `● `).

**Tipos soportados**: `simple`. Los tipos `variable` / `variation` se loggean como warning sin importar (pendiente).

## Importar órdenes históricas (script one-off)

Script para migrar órdenes desde una tienda WooCommerce existente. No expuesto como endpoint — se corre manualmente.

```bash
# Local
cd apps/api
pnpm tsx prisma/scripts/import-wc-orders.ts /ruta/al/orders-export.csv

# Producción (dentro del container API)
docker cp orders.csv <api-container>:/tmp/orders.csv
docker exec <api-container> sh -c \
  'cd /app/apps/api && npx -y tsx@4.19.2 prisma/scripts/import-wc-orders.ts /tmp/orders.csv'
```

**Comportamiento**:

- Agrupa filas por `Número de pedido` (WC exporta una fila por item).
- Preserva el número original del WC (ej: `1787`) — distinguible de números nuevos (`NK-YYYY-XXXXXX`).
- Upsert de customer por email como `isGuest=true`.
- Crea billing + shipping `Address` con `region: "Sin especificar"` (CSV WC no trae región).
- Mapea status: Completado→FULFILLED, Procesando→PAID, En espera/Pendiente de pago→PENDING.
- Mapea payment: Webpay→`webpay`, Transferencia→`manual`.
- Items sin SKU → placeholder único `no-sku-<slug>-<orderNum>`.
- Linkea `variantId` del OrderItem si ya existe un Variant con el mismo SKU en DB (si no, snapshot).
- Idempotente: re-runs con el mismo CSV skipean órdenes existentes.

## Deploy en Coolify

Deploy funcionando en VPS Hostinger con Coolify + URLs provisorias sslip.io.

**Arquitectura**:

- **Application** tipo Docker Compose (endpoint `POST /api/v1/applications/public`)
- Build pack `dockercompose`, apunta a `/docker-compose.prod.yml`
- Coolify expone **magic vars** para cada service con puerto declarado:
  - `SERVICE_URL_<NAME>` — URL con protocolo (ej: `http://api-abc.sslip.io`)
  - `SERVICE_FQDN_<NAME>` — FQDN sin protocolo
  - **Sin sufijo de puerto** (`SERVICE_URL_API`, NO `SERVICE_URL_API_3001`)
- Env vars (secretos) vía `POST /api/v1/applications/{uuid}/envs` — campos válidos: `{key, value, is_preview, is_literal}`. `is_build_time` NO es válido; los build-args se infieren automáticamente del `build.args` del compose.
- Auto-deploy vía webhook GitHub: `http://<coolify-host>:8000/webhooks/source/github/events/manual` con shared secret.

**Imagen API slim (457 MB)**:

El Dockerfile del API tiene un **prune stage** que ahorra ~900 MB por versión vs copiar todo el `node_modules` del build. Prisma CLI movido de `devDependencies` a `dependencies` para que `prisma migrate deploy` funcione en runtime. Entry point `dist/src/main.js` (no `dist/main.js`) por `tsconfig rootDir: "./"`.

## Decisiones técnicas

- **Precios en CLP como `Int`** (sin decimales) para evitar errores de redondeo
- **Strategy pattern** en providers (`PaymentProvider`, `EmailProvider`, `DteProvider`, `ShippingProvider`): agregar nueva integración = 1 clase + 1 case en switch + env var, cero refactor
- **Schema estándar ecommerce** no rubro-específico. Sistema de atributos flexible cubre cualquier rubro
- **Single-tenant** por ahora. Meta futura: multi-instance (mismo repo, varios deploys)
- **IVA 19%** via `Setting store.tax_rate_bp` (basis points); modificable runtime desde admin
- **Stock reserva atómica** en checkout con `updateMany` + condición stock dentro de la transacción
- **Soft delete** en Product (`deletedAt`) para preservar referencias históricas de OrderItem

---

## Pendientes pre-producción real

Cuando se vaya a vender con clientes reales, estos items son obligatorios. Están **diferidos conscientemente** mientras se sigue iterando en desarrollo.

### Bloqueantes legales (Chile)

- [ ] **DTE real (boleta/factura)** — integrar con OpenFactura o Haulmer. Hoy es mock. Sin esto no se puede vender legalmente en Chile (SII exige documentos electrónicos)
- [ ] **Términos y condiciones + política de privacidad + política de devoluciones** — páginas estáticas obligatorias por Ley 19.628 y Ley del Consumidor. Derecho a retracto 10 días en ecommerce
- [ ] **Contacto + RUT de la empresa** visibles en footer — obligatorio

### Bloqueantes funcionales

- [ ] **Medio de pago real** — integrar Webpay Plus, MercadoPago, Flow o Khipu. Hoy solo transferencia manual
- [ ] **Email provider real** — conectar Brevo (preferido por el usuario; ver `memory/project_email_provider_brevo.md`). Hoy los emails se loggean pero no se envían
- [ ] **Dominio real + SSL** — comprar `.cl` (~$9k/año en NIC.cl), apuntar DNS al VPS, Coolify activa Let's Encrypt automático. Requerido para `crypto.randomUUID` en storefront y para no espantar clientes con "Not Secure"

### Hardening operacional

- [ ] **Cambiar password admin** cada vez que se monte un cliente nuevo (hoy `changeme123` en dev — local está cambiado)
- [ ] **Rotar SSH key + Coolify token** que están en `/tmp/nk-deploy/` y en history de sesiones Claude
- [ ] **Backups diarios de Postgres** — cron con `pg_dump` → Backblaze B2 ó rclone a Google Drive (costo <$1/mes)
- [ ] **UptimeRobot** (alertas si el sitio cae, free tier 5min interval)
- [ ] **Sentry** (error tracking backend + frontend, free tier 5k/mes)
- [ ] **2FA para admin** (TOTP, 1-2 días de implementación)
- [ ] **Alertas de stock bajo** (cuando un Variant cruza threshold, email al admin)
- [ ] **Auto-deploy via webhook GitHub** — configurado, pero requiere GitHub App instalada (pendiente) para soportar repo privado

### Nice-to-have

- [ ] **Repo privado** + GitHub App de Coolify instalada (hoy público por conveniencia)
- [ ] **OpenAPI/Swagger docs** del API — genera desde anotaciones Nest, 2-4 hs
- [ ] **Bulk actions en productos** (batch delete, cambiar status, cambiar categoría) — ya en progreso
- [ ] **Papelera con auto-delete** después de N días (en progreso)
- [ ] **Variable products** en el importador (hoy solo `simple`)
- [ ] **Template CSV propio** para el importador (reemplaza/complementa el de WC)

## Estado del proyecto

**MVP completo + hardening significativo**:

- [x] Monorepo + schema + Docker dev + seeds
- [x] API core: auth (+ password reset + roles 4 niveles + audit log), productos, variantes, categorías, media, atributos
- [x] Comercio: carrito guest/customer, órdenes atómicas, stock concurrente-safe, cupones
- [x] Strategy pattern: Payment / Email / DTE / Shipping con providers default
- [x] Admin UI: dashboard real, CRUDs, users, audit log, settings, customers, shipping, orders con timeline+notas, edit order
- [x] Storefront: home, PLP, PDP, carrito, checkout guest/registrado
- [x] Deploy Coolify con auto-deploy + Dockerfile slim (457MB API)
- [x] Importador masivo de productos con wizard de mapeo + HTML cleanup
- [x] Script one-off de órdenes históricas
- [x] Emails transaccionales (7 templates)
- [x] Rate limiting + password policy zxcvbn + CSP + security headers + Dependabot
- [x] Tests (15) + CI (GitHub Actions con Postgres service)
