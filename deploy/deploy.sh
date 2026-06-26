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

ensure_pnpm() {
	local expected
	expected="$(node -e "const pm=require('./package.json').packageManager || ''; const match=pm.match(/^pnpm@(.+)$/); if (!match) process.exit(1); process.stdout.write(match[1]);")" || {
		echo "ERROR: package.json must declare packageManager: pnpm@<version>" >&2
		exit 1
	}

	if command -v corepack >/dev/null 2>&1; then
		corepack prepare "pnpm@${expected}" --activate >/dev/null
	fi

	if ! command -v pnpm >/dev/null 2>&1; then
		echo "ERROR: pnpm is not installed. Install pnpm ${expected} or enable Corepack." >&2
		exit 1
	fi

	local actual
	actual="$(pnpm --version)"
	if [ "$actual" != "$expected" ]; then
		echo "ERROR: expected pnpm ${expected}, got ${actual}." >&2
		echo "Run: corepack prepare pnpm@${expected} --activate" >&2
		exit 1
	fi
}

echo "==> [1/6] Sync repo to origin/${BRANCH}"
cd "$REPO"
git fetch --prune origin
git reset --hard "origin/${BRANCH}"

echo "==> [2/7] Verify package manager"
ensure_pnpm

echo "==> [3/7] Inject build-time env (VITE_* → apps/terminal/.env.local)"
test -f "$SHARED/.env.local" || { echo "ERROR: missing $SHARED/.env.local"; exit 1; }
cp "$SHARED/.env.local" apps/terminal/.env.local

echo "==> [4/7] Install deps (frozen lockfile)"
pnpm install --frozen-lockfile

echo "==> [5/7] Build Nitro node-server output (8GB heap)"
NITRO_PRESET=node-server pnpm build

echo "==> [6/7] Restart service"
sudo systemctl restart gatu

echo "==> [7/7] Health check"
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
