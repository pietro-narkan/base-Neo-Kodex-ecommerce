# syntax=docker/dockerfile:1.7

# ============================================================
# Base con pnpm
# ============================================================
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# ============================================================
# deps (full: devDeps + prod) — para el build
# ============================================================
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/admin/package.json ./apps/admin/
COPY apps/storefront/package.json ./apps/storefront/
COPY packages/types/package.json ./packages/types/
COPY packages/config/package.json ./packages/config/
RUN pnpm install --frozen-lockfile

# ============================================================
# build (compila)
# ============================================================
FROM deps AS build
ENV NODE_OPTIONS="--max-old-space-size=1024"
COPY . .
WORKDIR /app/apps/api
RUN pnpm exec prisma generate
RUN pnpm build

# ============================================================
# prune (prod-only para runtime; SIN devDeps ni admin/storefront)
# ============================================================
FROM base AS prune
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/admin/package.json ./apps/admin/
COPY apps/storefront/package.json ./apps/storefront/
COPY packages/types/package.json ./packages/types/
COPY packages/config/package.json ./packages/config/
# --filter "@neo-kodex/api..." instala solo el grafo de api (incl. packages/*)
# --prod omite devDependencies (nest/cli, testing, tsx, typescript, @types/*)
RUN pnpm install --prod --frozen-lockfile --filter "@neo-kodex/api..."
# Generar Prisma Client + engine musl (necesita schema y el CLI, ahora en deps)
COPY apps/api/prisma ./apps/api/prisma
RUN cd apps/api && /app/node_modules/.bin/prisma generate

# ============================================================
# runtime (imagen final, slim)
# ============================================================
FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
ENV NODE_ENV=production
ENV PATH=/app/node_modules/.bin:/app/apps/api/node_modules/.bin:$PATH

# Prod-only node_modules (symlinks pnpm entre /app y /app/apps/api/node_modules)
COPY --from=prune /app/pnpm-workspace.yaml /app/pnpm-lock.yaml /app/package.json ./
COPY --from=prune /app/node_modules ./node_modules
COPY --from=prune /app/apps/api/node_modules ./apps/api/node_modules

# Compiled output + prisma schema del build stage
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/api/package.json ./apps/api/

WORKDIR /app/apps/api
EXPOSE 3001
CMD ["sh", "-c", "\
echo '=== API startup ==='; \
echo 'node:' $(node --version); \
echo 'prisma binary:' $(which prisma); \
echo 'DATABASE_URL prefix:' $(echo $DATABASE_URL | cut -c1-40); \
echo 'PORT:' $PORT; \
echo '--- migrate attempt ---'; \
for i in 1 2 3 4 5 6 7 8 9 10; do \
  echo \"migrate try $i:\"; \
  prisma migrate deploy 2>&1 && break; \
  echo '  failed, retry in 3s'; \
  sleep 3; \
done; \
echo '=== starting node ==='; \
exec node dist/src/main.js"]
