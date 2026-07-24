# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Production image for the Interscale Travel CRM web SPA.
#
# Build from the REPOSITORY ROOT and pass the API URL at build time (it is baked
# into the static bundle and must use https in real production):
#   docker build -f apps/web/Dockerfile \
#     --build-arg VITE_API_URL=https://api.example.com -t interscale-web .
# ---------------------------------------------------------------------------

# ---- builder: compile the static bundle ------------------------------------
FROM node:20-bookworm-slim AS builder
WORKDIR /app
# `npm ci` installs every workspace, including the API's native modules
# (argon2), so the builder needs a toolchain even though the web runtime does
# not. These tools live only in this discarded build stage.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# VITE_API_URL is compiled into the bundle; there is no runtime config for a
# static SPA. Defaults to localhost for local image builds.
ARG VITE_API_URL=http://localhost:4000
ENV VITE_API_URL=${VITE_API_URL}

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY . .
RUN npm run build:shared && npm run build:web
# Do not ship source maps in the production image (they expose source).
RUN find apps/web/dist -name '*.map' -delete

# ---- runtime: non-root nginx on port 8080 ----------------------------------
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null 2>&1 || exit 1
