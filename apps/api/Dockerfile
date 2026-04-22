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
# Retry prisma migrate hasta 10x (postgres puede tardar en estar reachable)
# y usar binario via PATH resuelto
CMD ["sh", "-c", "i=0; until prisma migrate deploy 2>&1; do i=$((i+1)); if [ $i -ge 10 ]; then echo 'prisma migrate failed after 10 retries'; exit 1; fi; echo \"retry $i/10 in 3s...\"; sleep 3; done && node dist/main.js"]
