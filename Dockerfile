# syntax=docker/dockerfile:1

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# --- Dependencies (cached until package*.json changes) ---
FROM base AS deps
COPY package.json package-lock.json ./
# Scripts run later, once the Prisma schema and scripts/ are in place.
RUN npm ci --ignore-scripts

# --- Source + generated Prisma client + barcode decoder ---
FROM base AS source
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# prisma.config.ts reads DATABASE_URL when it loads; generate never connects, so a placeholder is fine.
RUN DATABASE_URL="postgres://build:build@localhost:5432/build" npx prisma generate \
 && node scripts/copy-zxing.mjs

# --- One-off job: apply migrations and seed the exercise library ---
FROM source AS migrate
ENV PRISMA_HIDE_UPDATE_MESSAGE=1
CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed"]

# --- Production build ---
FROM source AS build
ENV NEXT_OUTPUT=standalone
RUN npx next build

# --- Runtime: standalone server only, as the unprivileged node user ---
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "server.js"]
