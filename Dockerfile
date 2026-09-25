# syntax=docker/dockerfile:1.7

# ---- deps: install node_modules with bun ----
FROM oven/bun:1 AS deps
WORKDIR /app

# Native modules (better-sqlite3, sharp) need build toolchain during install.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock* bun.lockb* package-lock.json* ./
RUN bun install --frozen-lockfile || bun install

# ---- builder: compile Next.js in standalone mode ----
FROM oven/bun:1 AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# Placeholder values so route modules that read env at import time (db client,
# session secret, etc.) can be evaluated during `next build`'s page-data
# collection. Real values are supplied at runtime via `docker run --env-file`.
ENV DATABASE_URL="postgres://user:pass@localhost:5432/db"
ENV SESSION_SECRET="build-time-placeholder-not-used-at-runtime"

# NEXT_PUBLIC_* is inlined by Next at build time, so runtime env_file is a
# no-op for these. GHA passes the current umami website id via --build-arg;
# unset ⇒ layout.tsx skips mounting the tracker (correct default for local
# `docker build` and initial CI runs before the repo var is populated).
ARG NEXT_PUBLIC_UMAMI_WEBSITE_ID=""
ENV NEXT_PUBLIC_UMAMI_WEBSITE_ID=$NEXT_PUBLIC_UMAMI_WEBSITE_ID

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN bun run build

# ---- runner: minimal Node runtime ----
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
