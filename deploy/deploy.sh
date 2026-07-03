#!/usr/bin/env bash
# Build & restart gatu on a single EC2 host.
# Run as the `gatu` user:  bash /opt/gatu/repo/deploy/deploy.sh [branch]
#
# Idempotent: discards local changes, syncs to origin/<branch>, installs,
# builds a Nitro node-server output, publishes it as an immutable release,
# switches /opt/gatu/current atomically, restarts the service, health-checks.
set -euo pipefail

REPO=/opt/gatu/repo
SHARED=/opt/gatu/shared
RELEASES=/opt/gatu/releases
CURRENT=/opt/gatu/current
KEEP_RELEASES="${KEEP_RELEASES:-5}"
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

verify_systemd_unit() {
	local workdir
	workdir="$(systemctl show gatu --property=WorkingDirectory --value 2>/dev/null || true)"
	if [ -n "$workdir" ] && [ "$workdir" != "$CURRENT" ]; then
		echo "ERROR: installed gatu.service uses WorkingDirectory=${workdir}, expected ${CURRENT}." >&2
		echo "Install the updated unit first:" >&2
		echo "  sudo cp ${REPO}/deploy/gatu.service /etc/systemd/system/gatu.service" >&2
		echo "  sudo systemctl daemon-reload" >&2
		exit 1
	fi
}

publish_release() {
	local previous_release="$1"
	local commit release_name release_tmp release_dir current_tmp
	commit="$(git rev-parse --short HEAD)"
	release_name="$(date -u +%Y%m%d%H%M%S)-${commit}"
	release_tmp="${RELEASES}/.${release_name}.tmp"
	release_dir="${RELEASES}/${release_name}"
	current_tmp="${CURRENT}.tmp"

	test -f apps/terminal/.output/server/index.mjs || {
		echo "ERROR: missing Nitro server output: apps/terminal/.output/server/index.mjs" >&2
		exit 1
	}
	compgen -G "apps/terminal/.output/public/assets/main-*.js" >/dev/null || {
		echo "ERROR: build output has no main client asset." >&2
		exit 1
	}

	mkdir -p "$RELEASES"
	rm -rf "$release_tmp"
	mkdir -p "$release_tmp"
	cp -a apps/terminal/.output/. "$release_tmp"/
	if [ -n "$previous_release" ] && [ -d "${previous_release}/public/assets" ] && [ -d "${release_tmp}/public/assets" ]; then
		echo "Carry forward previous hashed assets from ${previous_release}" >&2
		find "${previous_release}/public/assets" -maxdepth 1 -type f -exec cp -n {} "${release_tmp}/public/assets/" \;
	fi
	mv "$release_tmp" "$release_dir"

	ln -sfn "$release_dir" "$current_tmp"
	mv -Tf "$current_tmp" "$CURRENT"
	printf '%s\n' "$release_dir"
}

rollback_to_release() {
	local previous="$1"
	if [ -z "$previous" ] || [ ! -d "$previous" ]; then
		return 1
	fi
	echo "==> Roll back current release to ${previous}"
	ln -sfn "$previous" "${CURRENT}.tmp"
	mv -Tf "${CURRENT}.tmp" "$CURRENT"
	sudo systemctl restart gatu
}

fetch_js_asset() {
	local base_url="$1"
	local path="$2"
	local tmpdir="$3"
	local headers="${tmpdir}/headers"
	local body="${tmpdir}/body"
	local content_type

	if ! curl -fsS -D "$headers" -o "$body" "${base_url}${path}"; then
		echo "ERROR: failed to fetch asset ${path}" >&2
		return 1
	fi

	content_type="$(awk 'BEGIN{IGNORECASE=1} /^content-type:/ {print $0; exit}' "$headers")"
	if ! printf '%s' "$content_type" | grep -qi 'javascript'; then
		echo "ERROR: asset ${path} returned non-JavaScript response: ${content_type:-missing content-type}" >&2
		head -c 200 "$body" >&2 || true
		echo >&2
		return 1
	fi
}

extract_asset() {
	local file="$1"
	local pattern="$2"
	node - "$file" "$pattern" <<'NODE'
const fs = require("node:fs");
const [file, pattern] = process.argv.slice(2);
const text = fs.readFileSync(file, "utf8");
const match = text.match(new RegExp(pattern));
if (!match) process.exit(1);
process.stdout.write(match[0]);
NODE
}

