#!/usr/bin/env bash
# Build & restart gatu on a single EC2 host.
# Run as the `gatu` user:  bash /opt/gatu/repo/deploy/deploy.sh [branch]
#
# Idempotent: discards local changes, syncs to origin/<branch>, installs,
# builds a Nitro node-server output, publishes it as an immutable release,
# verifies the canonical Caddy config, switches /opt/gatu/current
# atomically, restarts the service, and health-checks both Node and Caddy.
set -euo pipefail

REPO=/opt/gatu/repo
SHARED=/opt/gatu/shared
RELEASES=/opt/gatu/releases
CURRENT=/opt/gatu/current
KEEP_RELEASES="${KEEP_RELEASES:-5}"
BRANCH="${1:-main}"
SOCIAL_IMAGE_PATH="/gatu-terminal-og-v1.png"
CHART_LIBRARY_PATH="/charting_library"
CHART_THEME_PATHS="/tradingview-theme-dark.css /tradingview-theme-light.css"
CHART_LIBRARY_MANIFEST_PATH="${REPO}/deploy/manifests/tradingview-charting-library.json"
CHART_CACHE_POLICY="public, max-age=0, must-revalidate"
REFERRAL_DEEP_LINK_PATH="/join/__gatu_healthcheck__"
REFERRAL_CACHE_POLICY="no-store"
REFERRAL_REFERRER_POLICY="no-referrer"
REFERRAL_ROUTE_MARKER='<meta name="gatu-route" content="referral-join"'
REFERRAL_RELEASE_CAPABILITY="referral-join-v1"
NOINDEX_POLICY="noindex, nofollow"
CURL_CONNECT_TIMEOUT_SECONDS=5
CURL_MAX_TIME_SECONDS=15

curl_with_deadline() {
	curl --connect-timeout "$CURL_CONNECT_TIMEOUT_SECONDS" --max-time "$CURL_MAX_TIME_SECONDS" "$@"
}

clear_inherited_vite_environment() {
	local variable_name
	while IFS= read -r variable_name; do
		case "$variable_name" in
		VITE_*) unset "$variable_name" ;;
		esac
	done < <(compgen -e)
}

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

verify_caddy_config() {
	local source_config="${REPO}/deploy/Caddyfile"
	local installed_config="/etc/caddy/Caddyfile"

	if [ ! -x /usr/bin/caddy ]; then
		echo "ERROR: /usr/bin/caddy is not installed." >&2
		exit 1
	fi
	if ! /usr/bin/caddy adapt --config "$source_config" --adapter caddyfile >/dev/null; then
		echo "ERROR: repository Caddyfile could not be adapted." >&2
		exit 1
	fi
	if ! cmp -s "$source_config" "$installed_config"; then
		echo "ERROR: installed Caddyfile does not match ${source_config}." >&2
		echo "Install and reload it as an administrator, then rerun this deployment:" >&2
		echo "  sudo /usr/bin/caddy validate --config ${source_config} --adapter caddyfile" >&2
		echo "  sudo /usr/bin/install -m 0644 ${source_config} ${installed_config}" >&2
		echo "  sudo /usr/bin/systemctl reload caddy" >&2
		exit 1
	fi
}

verify_systemd_unit() {
	local source_unit="${REPO}/deploy/gatu.service"
	local installed_unit="/etc/systemd/system/gatu.service"

	if ! cmp -s "$source_unit" "$installed_unit"; then
		echo "ERROR: installed gatu.service does not match ${source_unit}." >&2
		echo "Install the updated unit first:" >&2
		echo "  sudo install -m 0644 ${source_unit} ${installed_unit}" >&2
		echo "  sudo systemctl daemon-reload" >&2
		exit 1
	fi
}

install_referral_uri_guard() {
	local source_guard="${REPO}/deploy/referral-uri-guard.cjs"
	local installed_guard="${SHARED}/referral-uri-guard.cjs"
	local temporary_guard="${SHARED}/.referral-uri-guard.cjs.tmp.$$"

	node --check "$source_guard"
	mkdir -p "$SHARED"
	cp "$source_guard" "$temporary_guard"
	chmod 0644 "$temporary_guard"
	mv -f "$temporary_guard" "$installed_guard"
}

