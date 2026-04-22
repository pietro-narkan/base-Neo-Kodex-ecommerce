# syntax=docker/dockerfile:1.7

# ===== Base con pnpm =====
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# ===== deps: resuelve el monorepo completo =====
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/admin/package.json ./apps/admin/
COPY apps/storefront/package.json ./apps/storefront/
COPY packages/types/package.json ./packages/types/
COPY packages/config/package.json ./packages/config/
RUN pnpm install --frozen-lockfile

# ===== build =====
FROM deps AS build
ENV NODE_OPTIONS="--max-old-space-size=1024"
COPY . .
WORKDIR /app/apps/api
RUN pnpm exec prisma generate
RUN pnpm build

# ===== runtime =====
FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
ENV NODE_ENV=production
# Asegura que prisma + otros CLI del workspace estan en PATH
ENV PATH=/app/node_modules/.bin:/app/apps/api/node_modules/.bin:$PATH

# Copiamos el monorepo completo con node_modules (pnpm symlinks necesitan el grafo)
COPY --from=build /app/pnpm-workspace.yaml /app/pnpm-lock.yaml /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/api/package.json ./apps/api/
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules

WORKDIR /app/apps/api
EXPOSE 3001
# Startup con logs visibles para diagnosticar. Retry prisma, despues exec node.
CMD ["sh", "-c", "\
echo '=== API startup ==='; \
echo 'node:' $(node --version); \
echo 'prisma binary:' $(which prisma); \
ls -la /app/node_modules/.bin/prisma 2>&1 | head -3; \
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
