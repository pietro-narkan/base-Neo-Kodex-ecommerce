# Neo-Kodex Ecommerce

Base ecommerce headless reutilizable para clientes en Chile. Monorepo con NestJS (API), Next.js (admin + storefront), Prisma + Postgres, MinIO (media), Docker + Coolify para deploy.

## Stack

- **API**: NestJS 10 + Fastify + Prisma 5 + Vitest
- **Admin**: Next.js 15 (App Router) + Tailwind + UI shadcn-style (sin Radix)
- **Storefront**: Next.js 15 (App Router) + Tailwind + SEO nativo (sitemap, JSON-LD, OG)
- **DB**: PostgreSQL 16
- **Storage**: MinIO (S3-compatible, self-hosted) + Sharp on-upload (resize/WebP/EXIF strip)
- **Monorepo**: pnpm workspaces
- **Deploy**: Docker Compose + Coolify (auto-deploy via webhook GitHub)
- **CI**: GitHub Actions (typecheck + tests) + Dependabot

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

### Catálogo
- **Productos** con `status` (DRAFT/ACTIVE/ARCHIVED) + soft delete (`deletedAt`)
  - **Papelera** con auto-delete diario (`@nestjs/schedule` cron 3am, retención default 30 días, configurable desde settings; 0 deshabilita)
  - **Restauración** desde papelera + botón "Eliminar permanentemente" + "Vaciar papelera"
  - **Bulk actions**: cambio de status en batch + soft delete en batch + restore en batch
- **Variantes** con atributos flexibles (Color, Talla, etc.) + stock + SKU único
- **Categorías en árbol** (self-referential) con cycle detection multi-nivel. Subcategorías hasta N niveles. UI muestra jerarquía con indentación.
- **Media en MinIO** con **Sharp on-upload**: resize max 2000px, conversión a WebP q85 (~60% ahorro), strip EXIF, preservar GIF animados

### Precios
- **CLP como `Int`** (sin decimales) para evitar errores de redondeo
- **Precio regular** + `compareAtPrice` (tachado)
- **Sale prices programadas**: `salePriceNet/Gross` + `saleStartAt/EndAt`. Activan automáticamente una oferta en un rango de fechas. Helper `isOnSale(variant, now)` se usa en cart, checkout, OrderItem snapshot y JSON-LD del storefront
- **IVA 19%** via `Setting store.tax_rate_bp` (basis points); modificable runtime desde admin

### Comercio
- **Carrito** guest (header `X-Cart-Session`) + customer (JWT), merge al login
- **Cupones** con fechas + usos máximos + código único
- **Checkout** con **reserva atómica de stock** (`updateMany` con `stock: { gte: qty }` dentro de la transacción) → zero oversell en concurrencia
- **Órdenes** con `orderNumber` incremental `NK-YYYY-XXXXXX`, snapshots completos en `OrderItem` (sobreviven hard-delete de producto)

### Shipping
- **Tarifas por región** (16 regiones de Chile) con costo + umbral free shipping + ETA por región
- Fallback a tarifa plana global si una región no está configurada
- Admin UI editable inline en `/admin/shipping`

### Pagos
- **Menú propio** `/admin/payments` con card por método + badges de estado (Activo/Inactivo/Configurado/No integrado)
- **Transferencia bancaria** activa (provider `manual`); datos bancarios editables desde el panel
- **Placeholders** para Webpay, MercadoPago, Flow (pending integración real)
- Switching de provider via env var `PAYMENT_PROVIDER`

### Emails transaccionales
7 templates implementados con strategy pattern. Provider actual: `console` (loggea); swapear a **Brevo** es 1 clase nueva cuando haya dominio (ver `memory/project_email_provider_brevo.md`).

- Orden recibida
- Pago confirmado
- Pedido despachado
- Pedido cancelado
- Pedido reembolsado
- Bienvenida cliente nuevo
- Alerta admin nueva orden (envía a `store.contact_email`)
- Reset de password

### DTE (boleta/factura SII)
- Interfaz + mock implementados
- Integración real con OpenFactura/Haulmer **diferida** (bloqueante legal antes de vender)