publish_release() {
	local previous_release="$1"
	local release_name="$2"
	local release_commit="$3"
	local release_tmp release_dir current_tmp
	release_tmp="${RELEASES}/.${release_name}.tmp"
	release_dir="${RELEASES}/${release_name}"
	current_tmp="${CURRENT}.tmp"

	test -f apps/terminal/.output/server/index.mjs || {
		echo "ERROR: missing Nitro server output: apps/terminal/.output/server/index.mjs" >&2
		exit 1
	}
	compgen -G "apps/terminal/.output/public/assets/*.js" >/dev/null || {
		echo "ERROR: build output has no client JavaScript assets." >&2
		exit 1
	}
	test -f "apps/terminal/.output/public${SOCIAL_IMAGE_PATH}" || {
		echo "ERROR: build output is missing social image: ${SOCIAL_IMAGE_PATH}" >&2
		exit 1
	}
	verify_chart_build_output "apps/terminal/public" "apps/terminal/.output/public" || exit 1
	mkdir -p "$RELEASES"
	rm -rf "$release_tmp"
	mkdir -p "$release_tmp"
	cp -a apps/terminal/.output/. "$release_tmp"/
	cp deploy/referral-uri-guard.cjs "${release_tmp}/referral-uri-guard.cjs"
	if [ -n "$previous_release" ] && [ -d "${previous_release}/public/assets" ] && [ -d "${release_tmp}/public/assets" ]; then
		echo "Carry forward previous hashed assets from ${previous_release}" >&2
		find "${previous_release}/public/assets" -maxdepth 1 -type f -exec cp -n {} "${release_tmp}/public/assets/" \;
	fi
	printf '%s\n' "$release_commit" > "${release_tmp}/.gatu-release-commit"
	printf '%s\n' "$release_name" > "${release_tmp}/.gatu-release-id"
	printf '%s\n' "$REFERRAL_RELEASE_CAPABILITY" > "${release_tmp}/.gatu-release-capabilities"
	mv "$release_tmp" "$release_dir"

	ln -sfn "$release_dir" "$current_tmp"
	mv -Tf "$current_tmp" "$CURRENT"
	printf '%s\n' "$release_dir"
}

verify_build_metadata() {
	local base_url="$1"
	local tmpdir="$2"
	local expected_commit="${3:-}"
	local expected_release="${4:-}"

	if ! fetch_typed_asset "$base_url" "/build-meta.json" "$tmpdir" "application/json" "Build metadata"; then
		return 1
	fi

	node - "${tmpdir}/body" "$expected_commit" "$expected_release" <<'NODE'
const fs = require("node:fs");
const [file, expectedCommit, expectedRelease] = process.argv.slice(2);
const metadata = JSON.parse(fs.readFileSync(file, "utf8"));

for (const field of ["name", "version", "commit", "release", "builtAt"]) {
	if (typeof metadata[field] !== "string" || metadata[field].length === 0) {
		throw new Error(`Invalid build metadata field: ${field}`);
	}
}
if (expectedCommit && metadata.commit !== expectedCommit) {
	throw new Error(`Expected commit ${expectedCommit}, received ${metadata.commit}`);
}
if (expectedRelease && metadata.release !== expectedRelease) {
	throw new Error(`Expected release ${expectedRelease}, received ${metadata.release}`);
}
NODE
}

