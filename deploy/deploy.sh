#!/usr/bin/env bash
# Build & restart gatu on a single EC2 host.
# Run as the `gatu` user:  bash /opt/gatu/repo/deploy/deploy.sh [branch]
#
# Idempotent: discards local changes, syncs to origin/<branch>, installs,
# builds the Nitro node-server output, restarts the service, health-checks.
set -euo pipefail

REPO=/opt/gatu/repo
SHARED=/opt/gatu/shared
BRANCH="${1:-main}"

echo "==> [1/6] Sync repo to origin/${BRANCH}"
cd "$REPO"
git fetch --prune origin
git reset --hard "origin/${BRANCH}"

echo "==> [2/6] Inject build-time env (VITE_* → apps/terminal/.env.local)"
test -f "$SHARED/.env.local" || { echo "ERROR: missing $SHARED/.env.local"; exit 1; }
cp "$SHARED/.env.local" apps/terminal/.env.local

echo "==> [3/6] Install deps (frozen lockfile)"
pnpm install --frozen-lockfile

echo "==> [4/6] Build Nitro node-server output (8GB heap)"
NITRO_PRESET=node-server pnpm build

echo "==> [5/6] Restart service"
sudo systemctl restart gatu

echo "==> [6/6] Health check"
set -a; . "$SHARED/.env.runtime" 2>/dev/null || true; set +a
PORT="${PORT:-3000}"
for _ in $(seq 1 20); do
	if curl -fsS -o /dev/null "http://127.0.0.1:${PORT}/"; then
		echo "OK — gatu serving on 127.0.0.1:${PORT} (commit $(git rev-parse --short HEAD))"
		exit 0
	fi
	sleep 1
done
echo "HEALTH CHECK FAILED — inspect: journalctl -u gatu -n 50" >&2
exit 1
