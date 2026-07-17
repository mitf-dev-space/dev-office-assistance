# syntax=docker/dockerfile:1
# Helm API — multi-stage production image (no migrate in CMD).

FROM node:22-alpine AS builder

RUN apk add --no-cache openssl libc6-compat

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

RUN if [ -f ./docker/corporate-ca.pem ]; then export NODE_EXTRA_CA_CERTS=/app/docker/corporate-ca.pem; fi; \
    if [ "$NPM_STRICT_SSL" = "0" ]; then export NODE_TLS_REJECT_UNAUTHORIZED=0; fi; \
    npm run build -w @office/types && \
    npm run prisma:generate -w @office/api && \
    npm run build -w @office/api && \
    test -f packages/types/dist/index.js && \
    npm prune --omit=dev && \
    npm install prisma@6.3.1 --no-audit --no-fund --workspace=@office/api --include-workspace-root=false

FROM node:22-alpine AS runtime

RUN apk add --no-cache openssl libc6-compat wget \
    && addgroup -g 10001 -S helm \
    && adduser -u 10001 -S -G helm helm

WORKDIR /app

COPY --from=builder --chown=helm:helm /app/package.json /app/package-lock.json* ./
COPY --from=builder --chown=helm:helm /app/node_modules ./node_modules
COPY --from=builder --chown=helm:helm /app/packages ./packages
COPY --from=builder --chown=helm:helm /app/apps/api ./apps/api

ARG IMAGE_VERSION=dev
ARG GIT_SHA=unknown
LABEL org.opencontainers.image.title="helm-api" \
      org.opencontainers.image.description="Helm office-assistance API" \
      org.opencontainers.image.version="${IMAGE_VERSION}" \
      org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.source="https://github.com/anstwechy/dev-office-assistance"

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

RUN mkdir -p /app/data/uploads /app/data/forge-artifacts /app/data/forge-workspaces \
    && chown -R helm:helm /app/data

USER helm

HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD wget -qO- http://127.0.0.1:4000/health/live >/dev/null || exit 1

# Migrations: run via compose migrate one-shot, not this CMD.
CMD ["node", "apps/api/dist/index.js"]