verify_release_parity() {
	local first_base_url="$1"
	local second_base_url="$2"
	local expected_commit="$3"
	local expected_release="$4"
	local tmpdir first_metadata second_metadata
	tmpdir="$(mktemp -d)"
	first_metadata="${tmpdir}/first.json"
	second_metadata="${tmpdir}/second.json"

	if ! fetch_typed_asset "$first_base_url" "/build-meta.json" "$tmpdir" "application/json" "Build metadata"; then
		rm -rf "$tmpdir"
		return 1
	fi
	cp "${tmpdir}/body" "$first_metadata"
	if ! fetch_typed_asset "$second_base_url" "/build-meta.json" "$tmpdir" "application/json" "Build metadata"; then
		rm -rf "$tmpdir"
		return 1
	fi
	cp "${tmpdir}/body" "$second_metadata"

	if ! node - "$first_metadata" "$second_metadata" "$expected_commit" "$expected_release" <<'NODE'
const fs = require("node:fs");
const [firstFile, secondFile, expectedCommit, expectedRelease] = process.argv.slice(2);
const first = JSON.parse(fs.readFileSync(firstFile, "utf8"));
const second = JSON.parse(fs.readFileSync(secondFile, "utf8"));

for (const field of ["commit", "release"]) {
	if (first[field] !== second[field]) {
		throw new Error(`Public origins disagree on ${field}: ${first[field]} !== ${second[field]}`);
	}
}
if (first.commit !== expectedCommit || first.release !== expectedRelease) {
	throw new Error(
		`Public origins serve ${first.commit}/${first.release}, expected ${expectedCommit}/${expectedRelease}`,
	);
}
NODE
	then
		rm -rf "$tmpdir"
		return 1
	fi

	rm -rf "$tmpdir"
}