extract_js_assets() {
	local file="$1"
	node - "$file" <<'NODE'
const fs = require("node:fs");
const [file] = process.argv.slice(2);
const text = fs.readFileSync(file, "utf8");
const matches = text.match(/\/?assets\/[^"'<>\s]+\.js/g) || [];
const assets = new Set(matches.map((asset) => (asset.startsWith("/") ? asset : `/${asset}`)));
for (const asset of assets) {
	process.stdout.write(`${asset}\n`);
}
NODE
}

fetch_referenced_js_assets() {
	local base_url="$1"
	local file="$2"
	local tmpdir="$3"
	local asset

	while IFS= read -r asset; do
		if [ -z "$asset" ]; then
			continue
		fi
		if ! fetch_js_asset "$base_url" "$asset" "$tmpdir"; then
			return 1
		fi
	done < <(extract_js_assets "$file")
}

health_check() {
	local port="$1"
	local base_url="http://127.0.0.1:${port}"
	local tmpdir html_file trade_file main_asset trade_asset
	tmpdir="$(mktemp -d)"
	html_file="${tmpdir}/builders-perp.html"
	trade_file="${tmpdir}/trade-terminal-page.js"

	for _ in $(seq 1 30); do
		if curl -fsS -o "$html_file" "${base_url}/builders-perp"; then
			main_asset="$(extract_asset "$html_file" '/assets/main-[^"'"'"'"'"'"'"'"'"'<>\s]+\.js' || true)"
			trade_asset="$(extract_asset "$html_file" '/assets/trade-terminal-page-[^"'"'"'"'"'"'"'"'"'<>\s]+\.js' || true)"
			if [ -n "$main_asset" ] && [ -n "$trade_asset" ]; then
				if fetch_referenced_js_assets "$base_url" "$html_file" "$tmpdir"; then
					if ! curl -fsS -o "$trade_file" "${base_url}${trade_asset}"; then
						rm -rf "$tmpdir"
						return 1
					fi
					if fetch_referenced_js_assets "$base_url" "$trade_file" "$tmpdir"; then
						rm -rf "$tmpdir"
						return 0
					fi
					rm -rf "$tmpdir"
					return 1
				fi
			fi
		fi
		sleep 1
	done
	rm -rf "$tmpdir"
	return 1
}

cleanup_old_releases() {
	local current_target releases_to_remove
	current_target="$(readlink -f "$CURRENT" 2>/dev/null || true)"
	mapfile -t releases_to_remove < <(find "$RELEASES" -mindepth 1 -maxdepth 1 -type d | sort -r | tail -n +"$((KEEP_RELEASES + 1))")
	for release in "${releases_to_remove[@]}"; do
		if [ "$(readlink -f "$release")" = "$current_target" ]; then
			continue
		fi
		rm -rf "$release"
	done
}

echo "==> [1/8] Sync repo to origin/${BRANCH}"
cd "$REPO"
git fetch --prune origin
git reset --hard "origin/${BRANCH}"

echo "==> [2/8] Verify package manager and systemd unit"
ensure_pnpm
verify_systemd_unit

echo "==> [3/8] Inject build-time env (VITE_* → apps/terminal/.env.local)"
test -f "$SHARED/.env.local" || { echo "ERROR: missing $SHARED/.env.local"; exit 1; }
cp "$SHARED/.env.local" apps/terminal/.env.local

echo "==> [4/8] Install deps (frozen lockfile)"
pnpm install --frozen-lockfile

echo "==> [5/8] Build Nitro node-server output (8GB heap)"
NITRO_PRESET=node-server pnpm build

echo "==> [6/8] Publish immutable release"
previous_release="$(readlink -f "$CURRENT" 2>/dev/null || true)"
new_release="$(publish_release "$previous_release")"
echo "Published ${new_release}"

echo "==> [7/8] Restart service"
if ! sudo systemctl restart gatu; then
	echo "RESTART FAILED — attempting rollback." >&2
	rollback_to_release "$previous_release" || true
	exit 1
fi

echo "==> [8/8] Health check"
set -a; . "$SHARED/.env.runtime" 2>/dev/null || true; set +a
PORT="${PORT:-3000}"
if health_check "$PORT"; then
	cleanup_old_releases
	echo "OK — gatu serving on 127.0.0.1:${PORT} (commit $(git rev-parse --short HEAD), release $(basename "$new_release"))"
	exit 0
fi

echo "HEALTH CHECK FAILED — attempting rollback." >&2
if rollback_to_release "$previous_release" && health_check "$PORT"; then
	echo "ROLLBACK OK — restored $(basename "$previous_release"). Inspect: journalctl -u gatu -n 100" >&2
	exit 1
fi

echo "HEALTH CHECK FAILED — inspect: journalctl -u gatu -n 50" >&2
exit 1
