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
COPY . .
WORKDIR /app/apps/api
RUN pnpm exec prisma generate
RUN pnpm build

# ===== runtime =====
FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
ENV NODE_ENV=production

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
# prisma migrate deploy es idempotente; si no hay migraciones nuevas es no-op
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/main.js"]