load_release_identity() {
	local release_dir="$1"
	local release_commit_file="${release_dir}/.gatu-release-commit"
	local release_id_file="${release_dir}/.gatu-release-id"
	local legacy_short_commit

	rollback_expected_commit=""
	rollback_expected_release=""
	rollback_require_referral_join="false"
	if [ -z "$release_dir" ] || [ ! -d "$release_dir" ]; then
		return 1
	fi

	rollback_expected_release="$(basename "$release_dir")"
	if [ -f "$release_commit_file" ] && [ -f "$release_id_file" ]; then
		rollback_expected_commit="$(tr -d '\r\n' < "$release_commit_file")"
		if [ "$(tr -d '\r\n' < "$release_id_file")" != "$rollback_expected_release" ]; then
			echo "ERROR: release identity does not match directory ${release_dir}." >&2
			rollback_expected_commit=""
			rollback_expected_release=""
			return 1
		fi
		if grep -Fxq "$REFERRAL_RELEASE_CAPABILITY" "${release_dir}/.gatu-release-capabilities" 2>/dev/null; then
			rollback_require_referral_join="true"
		fi
		return 0
	fi

	# Releases created by the previous deploy script encode the short commit in
	# their directory name. The exact release ID is still sufficient to reject a
	# cached or misrouted new release; resolve the full commit when Git retains it.
	legacy_short_commit="${rollback_expected_release##*-}"
	rollback_expected_commit="$(git rev-parse --verify "${legacy_short_commit}^{commit}" 2>/dev/null || true)"
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

fetch_typed_asset() {
	local base_url="$1"
	local path="$2"
	local tmpdir="$3"
	local expected_type="$4"
	local asset_label="$5"
	local headers="${tmpdir}/headers"
	local body="${tmpdir}/body"
	local content_type

	if ! curl_with_deadline -fsS -D "$headers" -o "$body" "${base_url}${path}"; then
		echo "ERROR: failed to fetch asset ${path}" >&2
		return 1
	fi

	content_type="$(awk 'BEGIN{IGNORECASE=1} /^content-type:/ {print $0; exit}' "$headers")"
	if ! printf '%s' "$content_type" | grep -qi "$expected_type"; then
		echo "ERROR: ${asset_label} ${path} returned unexpected response: ${content_type:-missing content-type}" >&2
		head -c 200 "$body" >&2 || true
		echo >&2
		return 1
	fi
}

fetch_js_asset() {
	fetch_typed_asset "$1" "$2" "$3" "javascript" "JavaScript asset"
}

verify_single_header_value() {
	local headers="$1"
	local header_name="$2"
	local expected_value="$3"
	local asset_label="$4"

	node - "$headers" "$header_name" "$expected_value" "$asset_label" <<'NODE'
const fs = require("node:fs");
const [file, headerName, expectedValue, assetLabel] = process.argv.slice(2);
const prefix = `${headerName.toLowerCase()}:`;
const values = fs
	.readFileSync(file, "utf8")
	.split(/\r?\n/)
	.filter((line) => line.toLowerCase().startsWith(prefix))
	.map((line) => line.slice(line.indexOf(":") + 1).trim());

if (values.length !== 1 || values[0].toLowerCase() !== expectedValue.toLowerCase()) {
	throw new Error(
		`${assetLabel} must return exactly one ${headerName}: ${expectedValue}; received ${JSON.stringify(values)}`,
	);
}
NODE
}

verify_exact_http_status() {
	local headers="$1"
	local expected_status="$2"
	local asset_label="$3"

	node - "$headers" "$expected_status" "$asset_label" <<'NODE'
const fs = require("node:fs");
const [file, expectedStatus, assetLabel] = process.argv.slice(2);
const statuses = fs
	.readFileSync(file, "utf8")
	.split(/\r?\n/)
	.map((line) => /^HTTP\/\S+\s+(\d{3})\b/i.exec(line)?.[1])
	.filter(Boolean);

if (statuses.length === 0 || statuses.at(-1) !== expectedStatus) {
	throw new Error(`${assetLabel} must return HTTP ${expectedStatus}; received ${JSON.stringify(statuses)}`);
}
NODE
}

fetch_revalidated_asset() {
	local base_url="$1"
	local path="$2"
	local tmpdir="$3"
	local expected_type="$4"
	local asset_label="$5"

	if ! fetch_typed_asset "$base_url" "$path" "$tmpdir" "$expected_type" "$asset_label"; then
		return 1
	fi
	verify_single_header_value "${tmpdir}/headers" "cache-control" "$CHART_CACHE_POLICY" "$asset_label"
}

verify_referral_deep_link() {
	local base_url="$1"
	local tmpdir="$2"
	local html_file="${tmpdir}/referral-deep-link.html"
	local entry_asset

	if ! fetch_typed_asset "$base_url" "$REFERRAL_DEEP_LINK_PATH" "$tmpdir" "text/html" "Referral deep link"; then
		return 1
	fi
	verify_exact_http_status "${tmpdir}/headers" "200" "Referral deep link" || return 1
	verify_single_header_value "${tmpdir}/headers" "cache-control" "$REFERRAL_CACHE_POLICY" "Referral deep link" || return 1
	verify_single_header_value "${tmpdir}/headers" "referrer-policy" "$REFERRAL_REFERRER_POLICY" "Referral deep link" || return 1
	verify_single_header_value "${tmpdir}/headers" "x-robots-tag" "$NOINDEX_POLICY" "Referral deep link" || return 1
	cp "${tmpdir}/body" "$html_file"
	if ! grep -aFq "$REFERRAL_ROUTE_MARKER" "$html_file"; then
		echo "ERROR: referral deep link did not render the referral route marker." >&2
		return 1
	fi
	entry_asset="$(extract_first_js_asset "$html_file" || true)"
	if [ -z "$entry_asset" ]; then
		echo "ERROR: referral deep link did not reference a client JavaScript asset." >&2
		return 1
	fi
	fetch_js_asset "$base_url" "$entry_asset" "$tmpdir"
}

verify_malformed_referral_deep_link() {
	local base_url="$1"
	local tmpdir="$2"
	local malformed_path="/join/%"
	local status

	status="$(curl_with_deadline --path-as-is -sS -D "${tmpdir}/headers" -o "${tmpdir}/body" -w '%{http_code}' "${base_url}${malformed_path}")" || true
	if [ "$status" != "404" ]; then
		echo "ERROR: malformed referral deep link must return 404, received ${status:-request failure}." >&2
		return 1
	fi
	verify_single_header_value "${tmpdir}/headers" "cache-control" "$REFERRAL_CACHE_POLICY" "Malformed referral deep link" || return 1
	verify_single_header_value "${tmpdir}/headers" "referrer-policy" "$REFERRAL_REFERRER_POLICY" "Malformed referral deep link" || return 1
	verify_single_header_value "${tmpdir}/headers" "x-robots-tag" "$NOINDEX_POLICY" "Malformed referral deep link"
}

verify_sitewide_noindex() {
	local base_url="$1"
	local tmpdir="$2"

	if ! fetch_typed_asset "$base_url" "/builders-perp" "$tmpdir" "text/html" "Testnet application page"; then
		return 1
	fi
	verify_single_header_value "${tmpdir}/headers" "x-robots-tag" "$NOINDEX_POLICY" "Testnet application page"
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

extract_initial_chart_assets() {
	local file="$1"
	node - "$file" <<'NODE'
const fs = require("node:fs");
const [file] = process.argv.slice(2);
const text = fs.readFileSync(file, "utf8");
const matches = [...new Set(text.match(/bundles\/[A-Za-z0-9_.-]+\.(?:js|css)/g) || [])]
	.map((asset) => asset.replace("__LANG__", "en"));

if (matches.length === 0) {
	throw new Error("TradingView entry does not reference any initial JavaScript or CSS bundles.");
}
for (const asset of matches) process.stdout.write(`${asset}\n`);
NODE
}

verify_chart_build_output() {
	local source_public_root="$1"
	local output_public_root="$2"

	node deploy/verify-chart-build.mjs "$source_public_root" "$output_public_root" "$CHART_LIBRARY_MANIFEST_PATH"
}

verify_missing_chart_asset() {
	local base_url="$1"
	local tmpdir="$2"
	local missing_path="${CHART_LIBRARY_PATH}/bundles/__gatu_healthcheck_missing__.js"
	local status

	status="$(curl_with_deadline -sS -D "${tmpdir}/headers" -o "${tmpdir}/body" -w '%{http_code}' "${base_url}${missing_path}")" || {
		echo "ERROR: failed to request expected-missing TradingView asset ${missing_path}" >&2
		return 1
	}
	if [ "$status" != "404" ]; then
		echo "ERROR: expected ${missing_path} to return 404, received ${status}." >&2
		return 1
	fi
	if grep -Eqi '<!doctype[[:space:]]+html|<html([[:space:]>])' "${tmpdir}/body"; then
		echo "ERROR: missing TradingView asset returned an HTML application fallback." >&2
		return 1
	fi
}

verify_chart_delivery() {
	local base_url="$1"
	local tmpdir="$2"
	local chart_entry="${tmpdir}/charting_library.js"
	local chart_assets asset expected_type asset_label

	if ! fetch_revalidated_asset "$base_url" "${CHART_LIBRARY_PATH}/charting_library.js" "$tmpdir" "javascript" "TradingView entry"; then
		return 1
	fi
	cp "${tmpdir}/body" "$chart_entry"
	if ! fetch_revalidated_asset "$base_url" "${CHART_LIBRARY_PATH}/sameorigin.html" "$tmpdir" "text/html" "TradingView same-origin document"; then
		return 1
	fi
	for chart_theme_path in $CHART_THEME_PATHS; do
		if ! fetch_revalidated_asset "$base_url" "$chart_theme_path" "$tmpdir" "text/css" "TradingView theme stylesheet (${chart_theme_path})"; then
			return 1
		fi
	done

	chart_assets="$(extract_initial_chart_assets "$chart_entry")" || return 1
	while IFS= read -r asset; do
		case "$asset" in
			*.js)
				expected_type="javascript"
				asset_label="TradingView initial JavaScript bundle"
				;;
			*.css)
				expected_type="text/css"
				asset_label="TradingView initial stylesheet bundle"
				;;
			*)
				echo "ERROR: unsupported initial TradingView asset type: ${asset}" >&2
				return 1
				;;
		esac
		if ! fetch_revalidated_asset "$base_url" "${CHART_LIBRARY_PATH}/${asset}" "$tmpdir" "$expected_type" "$asset_label"; then
			return 1
		fi
	done <<< "$chart_assets"

	verify_missing_chart_asset "$base_url" "$tmpdir"
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

