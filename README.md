# Neo-Kodex Ecommerce

Base ecommerce headless reutilizable. Monorepo con NestJS (API), Next.js (admin + storefront), Prisma + Postgres, MinIO (media), Docker + Coolify para deploy.

## Stack

- **API**: NestJS 10 + Fastify + Prisma 5
- **Admin**: Next.js 15 (App Router) + Tailwind + shadcn/ui
- **Storefront**: Next.js 15 (App Router) + Tailwind
- **DB**: PostgreSQL 16
- **Storage**: MinIO (S3-compatible, self-hosted)
- **Monorepo**: pnpm workspaces
- **Deploy**: Docker + Coolify

## Requisitos

- Node.js >= 22 (recomendado Volta o nvm)
- pnpm 9.15 (`volta install pnpm@9.15.0` o `npm i -g pnpm@9.15.0`)
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

> **Nota**: Postgres corre en 5433 (no 5432) para no chocar con otros proyectos que puedan usar el puerto estándar.

## Credenciales iniciales (post-seed)

- **Admin**: `admin@neo-kodex.local` / `changeme123` — **cambiar en producción**
- **Coupon de ejemplo**: `BIENVENIDA10` (10% OFF, 100 usos)

## Estructura

```
neo-kodex-ecommerce/
├── apps/
│   ├── api/        # NestJS + Fastify + Prisma
│   ├── admin/      # Next.js admin panel
│   └── storefront/ # Next.js tienda publica
├── packages/
│   ├── types/      # Tipos + Zod compartidos
│   └── config/     # Constantes (CLP, IVA, Settings keys)
├── docker-compose.yml
└── pnpm-workspace.yaml
```

## Scripts utiles

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

## Deploy en Coolify

> TODO: documentar cuando lleguemos a la Fase 6.

Esquema previsto:
1. Postgres como service en Coolify
2. MinIO como service en Coolify (disco persistente)
3. API, Admin, Storefront como apps separadas apuntando a un repo Git
4. Dominios con SSL automatico via Traefik (Coolify built-in)

## Estado del proyecto

- [x] **Fase 0** — Monorepo + Prisma schema + Docker dev + seeds
- [ ] **Fase 1** — API core (auth, productos, variantes, categorias, media)
- [ ] **Fase 2** — Comercio (carrito, ordenes, stock, cupones)
- [ ] **Fase 3** — Modulos enchufables (DTE, Payment, Shipping, Email)
- [ ] **Fase 4** — Admin UI (login, dashboard, CRUDs)
- [ ] **Fase 5** — Storefront (home, PLP, PDP, carrito, checkout)
- [ ] **Fase 6** — Deploy Coolify

## Decisiones tecnicas

- **Precios en CLP como `Int`** (sin decimales) para evitar errores de redondeo.
- **Campos DTE** (boleta/factura electronica Chile) presentes en el schema pero sin integracion; se conectara a OpenFactura o similar cuando se vaya a produccion.
- **Pagos y email** solo con interfaz (`PaymentProvider`, `EmailProvider`); integracion real al final.
- **Schema estandar ecommerce**, no rubro-especifico. El sistema de atributos flexible (`Attribute` + `AttributeValue`) cubre cualquier rubro.
- **Single-tenant** por ahora. Meta futura: multi-instance (mismo repo, varios deploys con env vars distintas).