### Admin panel (`/admin`)

Menús izquierdos:

- **Dashboard** — ventas hoy/7d/30d, pendientes pago/envío, stock bajo (<5), top 5 productos del mes, customers nuevos, últimas 10 órdenes
- **Órdenes** — búsqueda (número/email/nombre), filtros fecha, export CSV, detalle con timeline + notas internas/públicas, edición inline de cantidad/dirección, remove item con restauración de stock
- **Clientes** — lista con buscador + filtro guest/registrado, detalle con LTV + historial + direcciones
- **Productos** — lista con bulk actions, papelera, importador CSV masivo, scheduled sale prices, subcategorías en el select
- **Categorías** — árbol con indentación visual, validación anti-ciclo
- **Atributos** — CRUD de atributos + values
- **Cupones** — CRUD
- **Pagos** *(ADMIN only)* — métodos configurados
- **Envíos** *(ADMIN only)* — tabla de las 16 regiones editable
- **SEO** *(ADMIN only)* — auditoría automática del catálogo (ver abajo)
- **Usuarios admin** *(ADMIN only)* — CRUD con roles (ADMIN / CATALOG_MANAGER / ORDERS_MANAGER / VIEWER)
- **Registro de actividad** *(ADMIN only)* — audit log con filtros
- **Configuración** *(ADMIN only)* — settings editables agrupados (Tienda, Impuestos, Envíos, Emails, Papelera)

**Auth**:
- Multi-admin con 4 roles jerárquicos. Guard re-consulta DB en cada request → role stale no concede privilegios
- Password reset flow (link con token hasheado, TTL 60min, anti-enumeration)

### Storefront SEO (equivalente a Yoast nativo)

- **`/sitemap.xml`** dinámico con home + `/productos` + todas las categorías + todos los productos activos (revalida cada hora)
- **`/robots.txt`** con disallow en checkout/carrito/cuenta/login/registro, apunta al sitemap
- **Metadata expandida** en cada page: OG tags (con imagen OG del producto), Twitter Card, canonical URL, robots con `max-image-preview: large`
- **JSON-LD Product** en PDP con `AggregateOffer` (low/high price, availability, sale prices respetadas con fechas) + **JSON-LD BreadcrumbList**
- Google muestra en los resultados: precio, stock, imagen, breadcrumbs. Compartir link por WhatsApp trae preview

### Panel de auditoría SEO (`/admin/seo`)

Yoast-style simplificado. Botón "Re-escanear" que corre checks contra catálogo + config y devuelve issues agrupados por severidad:

**Críticos** (bloquean ventas / Google):
- Productos sin imagen, sin variantes, con todas las variantes stock 0
- `store.name` no configurado

**Advertencias** (afectan ranking):
- Meta title/description faltante o muy corta
- Imágenes sin alt text
- Descripciones de producto/categoría faltantes
- Slugs muy largos (>100 chars)
- Config incompleta (email contacto, descripción tienda)

Cada issue expandible muestra los primeros 5 items afectados con link directo al editor. Score 0-100 al header.

### Seguridad
- **Rate limiting**: 10 intentos / 15min en `/auth/*` + 100/min global (por IP)
- **Password policy**: zxcvbn score ≥ 2 (rechaza `password`, `12345678`, patrones de diccionario)
- **CSP estricta** en admin + storefront con allowlist dinámico (API + MinIO)
- **Security headers**: X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
- **SSRF guard** en importer de productos (bloquea IPs privadas + non-http schemas)
- **Helmet** + CORS con whitelist
- **Audit log** completo (mutations sensibles, login éxito/falla con razón)
- **Tokens JWT**: access 15min + refresh 30d con secretos separados, RBAC DB-backed

### Testing + CI
- **15 tests** (Vitest + supertest): checkout atómico, stock reservation, order numbers únicos, guest/customer flows, auth login (éxito/falla + audit), password reset (anti-enumeration + token rejection), refresh tokens, password policy
- **GitHub Actions**: typecheck + tests en cada push/PR, con Postgres 16 como service
- **Dependabot**: chequeo semanal de CVEs en deps (npm) + GitHub actions, agrupado por ecosistema (nest/fastify/next-react/prisma)

