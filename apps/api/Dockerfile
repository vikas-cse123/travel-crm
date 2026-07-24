# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Production image for the Interscale Travel CRM API.
#
# Build from the REPOSITORY ROOT (the build context must include packages/ and
# apps/), e.g.:
#   docker build -f apps/api/Dockerfile -t interscale-api .
#
# Migrations are NOT run here. Apply them as a separate deploy step, e.g. the
# `migrate` service in docker-compose.production.example.yml, or:
#   docker run --rm -e DATABASE_URL=... --entrypoint sh interscale-api-migrate \
#     -c "npx prisma migrate deploy --schema apps/api/prisma/schema.prisma"
# ---------------------------------------------------------------------------

# ---- builder: full deps, generate Prisma client, compile API + worker -------
FROM node:20-bookworm-slim AS builder
WORKDIR /app
# Toolchain for native modules (argon2) and openssl for the Prisma engine.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ openssl \
  && rm -rf /var/lib/apt/lists/*
# Install against the lockfile using only the manifests first, for layer caching.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY . .
RUN npm run db:generate \
  && npm run build:shared \
  && npm run build:api

# ---- proddeps: production-only node_modules --------------------------------
FROM node:20-bookworm-slim AS proddeps
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ openssl \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --omit=dev

# ---- runtime: lean, non-root -----------------------------------------------
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
# Production dependencies (hoisted to the workspace root) plus any that npm
# nested under the api workspace (e.g. sanitize-html, kept out of the root by a
# conflicting @types/* peer). Both trees are needed for runtime resolution.
COPY --from=proddeps /app/node_modules ./node_modules
COPY --from=proddeps /app/apps/api/node_modules ./apps/api/node_modules
# The generated Prisma client + query engine (produced in the builder).
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
# Compiled server + reminder worker and the manifests.
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/package.json ./package.json

# Drop to the unprivileged user shipped with the base image.
USER node

EXPOSE 4000

# Container-level liveness against the API's own liveness endpoint. Uses Node's
# global fetch (Node 20); no curl needed in the image.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/api/dist/server.js"]
