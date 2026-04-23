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

# Reset completo de la DB (borra todo)
pnpm --filter @neo-kodex/api prisma:reset

# Typecheck todo el monorepo
pnpm typecheck

# Formatear con prettier
pnpm format

# Apagar contenedores
docker compose down

# Apagar y borrar volumenes (cuidado: borra data)
docker compose down -v
```

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

El Dockerfile del API tiene un **prune stage** que ahorra ~900 MB por versión vs copiar todo el `node_modules` del build:

```dockerfile
FROM base AS prune
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/*/package.json ./apps/*/
COPY packages/*/package.json ./packages/*/
RUN pnpm install --prod --frozen-lockfile --filter "@neo-kodex/api..."
COPY apps/api/prisma ./apps/api/prisma
RUN pnpm --filter @neo-kodex/api exec prisma generate

FROM node:22-alpine AS runner
COPY --from=prune /app/node_modules ./node_modules
COPY --from=prune /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
CMD ["node", "dist/src/main.js"]
```

> **Gotcha**: `prisma migrate deploy` en runtime requiere que el CLI `prisma` esté en `dependencies` (no en `devDependencies`). El entry point es `dist/src/main.js` (no `dist/main.js`) porque el `tsconfig.json` usa `rootDir: "./"`.

## Decisiones técnicas

- **Precios en CLP como `Int`** (sin decimales) para evitar errores de redondeo.
- **Campos DTE** (boleta/factura SII Chile) presentes en el schema con Strategy pattern (`DteProvider`); integración real con OpenFactura/Haulmer cuando se vaya a producción real.
- **Pagos y email** con Strategy pattern (`PaymentProvider`, `EmailProvider`, `ShippingProvider`); defaults: `manual` (transferencia), `console` (email dev), `flat` (envío tarifa plana). Reemplazar con env var + nueva clase = cero refactor.
- **Schema estándar ecommerce** no rubro-específico. El sistema de atributos flexible (`Attribute` + `AttributeValue`) cubre cualquier rubro.
- **Single-tenant** por ahora. Meta futura: multi-instance (mismo repo, varios deploys con env vars distintas).
- **IVA 19%** via `Setting store.tax_rate_bp` (basis points); modificable runtime desde admin.
- **Cart guest + customer**: header `X-Cart-Session` para guest, JWT para customer; merge al login.
- **Stock reserva atómica** en checkout via `updateMany` con `stock: { gte: qty }` dentro de la transacción.

## Estado del proyecto

Todas las fases del MVP completas:

- [x] **Fase 0** — Monorepo + Prisma schema + Docker dev + seeds
- [x] **Fase 1** — API core: auth, productos, variantes, categorías, media (MinIO), atributos
- [x] **Fase 2** — Comercio: carrito (guest+customer), órdenes transaccionales, stock atómico, cupones
- [x] **Fase 3** — Strategy pattern: Payment (manual) / Email (console) / DTE (mock) / Shipping (flat)
- [x] **Fase 4** — Admin UI: login, dashboard, CRUDs de productos/categorías/atributos/cupones/órdenes
- [x] **Fase 5** — Storefront: home, PLP, PDP, carrito, checkout guest/registrado
- [x] **Fase 6** — Deploy Coolify: Docker Compose + auto-deploy vía webhook GitHub
- [x] **Extra** — Importador masivo de productos (CSV WooCommerce) con wizard de mapeo
- [x] **Extra** — Script one-off de importación de órdenes históricas