extract_first_js_asset() {
	local file="$1"
	node - "$file" <<'NODE'
const fs = require("node:fs");
const [file] = process.argv.slice(2);
const text = fs.readFileSync(file, "utf8");
const match = text.match(/\/?assets\/[^"'<>\s]+\.js/);
if (!match) process.exit(1);
process.stdout.write(match[0].startsWith("/") ? match[0] : `/${match[0]}`);
NODE
}

health_check() {
	local port="$1"
	local expected_commit="${2:-}"
	local expected_release="${3:-}"
	local require_chart_delivery="${4:-true}"
	local require_referral_join="${5:-true}"
	local base_url="http://127.0.0.1:${port}"
	local tmpdir html_file trade_file entry_asset trade_asset
	tmpdir="$(mktemp -d)"
	html_file="${tmpdir}/builders-perp.html"
	trade_file="${tmpdir}/trade-terminal-page.js"

	for _ in $(seq 1 30); do
		if curl_with_deadline -fsS -o "$html_file" "${base_url}/builders-perp"; then
			entry_asset="$(extract_first_js_asset "$html_file" || true)"
			trade_asset="$(extract_asset "$html_file" '/assets/trade-terminal-page-[^"'"'"'"'"'"'"'"'"'<>\s]+\.js' || true)"
			if [ -n "$entry_asset" ] && [ -n "$trade_asset" ]; then
				if fetch_referenced_js_assets "$base_url" "$html_file" "$tmpdir"; then
					if ! curl_with_deadline -fsS -o "$trade_file" "${base_url}${trade_asset}"; then
						rm -rf "$tmpdir"
						return 1
					fi
					if fetch_referenced_js_assets "$base_url" "$trade_file" "$tmpdir" &&
						fetch_typed_asset "$base_url" "$SOCIAL_IMAGE_PATH" "$tmpdir" "image/png" "Social image" &&
						verify_build_metadata "$base_url" "$tmpdir" "$expected_commit" "$expected_release" &&
							{ [ "$require_referral_join" != "true" ] || verify_referral_deep_link "$base_url" "$tmpdir"; } &&
							{ [ "$require_referral_join" != "true" ] || verify_malformed_referral_deep_link "$base_url" "$tmpdir"; }; then
						if [ "$require_chart_delivery" = "true" ] && ! verify_chart_delivery "$base_url" "$tmpdir"; then
							rm -rf "$tmpdir"
							return 1
						fi
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

edge_health_check() {
	local base_url="$1"
	local expected_commit="$2"
	local expected_release="$3"
	local require_sitewide_noindex="${4:-false}"
	local require_referral_join="${5:-true}"
	local tmpdir

	for _ in $(seq 1 30); do
		tmpdir="$(mktemp -d)"
		if verify_build_metadata "$base_url" "$tmpdir" "$expected_commit" "$expected_release" &&
			verify_chart_delivery "$base_url" "$tmpdir" &&
			{ [ "$require_referral_join" != "true" ] || verify_referral_deep_link "$base_url" "$tmpdir"; } &&
			{ [ "$require_referral_join" != "true" ] || verify_malformed_referral_deep_link "$base_url" "$tmpdir"; } &&
			{ [ "$require_sitewide_noindex" != "true" ] || verify_sitewide_noindex "$base_url" "$tmpdir"; }; then
			rm -rf "$tmpdir"
			return 0
		fi
		rm -rf "$tmpdir"
		sleep 1
	done
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
install_referral_uri_guard
verify_systemd_unit
verify_caddy_config

echo "==> [3/8] Validate and inject production environment"
test -f "$SHARED/.env.local" || { echo "ERROR: missing $SHARED/.env.local"; exit 1; }
test -f "$SHARED/.env.runtime" || { echo "ERROR: missing $SHARED/.env.runtime"; exit 1; }
clear_inherited_vite_environment
node deploy/validate-production-env.mjs "$SHARED/.env.local" "$SHARED/.env.runtime" apps/terminal
cp "$SHARED/.env.local" apps/terminal/.env.local

echo "==> [4/8] Install deps (frozen lockfile)"
pnpm install --frozen-lockfile

echo "==> [5/8] Build Nitro node-server output (8GB heap)"
build_commit="$(git rev-parse HEAD)"
build_commit_short="$(git rev-parse --short HEAD)"
release_name="$(date -u +%Y%m%d%H%M%S)-${build_commit_short}"
build_time="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
GATU_BUILD_SHA="$build_commit" GATU_RELEASE_ID="$release_name" GATU_BUILD_TIME="$build_time" NITRO_PRESET=node-server pnpm build

echo "==> [6/8] Publish immutable release"
previous_release="$(readlink -f "$CURRENT" 2>/dev/null || true)"
rollback_expected_commit=""
rollback_expected_release=""
rollback_require_referral_join="false"
load_release_identity "$previous_release" || true
new_release="$(publish_release "$previous_release" "$release_name" "$build_commit")"
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
GATU_MAINNET_PUBLIC_BASE_URL="${GATU_MAINNET_PUBLIC_BASE_URL:-https://app.gatu.ai}"
GATU_TESTNET_PUBLIC_BASE_URL="${GATU_TESTNET_PUBLIC_BASE_URL:-https://testnet.gatu.ai}"
GATU_MAINNET_PUBLIC_BASE_URL="${GATU_MAINNET_PUBLIC_BASE_URL%/}"
GATU_TESTNET_PUBLIC_BASE_URL="${GATU_TESTNET_PUBLIC_BASE_URL%/}"
if [ "$GATU_MAINNET_PUBLIC_BASE_URL" = "$GATU_TESTNET_PUBLIC_BASE_URL" ]; then
	echo "ERROR: mainnet and testnet public base URLs must be distinct." >&2
	exit 1
fi
if health_check "$PORT" "$build_commit" "$release_name" &&
	edge_health_check "$GATU_MAINNET_PUBLIC_BASE_URL" "$build_commit" "$release_name" &&
	edge_health_check "$GATU_TESTNET_PUBLIC_BASE_URL" "$build_commit" "$release_name" true &&
	verify_release_parity "$GATU_MAINNET_PUBLIC_BASE_URL" "$GATU_TESTNET_PUBLIC_BASE_URL" "$build_commit" "$release_name"; then
	cleanup_old_releases
	echo "OK — gatu serving release $(basename "$new_release") on 127.0.0.1:${PORT}, ${GATU_MAINNET_PUBLIC_BASE_URL}, and ${GATU_TESTNET_PUBLIC_BASE_URL} (commit $(git rev-parse --short HEAD))"
	exit 0
fi

echo "HEALTH CHECK FAILED — attempting rollback." >&2
if [ -n "$rollback_expected_release" ] &&
	rollback_to_release "$previous_release" &&
	health_check "$PORT" "$rollback_expected_commit" "$rollback_expected_release" false "$rollback_require_referral_join" &&
	edge_health_check "$GATU_MAINNET_PUBLIC_BASE_URL" "$rollback_expected_commit" "$rollback_expected_release" false "$rollback_require_referral_join" &&
	edge_health_check "$GATU_TESTNET_PUBLIC_BASE_URL" "$rollback_expected_commit" "$rollback_expected_release" true "$rollback_require_referral_join" &&
	verify_release_parity "$GATU_MAINNET_PUBLIC_BASE_URL" "$GATU_TESTNET_PUBLIC_BASE_URL" "$rollback_expected_commit" "$rollback_expected_release"; then
	echo "ROLLBACK OK — restored $(basename "$previous_release"). Inspect: journalctl -u gatu -n 100" >&2
	exit 1
fi

echo "HEALTH CHECK FAILED — inspect: journalctl -u gatu -n 50" >&2
exit 1
