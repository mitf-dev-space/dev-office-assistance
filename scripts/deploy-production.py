#!/usr/bin/env python3
"""
Production deploy for Helm (dev-office-assistance) on the LAN server (default 10.100.235.21).

Mirrors OmniTest Studio's Paramiko deploy pattern:
  probe → inventory; upgrade → pull + migrate + recreate api/web; full → all services.

Requires one of:
  - HELM_SSH_PASSWORD
  - HELM_SSH_PASSWORD_FILE

Optional: HELM_SSH_HOST, HELM_SSH_USER, HELM_REMOTE_DIR, HELM_LAN_HOST,
          HELM_WEB_PORT, HELM_API_PORT, HELM_REGISTRY_NAMESPACE

Usage:
  set HELM_SSH_PASSWORD=...
  pip install -r scripts/requirements-deploy.txt
  python scripts/deploy-production.py --mode probe
  python scripts/deploy-production.py --tag abcdef1 --mode upgrade
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

import paramiko

HOST = os.environ.get("HELM_SSH_HOST", "10.100.235.21")
USER = os.environ.get("HELM_SSH_USER", "masarat-admin")
LAN_HOST = os.environ.get("HELM_LAN_HOST", HOST)
REMOTE_COMPOSE_CANDIDATES = [
    os.environ.get("HELM_REMOTE_DIR", "").strip(),
    "~/compose-dev-office-assistance",
]
WEB_PORT = os.environ.get("HELM_WEB_PORT", "46810")
API_PORT = os.environ.get("HELM_API_PORT", "46811")
COMPOSE_FILE = "compose.production.yml"
ENV_FILE = ".env.production"

MANAGED_ENV_KEYS = (
    "REGISTRY_NAMESPACE",
    "IMAGE_TAG",
    "PULL_POLICY",
    "APP_PUBLIC_URL",
    "CORS_ORIGIN",
    "HELM_WEB_PORT",
    "HELM_API_PORT",
    "NODE_ENV",
    "ALLOW_LOCALHOST_CORS_IN_PRODUCTION",
    "FORGE_ALLOW_IOS_SIMULATION",
)


def read_ssh_password() -> str:
    pw = (os.environ.get("HELM_SSH_PASSWORD") or "").strip()
    if pw:
        return pw
    path = (os.environ.get("HELM_SSH_PASSWORD_FILE") or "").strip()
    if path and os.path.isfile(path):
        # Allow KEY=value file or raw password line
        text = Path(path).read_text(encoding="utf-8")
        for line in text.splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("HELM_SSH_PASSWORD="):
                return line.split("=", 1)[1].strip()
            return line
    print(
        "ERROR: Set HELM_SSH_PASSWORD or HELM_SSH_PASSWORD_FILE.",
        file=sys.stderr,
    )
    sys.exit(2)


def ssh_connect() -> paramiko.SSHClient:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        HOST,
        username=USER,
        password=read_ssh_password(),
        timeout=45,
        banner_timeout=45,
        auth_timeout=45,
    )
    return client


def run(client: paramiko.SSHClient, cmd: str, timeout: int = 1800) -> tuple[int, str, str]:
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout, get_pty=False)
    exit_status = stdout.channel.recv_exit_status()
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    return exit_status, out, err


def report(label: str, st: int, out: str, err: str) -> int:
    print(f"==> {label}")
    if out.strip():
        print(out.rstrip())
    if err.strip():
        print(err.rstrip(), file=sys.stderr)
    if st != 0:
        print(f"ERROR: '{label}' exit {st}", file=sys.stderr)
    return st


def remote_home() -> str:
    return f"/home/{USER}"


def resolve_compose_dir(client: paramiko.SSHClient) -> str | None:
    home = remote_home()
    for candidate in REMOTE_COMPOSE_CANDIDATES:
        if not candidate:
            continue
        path = candidate.replace("~", home)
        st, out, _ = run(client, f"test -d {path} && echo {path}", timeout=20)
        if st == 0 and out.strip():
            return out.strip()
    return None


def compose_cmd(compose_dir: str, *args: str) -> str:
    joined = " ".join(args)
    return (
        f"cd {compose_dir} && "
        f"docker compose --env-file {ENV_FILE} -f {COMPOSE_FILE} {joined}"
    )


def probe(client: paramiko.SSHClient) -> int:
    if report("docker versions", *run(client, "docker --version && docker compose version", timeout=60)):
        return 1

    report("disk space", *run(client, "df -h /var/lib/docker 2>/dev/null || df -h /", timeout=30))

    compose_dir = resolve_compose_dir(client)
    if not compose_dir:
        print(
            "ERROR: No compose directory found. Expected ~/compose-dev-office-assistance "
            "(run deploy/server-bootstrap.sh first).",
            file=sys.stderr,
        )
        return 1
    print(f"==> compose dir: {compose_dir}")

    report("compose ps", *run(client, compose_cmd(compose_dir, "ps"), timeout=60))
    report(
        ".env managed keys",
        *run(
            client,
            f"cd {compose_dir} && grep -E '^({'|'.join(MANAGED_ENV_KEYS)})=' {ENV_FILE} 2>/dev/null || echo '(no env or keys missing)'",
            timeout=30,
        ),
    )
    report(
        "all containers (coexistence with OmniTest)",
        *run(
            client,
            "docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}'",
            timeout=60,
        ),
    )
    report(
        "port bindings (46xxx)",
        *run(
            client,
            "ss -tlnp 2>/dev/null | grep -E ':(46300|46400|46432|46380|46810|46811)\\b' || echo '(ss unavailable)'",
            timeout=30,
        ),
    )
    return 0


def build_env_patch(compose_dir: str, tag: str, registry: str) -> str:
    ts = time.strftime("%Y%m%d-%H%M%S")
    public_url = f"http://{LAN_HOST}:{WEB_PORT}"
    cors = public_url
    key_pattern = "|".join(MANAGED_ENV_KEYS)
    lines = [
        f"cd {compose_dir}",
        f"test -f {ENV_FILE} || cp .env.production.example {ENV_FILE}",
        f"cp {ENV_FILE} .env.prod-backup-{ts}",
        f"sed -i -E '/^({key_pattern})=/d' {ENV_FILE}",
        f"cat >> {ENV_FILE} <<'ENVEOF'",
        f"# Patched by deploy-production.py ({ts})",
        f"REGISTRY_NAMESPACE={registry}",
        f"IMAGE_TAG={tag}",
        "PULL_POLICY=always",
        f"APP_PUBLIC_URL={public_url}",
        f"CORS_ORIGIN={cors}",
        f"HELM_WEB_PORT={WEB_PORT}",
        f"HELM_API_PORT={API_PORT}",
        "NODE_ENV=production",
        "ALLOW_LOCALHOST_CORS_IN_PRODUCTION=false",
        "FORGE_ALLOW_IOS_SIMULATION=false",
        "ENVEOF",
        f"echo '--- {ENV_FILE} (managed keys) ---'",
        f"grep -E '^({key_pattern})=' {ENV_FILE}",
    ]
    return "\n".join(lines)


def wait_api_healthy(client: paramiko.SSHClient, compose_dir: str, deadline_sec: int = 300) -> int:
    deadline = time.time() + deadline_sec
    while time.time() < deadline:
        st, out, _ = run(
            client,
            compose_cmd(compose_dir, "ps -q api") + " | xargs -r docker inspect --format '{{.State.Health.Status}}'",
            timeout=30,
        )
        status = out.strip().lower()
        if status == "healthy":
            print("==> api is healthy")
            return 0
        if status == "unhealthy":
            report("api logs", *run(client, compose_cmd(compose_dir, "logs --tail 40 api"), timeout=60))
            return 1
        print(f"    waiting for api health (status={status or 'starting'})...")
        time.sleep(10)
    print("ERROR: timed out waiting for api healthy", file=sys.stderr)
    return 1


def smoke_checks(client: paramiko.SSHClient) -> int:
    errors = 0
    checks = [
        ("web /health/live", f"curl -s -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{WEB_PORT}/health/live", "200"),
        ("api /health/live", f"curl -s -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{API_PORT}/health/live", "200"),
        ("api /health/ready", f"curl -s -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{API_PORT}/health/ready", "200"),
        ("api /api/me", f"curl -s -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{API_PORT}/api/me", "401"),
    ]
    for label, cmd, expected in checks:
        st, out, err = run(client, cmd, timeout=60)
        code = out.strip()
        print(f"==> smoke {label}: HTTP {code} (expect {expected})")
        if err.strip():
            print(err.rstrip(), file=sys.stderr)
        if st != 0 or code != expected:
            errors += 1
    return errors


def deploy(client: paramiko.SSHClient, tag: str, registry: str, mode: str) -> int:
    compose_dir = resolve_compose_dir(client)
    if not compose_dir:
        print("ERROR: No compose directory found.", file=sys.stderr)
        return 1

    if report("patch .env.production", *run(client, build_env_patch(compose_dir, tag, registry), timeout=120)):
        return 1

    if mode == "full":
        pull_targets = "postgres migrate api web"
    else:
        pull_targets = "api web migrate"

    if report(f"compose pull ({pull_targets})", *run(client, compose_cmd(compose_dir, f"pull {pull_targets}"), timeout=3600)):
        return 1

    if report("migrate", *run(client, compose_cmd(compose_dir, "run --rm migrate"), timeout=600)):
        return 1

    if mode == "full":
        up_cmd = compose_cmd(compose_dir, "up -d --remove-orphans --force-recreate")
    else:
        up_cmd = compose_cmd(compose_dir, "up -d --no-deps --force-recreate api web")

    if report("compose up", *run(client, up_cmd, timeout=900)):
        return 1

    if wait_api_healthy(client, compose_dir) != 0:
        return 1

    report("compose ps", *run(client, compose_cmd(compose_dir, "ps"), timeout=60))
    smoke_err = smoke_checks(client)
    if smoke_err:
        print(f"ERROR: {smoke_err} smoke check(s) failed", file=sys.stderr)
        return 1

    print()
    print(f"Done. Web: http://{LAN_HOST}:{WEB_PORT}  API: http://{LAN_HOST}:{API_PORT}")
    print(f"Tag: {tag}  Compose: {compose_dir}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Helm production LAN deploy")
    ap.add_argument("--mode", choices=("probe", "upgrade", "full"), default="upgrade")
    ap.add_argument("--tag", help="Docker image tag (required for upgrade/full)")
    ap.add_argument(
        "--registry",
        default=os.environ.get("HELM_REGISTRY_NAMESPACE", "anstwechy"),
    )
    args = ap.parse_args()

    if args.mode != "probe" and not args.tag:
        ap.error("--tag is required for upgrade/full modes")

    print(f"==> Connecting SSH to {USER}@{HOST}...")
    client = ssh_connect()
    try:
        if args.mode == "probe":
            return probe(client)
        return deploy(client, args.tag, args.registry, args.mode)
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())