## Importar productos masivamente

Disponible en admin → **Productos → Importar productos**. Acepta exports CSV de WooCommerce (formato estándar) y se auto-detectan los headers. Soporta hasta ~5.000 productos por archivo.

**Wizard de 3 pasos**:

1. **Subir CSV** — upload del archivo.
2. **Asignar columnas** — tabla con columna CSV + ejemplo de la primera fila a la izquierda, dropdown del campo Neo-Kodex a la derecha. Si el CSV es WooCommerce, los mappings vienen pre-asignados. Toggle "Precios incluyen IVA" (default ON).
3. **Importar** — progress en vivo + reporte con creados/actualizados/fallidos y CSV descargable de errores.

**Features**:
- Upsert por SKU (crea o actualiza; idempotente en re-imports)
- Árbol de categorías padre/hijo creado on-the-fly (`"Estar > Baúl"` → crea Estar + Baúl con relación)
- Descarga paralela de imágenes (máx 6 simultáneas, timeout 30s, guard SSRF) → sube a MinIO con Sharp
- Idempotencia de imágenes por `Media.sourceUrl` (no re-descarga en re-imports)
- Extracción de IVA del precio con `Setting store.tax_rate_bp`
- HTML → texto limpio en descripciones (strippea `<p data-start=…>`, decode entities, bullets `● `)

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

Preserva números WC originales, upsert customer por email, linkea `variantId` si el SKU existe, snapshot en OrderItem si no. Idempotente.

## Deploy en Coolify

Deploy funcionando en VPS Hostinger con Coolify + URLs provisorias sslip.io.

**Arquitectura**:
- **Application** tipo Docker Compose (endpoint `POST /api/v1/applications/public`)
- Build pack `dockercompose`, apunta a `/docker-compose.prod.yml`
- Coolify expone **magic vars** para cada service con puerto declarado:
  - `SERVICE_URL_<NAME>` — URL con protocolo (ej: `http://api-abc.sslip.io`)
  - `SERVICE_FQDN_<NAME>` — FQDN sin protocolo
  - **Sin sufijo de puerto** (`SERVICE_URL_API`, NO `SERVICE_URL_API_3001`)
- Env vars (secretos) vía `POST /api/v1/applications/{uuid}/envs`. Campos válidos: `{key, value, is_preview, is_literal}`. `is_build_time` NO es válido; los build-args se infieren automáticamente del `build.args` del compose
- Auto-deploy vía webhook GitHub: `http://<coolify-host>:8000/webhooks/source/github/events/manual` con shared secret

**Imagen API slim (457 MB)**:
Dockerfile con **prune stage** que ahorra ~900 MB por versión vs copiar todo el `node_modules` del build. Prisma CLI movido de `devDependencies` a `dependencies` para que `prisma migrate deploy` funcione en runtime. Entry point `dist/src/main.js` (no `dist/main.js`) por `tsconfig rootDir: "./"`.

## Arquitectura clave

- **Strategy pattern** en providers (`PaymentProvider`, `EmailProvider`, `DteProvider`, `ShippingProvider`): agregar nueva integración = 1 clase + 1 case en switch + env var, cero refactor del resto
- **Schema estándar ecommerce** no rubro-específico. Sistema de atributos flexible cubre cualquier rubro
- **Single-tenant** por ahora. Meta futura: multi-instance (mismo repo, varios deploys con env vars distintas)
- **Snapshot pattern en OrderItem**: `productName`, `sku`, `priceGross`, etc. se copian al checkout. Soft/hard delete de producto no rompe histórico
- **JSON-LD Product + BreadcrumbList** server-rendered en PDP → SEO que funciona sin JS del lado del cliente
- **Image pipeline**: Sharp resize/WebP al upload + `next/image` responsive al delivery = doble capa de optimización

---

## Pendientes pre-producción real

Cuando se vaya a vender con clientes reales, estos items son obligatorios. Están **diferidos conscientemente** mientras se sigue iterando en desarrollo.

### Bloqueantes legales (Chile)

