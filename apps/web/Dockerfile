# syntax=docker/dockerfile:1
# Helm web — multi-stage static SPA served by nginx.

FROM node:22-alpine AS builder

RUN apk add --no-cache libc6-compat

WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/types/package.json ./packages/types/
COPY docker/ ./docker/

ARG NPM_STRICT_SSL=1
RUN --mount=type=cache,target=/root/.npm \
    if [ -f ./docker/corporate-ca.pem ]; then export NODE_EXTRA_CA_CERTS=/app/docker/corporate-ca.pem; fi; \
    if [ "$NPM_STRICT_SSL" = "0" ]; then export NPM_CONFIG_STRICT_SSL=false; fi; \
    if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi

COPY packages/types ./packages/types
COPY apps/api ./apps/api
COPY apps/web ./apps/web

# LAN production default: browser → published API port on shared server.
ARG VITE_API_BASE_URL=http://10.100.235.21:46811
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build -w @office/types && npm run build -w @office/web

FROM nginx:1.27-alpine AS runtime

# nginx binds :80 as root then workers drop privileges (stock image model).
RUN apk add --no-cache wget

COPY apps/web/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

ARG IMAGE_VERSION=dev
ARG GIT_SHA=unknown
LABEL org.opencontainers.image.title="helm-web" \
      org.opencontainers.image.description="Helm office-assistance web UI" \
      org.opencontainers.image.version="${IMAGE_VERSION}" \
      org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.source="https://github.com/anstwechy/dev-office-assistance"

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
  CMD wget -qO- http://127.0.0.1/health/live >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
