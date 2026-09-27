# syntax=docker/dockerfile:1

FROM node:26-alpine AS base
RUN corepack enable
WORKDIR /app

# ---------------------------------------------------------------------------
# deps: install dependencies (cached separately from source changes)
# ---------------------------------------------------------------------------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# builder: build the Next.js app
# ---------------------------------------------------------------------------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# A placeholder DATABASE_URL is enough: `next build` never opens a real
# connection, it only needs the env var to be defined.
ENV DATABASE_URL="postgres://placeholder:placeholder@localhost:5432/placeholder"
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build
# Bundle the migration runner into a single plain-JS file so the runtime
# image needs neither TypeScript nor a runner (tsx) to apply migrations.
RUN pnpm exec esbuild src/db/migrate.ts --bundle --platform=node --format=cjs \
  --outfile=dist/migrate.cjs

# ---------------------------------------------------------------------------
# runner: minimal production image
# ---------------------------------------------------------------------------
FROM node:26-alpine AS runner
WORKDIR /app

# postgresql-client: used by admin backup/restore (pg_dump/pg_restore).
# age: used to encrypt/decrypt those backups.
RUN apk add --no-cache postgresql18-client age

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 radtempo

COPY --from=builder /app/public ./public
COPY --from=builder --chown=radtempo:nodejs /app/.next/standalone ./
COPY --from=builder --chown=radtempo:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/dist/migrate.cjs ./migrate.cjs
COPY docker/entrypoint.sh ./entrypoint.sh

RUN chmod +x ./entrypoint.sh && chown radtempo:nodejs ./entrypoint.sh

USER radtempo

EXPOSE 3000

ENTRYPOINT ["./entrypoint.sh"]
CMD ["node", "server.js"]