- [ ] **DTE real (boleta/factura)** — integrar con OpenFactura o Haulmer. Hoy es mock. Sin esto no se puede vender legalmente (SII exige documentos electrónicos)
- [ ] **Términos y condiciones + política de privacidad + política de devoluciones** — páginas estáticas obligatorias por Ley 19.628 y Ley del Consumidor. Derecho a retracto 10 días en ecommerce
- [ ] **Contacto + RUT de la empresa** visibles en footer — obligatorio

### Bloqueantes funcionales

- [ ] **Medio de pago real** — integrar Webpay Plus, MercadoPago, Flow o Khipu. Hoy solo transferencia manual (card "No integrado" en `/admin/payments`)
- [ ] **Email provider real** — conectar **Brevo** (preferido por el usuario; ver `memory/project_email_provider_brevo.md`). Hoy los emails se loggean pero no se envían
- [ ] **Dominio real + SSL** — comprar `.cl` (~$9k/año en NIC.cl), apuntar DNS al VPS, Coolify activa Let's Encrypt automático. Requerido para evitar aviso "Not Secure" en browser y para algunas APIs web (crypto.randomUUID)

### Hardening operacional

- [ ] **Cambiar password admin** cada vez que se monte un cliente nuevo (`changeme123` en dev; local ya está cambiado)
- [ ] **Rotar SSH key + Coolify token** que están en `/tmp/nk-deploy/` y en history de sesiones Claude
- [ ] **Backups diarios de Postgres** — cron con `pg_dump` → Backblaze B2 ó rclone a Google Drive (costo <$1/mes)
- [ ] **UptimeRobot** (alertas si el sitio cae, free tier 5min interval)
- [ ] **Sentry** (error tracking backend + frontend, free tier 5k/mes)
- [ ] **2FA para admin** (TOTP, 1-2 días de implementación)
- [ ] **Alertas de stock bajo** por email (cuando un Variant cruza threshold)
- [ ] **Repo privado** + GitHub App de Coolify instalada (hoy público por conveniencia; junto con SSL cuando llegue el momento)

### Nice-to-have

- [ ] **Cloudflare adelante** — CDN + DDoS gratis cuando haya dominio real. Cachea assets estáticos e imágenes
- [ ] **Redis** para cache de queries API — solo cuando el volumen lo justifique
- [ ] **OpenAPI/Swagger docs** del API — genera desde anotaciones Nest, 2-4 hs
- [ ] **Variable products** en el importador (hoy solo `simple`)
- [ ] **Template CSV propio** para el importador (reemplaza/complementa el de WC)
- [ ] **Rich text editor** en admin para descripciones (hoy Textarea plano)
- [ ] **RMA / returns** customer-initiated (hoy solo admin inicia refund)

## Estado del proyecto

**MVP completo + hardening significativo**:

- [x] Monorepo + schema + Docker dev + seeds
- [x] API core: auth (password reset + roles 4 niveles + audit log), productos, variantes, categorías jerárquicas, media, atributos
- [x] Comercio: carrito guest/customer, órdenes atómicas con timeline + notas, stock concurrente-safe, cupones, edit order
- [x] Strategy pattern: Payment / Email / DTE / Shipping con providers default
- [x] Admin UI: dashboard real, todos los CRUDs, users, audit log, settings, customers, shipping por región, pagos, SEO audit
- [x] Productos: drafts/archived, soft delete, papelera con auto-purge, bulk actions, scheduled sale prices
- [x] Storefront: home, PLP, PDP, carrito, checkout guest/registrado + SEO completo (sitemap, robots, JSON-LD, OG)
- [x] Media pipeline: Sharp on-upload (resize + WebP + EXIF strip) + next/image
- [x] Deploy Coolify con auto-deploy + Dockerfile slim (457MB API)
- [x] Importador masivo de productos con wizard de mapeo + HTML cleanup
- [x] Script one-off de órdenes históricas
- [x] Emails transaccionales (7 templates)
- [x] Rate limiting + password policy zxcvbn + CSP + security headers + Dependabot
- [x] Tests (15) + CI (GitHub Actions con Postgres service)
