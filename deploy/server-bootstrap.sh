#!/usr/bin/env bash
# Idempotent bootstrap for Helm on the shared LAN server.
# Does NOT overwrite an existing .env.production.
set -euo pipefail

COMPOSE_HOME="${HELM_REMOTE_DIR:-${HOME}/compose-dev-office-assistance}"
SRC_DEPLOY="${1:-}"

echo "==> Helm server bootstrap → ${COMPOSE_HOME}"
mkdir -p "${COMPOSE_HOME}/scripts" "${COMPOSE_HOME}/backups" "${COMPOSE_HOME}/deployment-history" "${COMPOSE_HOME}/proxy"

if [[ -n "${SRC_DEPLOY}" && -d "${SRC_DEPLOY}" ]]; then
  echo "==> copying deploy kit from ${SRC_DEPLOY}"
  cp -f "${SRC_DEPLOY}/compose.production.yml" "${COMPOSE_HOME}/"
  cp -f "${SRC_DEPLOY}/.env.production.example" "${COMPOSE_HOME}/"
  cp -f "${SRC_DEPLOY}/README.md" "${COMPOSE_HOME}/" 2>/dev/null || true
  cp -f "${SRC_DEPLOY}/scripts/"*.sh "${COMPOSE_HOME}/scripts/"
  chmod +x "${COMPOSE_HOME}/scripts/"*.sh
  if [[ -d "${SRC_DEPLOY}/proxy" ]]; then
    cp -rf "${SRC_DEPLOY}/proxy/." "${COMPOSE_HOME}/proxy/"
  fi
else
  echo "==> no source path given; ensure compose files are already present or pass path to repo deploy/"
fi

if [[ ! -f "${COMPOSE_HOME}/.env.production" ]]; then
  if [[ -f "${COMPOSE_HOME}/.env.production.example" ]]; then
    cp "${COMPOSE_HOME}/.env.production.example" "${COMPOSE_HOME}/.env.production"
    chmod 600 "${COMPOSE_HOME}/.env.production"
    echo "==> created .env.production from example — EDIT SECRETS before deploy"
  else
    echo "WARN: no .env.production.example found" >&2
  fi
else
  echo "==> preserving existing .env.production (not overwritten)"
fi

if ! command -v docker >/dev/null; then
  echo "WARN: docker not found — install Docker Engine + Compose plugin" >&2
else
  docker --version
  docker compose version || true
fi

echo "bootstrap OK: ${COMPOSE_HOME}"
echo "Next: edit .env.production, then IMAGE_TAG=<sha> ./scripts/deploy.sh"
