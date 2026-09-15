#!/usr/bin/env bash
# Build & restart gatu on a single EC2 host.
# Run as the `gatu` user:  bash /opt/gatu/repo/deploy/deploy.sh [main]
#
# Idempotent: discards tracked local changes, syncs to origin/main, installs,
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
DEPLOY_MODE="${2:-deploy}"
CANDIDATE_ID="${3:-}"
CANDIDATES="${SHARED}/mobile-sync-candidates"
SOCIAL_IMAGE_PATH="/og-terminal-1200x630.png"
CHART_LIBRARY_PATH="/charting_library"
CHART_THEME_PATHS="/tradingview-theme-dark.css /tradingview-theme-light.css"
CHART_LIBRARY_MANIFEST_PATH="${REPO}/deploy/manifests/tradingview-charting-library.json"
CHART_CACHE_POLICY="public, max-age=0, must-revalidate"
REFERRAL_DEEP_LINK_PATH="/join/__gatu_healthcheck__"
REFERRAL_CACHE_POLICY="no-store"
REFERRAL_REFERRER_POLICY="no-referrer"
REFERRAL_ROUTE_MARKER='<meta name="gatu-route" content="referral-join"'
REFERRAL_RELEASE_CAPABILITY="referral-join-v1"
MOBILE_SYNC_BASELINE="${SHARED}/mobile-sync-safe-release"
NOINDEX_POLICY="noindex, nofollow"
MAINNET_API_ORIGIN="https://api.hyperliquid.xyz"
TESTNET_API_ORIGIN="https://api.hyperliquid-testnet.xyz"
CURL_CONNECT_TIMEOUT_SECONDS=5
CURL_MAX_TIME_SECONDS=15
DEPLOY_LOCK_PATH="${SHARED}/deploy.lock"

sync_and_reexec_deploy() {
	local target_sha current_sha lock_target expected_lock_target untracked_files

	if [ "$#" -gt 3 ] || [[ ! "$DEPLOY_MODE" =~ ^(deploy|prepare|promote)$ ]] || { [ "$DEPLOY_MODE" = "promote" ] && [[ ! "$CANDIDATE_ID" =~ ^[A-Za-z0-9][A-Za-z0-9_-]{0,100}$ ]]; } || { [ "$DEPLOY_MODE" != "promote" ] && [ -n "$CANDIDATE_ID" ]; }; then
		echo "ERROR: usage: deploy.sh [main [deploy|prepare|promote <candidate-id>]]" >&2
		exit 64
	fi
	if [ "$BRANCH" != "main" ]; then
		echo "ERROR: production deployments may only synchronize origin/main; received ${BRANCH}." >&2
		exit 64
	fi
	if ! git check-ref-format --branch "$BRANCH" >/dev/null 2>&1; then
		echo "ERROR: invalid deployment branch: ${BRANCH}" >&2
		exit 64
	fi
	if [ ! -d "$REPO" ] || [ ! -d "$SHARED" ]; then
		echo "ERROR: deployment repository or shared directory is missing." >&2
		exit 1
	fi

	if [ -z "${GATU_DEPLOY_SYNCED_SHA:-}" ]; then
		if ! command -v flock >/dev/null 2>&1; then
			echo "ERROR: flock is required to serialize deployments." >&2
			exit 1
		fi
		exec 9>"$DEPLOY_LOCK_PATH"
		if ! flock -n 9; then
			echo "ERROR: another deployment is already running (lock: ${DEPLOY_LOCK_PATH})." >&2
			exit 75
		fi
		export GATU_DEPLOY_LOCK_FD=9

		echo "==> [1/8] Sync repo to origin/${BRANCH}"
		cd "$REPO"
		git fetch --prune origin
		target_sha="$(git rev-parse --verify "refs/remotes/origin/${BRANCH}^{commit}")" || {
			echo "ERROR: origin/${BRANCH} does not resolve to a commit." >&2
			exit 1
		}
		git reset --hard "$target_sha"
		/bin/bash -n "$REPO/deploy/deploy.sh"
		export GATU_DEPLOY_SYNCED_SHA="$target_sha"
		exec /bin/bash "$REPO/deploy/deploy.sh" "$@"
	fi

	if [[ ! "$GATU_DEPLOY_SYNCED_SHA" =~ ^[0-9a-f]{40}$ ]]; then
		echo "ERROR: invalid synchronized deployment commit marker." >&2
		exit 1
	fi
	if [ "${GATU_DEPLOY_LOCK_FD:-}" != "9" ]; then
		echo "ERROR: synchronized deployment did not inherit its lock descriptor." >&2
		exit 1
	fi
	lock_target="$(readlink -f "/proc/$$/fd/9" 2>/dev/null || true)"
	expected_lock_target="$(readlink -f "$DEPLOY_LOCK_PATH" 2>/dev/null || true)"
	if [ -z "$lock_target" ] || [ "$lock_target" != "$expected_lock_target" ]; then
		echo "ERROR: synchronized deployment lock descriptor does not reference ${DEPLOY_LOCK_PATH}." >&2
		exit 1
	fi
	if ! flock -n 9; then
		echo "ERROR: synchronized deployment no longer owns its deployment lock." >&2
		exit 1
	fi
	cd "$REPO"
	current_sha="$(git rev-parse HEAD)"
	if [ "$current_sha" != "$GATU_DEPLOY_SYNCED_SHA" ]; then
		echo "ERROR: repository HEAD changed between deployment synchronization and re-exec." >&2
		exit 1
	fi
	if ! git diff --quiet HEAD --; then
		echo "ERROR: tracked repository files changed after deployment synchronization." >&2
		exit 1
	fi
	untracked_files="$(git ls-files --others --exclude-standard)"
	if [ -n "$untracked_files" ]; then
		echo "ERROR: nonignored untracked repository files remain after deployment synchronization:" >&2
		printf '%s\n' "$untracked_files" >&2
		exit 1
	fi
}

curl_with_deadline() {
	curl -q --connect-timeout "$CURL_CONNECT_TIMEOUT_SECONDS" --max-time "$CURL_MAX_TIME_SECONDS" "$@"
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
	if ! node "$REPO/deploy/validate-caddy-forwarded-headers.mjs" "$source_config" /usr/bin/caddy; then
		echo "ERROR: repository Caddyfile violates the client IP forwarding contract." >&2
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

systemctl_show_property() {
	/usr/bin/systemctl show "--property=$1" --value gatu.service
}

verify_loaded_systemd_unit() {
	local load_state fragment_path drop_in_paths need_daemon_reload working_directory exec_start

	if ! load_state="$(systemctl_show_property LoadState)" || [ "$load_state" != "loaded" ]; then
		echo "ERROR: systemd has not loaded gatu.service." >&2
		exit 1
	fi
	if ! fragment_path="$(systemctl_show_property FragmentPath)" || [ "$fragment_path" != "/etc/systemd/system/gatu.service" ]; then
		echo "ERROR: systemd loaded gatu.service from ${fragment_path:-<unknown>}, expected /etc/systemd/system/gatu.service." >&2
		exit 1
	fi
	if ! drop_in_paths="$(systemctl_show_property DropInPaths)" || [ -n "$drop_in_paths" ]; then
		echo "ERROR: gatu.service has unsupported systemd drop-ins: ${drop_in_paths:-<unknown>}." >&2
		exit 1
	fi
	if ! need_daemon_reload="$(systemctl_show_property NeedDaemonReload)" || [ "$need_daemon_reload" != "no" ]; then
		echo "ERROR: systemd has not loaded the installed gatu.service; run sudo systemctl daemon-reload." >&2
		exit 1
	fi
	if ! working_directory="$(systemctl_show_property WorkingDirectory)" || [ "$working_directory" != "$CURRENT" ]; then
		echo "ERROR: loaded gatu.service uses WorkingDirectory=${working_directory:-<unknown>}, expected ${CURRENT}." >&2
		exit 1
	fi
	if ! exec_start="$(systemctl_show_property ExecStart)"; then
		echo "ERROR: unable to inspect the loaded gatu.service ExecStart." >&2
		exit 1
	fi
	if [[ "$exec_start" != *"path=/bin/sh"* ||
		"$exec_start" != *"argv[]=/bin/sh -ec"* ||
		"$exec_start" != *".gatu-release-commit"* ||
		"$exec_start" != *".gatu-release-id"* ||
		"$exec_start" != *".gatu-release-capabilities"* ||
		"$exec_start" != *"referral-join-v1"* ||
		"$exec_start" != *"--require=./referral-uri-guard.cjs server/index.mjs"* ||
		"$exec_start" == *"/opt/gatu/shared/referral-uri-guard.cjs"* ]]; then
		echo "ERROR: loaded gatu.service ExecStart does not enforce the immutable release referral guard." >&2
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
	verify_loaded_systemd_unit
}

verify_referral_uri_guard() {
	node --check "${REPO}/deploy/referral-uri-guard.cjs"
}

authorize_mobile_sync_candidate() {
	node "${REPO}/deploy/mobile-sync-candidate.mjs" authorize "$1" "$CANDIDATES" "$REPO" "$SHARED" "$2" "$DEPLOY_MODE"
}

publish_release() {
	set -e
	local previous_release="$1"
	local release_name="$2"
	local release_commit="$3"
	local release_tmp release_dir current_tmp
	release_tmp="${RELEASES}/.${release_name}.tmp"
	release_dir="${RELEASES}/${release_name}"
	current_tmp="${CURRENT}.tmp"

	local candidate="${CANDIDATES}/${release_name}"
	local authorization
	authorization="$(authorize_mobile_sync_candidate "$candidate" "$release_commit")" || exit 1
	node "${REPO}/deploy/mobile-sync-release.mjs" check "${candidate}/artifact" "$(node -p 'JSON.parse(process.argv[1]).mobileSync.createAndReveal' "$authorization")" "$(node -p 'JSON.parse(process.argv[1]).mobileSync.importFromQr' "$authorization")" "$release_commit" "$release_name" >&2 || exit 1
	[ "$(authorize_mobile_sync_candidate "$candidate" "$release_commit")" = "$authorization" ] || exit 1
	if [ -e "$release_dir" ] || [ -L "$release_dir" ]; then
		node "${REPO}/deploy/mobile-sync-candidate.mjs" reuse "$release_dir" "$RELEASES" "${SHARED}/mobile-sync-publications" "$authorization" >&2 || exit 1
	else
		mkdir -p "$RELEASES"
		rm -rf "$release_tmp"
		mkdir -p "$release_tmp"
		cp -a "${candidate}/artifact/." "$release_tmp"/ || exit 1
		if [ -n "$previous_release" ] && [ -d "${previous_release}/public/assets" ] && [ -d "${release_tmp}/public/assets" ]; then
			echo "Carry forward previous hashed assets from ${previous_release}" >&2
			find "${previous_release}/public/assets" -maxdepth 1 -type f -exec cp --update=none {} "${release_tmp}/public/assets/" \;
		fi
		printf '%s\n' "$release_commit" > "${release_tmp}/.gatu-release-commit"
		printf '%s\n' "$release_name" > "${release_tmp}/.gatu-release-id"
		printf '%s\n' "$REFERRAL_RELEASE_CAPABILITY" > "${release_tmp}/.gatu-release-capabilities"
		node "${REPO}/deploy/mobile-sync-release.mjs" verify "$release_tmp" >&2 || exit 1
		[ "$(authorize_mobile_sync_candidate "$candidate" "$release_commit")" = "$authorization" ] || exit 1
		node "${REPO}/deploy/mobile-sync-candidate.mjs" record "${SHARED}/mobile-sync-publications" "$authorization" >&2 || exit 1
		mv "$release_tmp" "$release_dir"
	fi
	[ "$(authorize_mobile_sync_candidate "$candidate" "$release_commit")" = "$authorization" ] || exit 1
	node "${REPO}/deploy/mobile-sync-candidate.mjs" reuse "$release_dir" "$RELEASES" "${SHARED}/mobile-sync-publications" "$authorization" >&2 || exit 1

	prepare_mobile_sync_rollback "$previous_release" || exit 1
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

verify_mobile_sync_edge_block() {
	local origin
	grep -Fq 'respond @mobile_sync_block 503' "${REPO}/deploy/Caddyfile" || return 1
	for origin in https://app.gatu.ai https://testnet.gatu.ai; do
		node "${REPO}/deploy/mobile-sync-release.mjs" block "$origin" >&2 || return 1
	done
}

close_mobile_sync_edge() {
	rm -f "${CURRENT%/*}/mobile-sync-edge-ready"
}

open_mobile_sync_edge() {
	local marker="${CURRENT%/*}/mobile-sync-edge-ready" temporary
	temporary="$(mktemp "${marker}.XXXXXX")" || return 1
	printf '%s\n' "$1" > "$temporary" && chmod 0644 "$temporary" && mv -f "$temporary" "$marker" || {
		rm -f "$temporary"
		return 1
	}
}

prepare_mobile_sync_rollback() {
	local previous="$1" baseline
	baseline="$(readlink -f "$MOBILE_SYNC_BASELINE" 2>/dev/null || true)"
	if ! { [ -n "$baseline" ] && node "${REPO}/deploy/mobile-sync-release.mjs" verify "$baseline" >&2; }; then
		if [ -n "$previous" ] && node "${REPO}/deploy/mobile-sync-release.mjs" verify "$previous" >&2; then
			ln -sfn "$previous" "${MOBILE_SYNC_BASELINE}.tmp"
			mv -Tf "${MOBILE_SYNC_BASELINE}.tmp" "$MOBILE_SYNC_BASELINE"
		fi
	fi
	close_mobile_sync_edge || return 1
	verify_mobile_sync_edge_block || {
		echo "ERROR: ticket edge could not be closed; refusing release switch." >&2
		return 1
	}
}

verify_geo_provider() {
	local port="$1"
	local base_url="http://127.0.0.1:${port}"
	local tmpdir status
	tmpdir="$(mktemp -d)"

	# 8.8.8.8 is a stable, public United States address. A 200 verdict proves the release
	# mounts /api/geo, resolves the forwarded client IP and holds a working IPdata key.
	if ! status="$(curl_with_deadline -sS -H "X-Forwarded-For: 8.8.8.8" -H "Accept: application/json" -D "${tmpdir}/headers" -o "${tmpdir}/body" -w "%{http_code}" "${base_url}/api/geo")"; then
		echo "ERROR: failed to request /api/geo from the Node upstream." >&2
		rm -rf "$tmpdir"
		return 1
	fi
	if [ "$status" != "200" ]; then
		echo "ERROR: /api/geo returned ${status}; the IPdata key or provider is not working: $(head -c 200 "${tmpdir}/body")" >&2
		rm -rf "$tmpdir"
		return 1
	fi
	if ! node - "${tmpdir}/body" <<'NODE'
const fs = require("node:fs");
const verdict = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (verdict.country !== "US" || typeof verdict.tradeRestricted !== "boolean" || typeof verdict.proxy !== "boolean") {
	throw new Error(`Unexpected geo verdict for 8.8.8.8: ${JSON.stringify(verdict)}`);
}
NODE
	then
		rm -rf "$tmpdir"
		return 1
	fi
	rm -rf "$tmpdir"
}

verify_mobile_sync_health() {
	local release_dir="$1" port="$2" origin
	close_mobile_sync_edge || return 1
	for origin in https://app.gatu.ai https://testnet.gatu.ai; do
		node "${REPO}/deploy/mobile-sync-release.mjs" probe "$release_dir" "http://127.0.0.1:${port}" "$origin" node || return 1
	done
	open_mobile_sync_edge "$release_dir" || return 1
	for origin in https://app.gatu.ai https://testnet.gatu.ai; do
		node "${REPO}/deploy/mobile-sync-release.mjs" probe "$release_dir" "$origin" "$origin" || {
			close_mobile_sync_edge
			return 1
		}
	done
}

verify_mobile_sync_rollback_health() {
	local release_dir="$1" port="$2"
	if node "${REPO}/deploy/mobile-sync-release.mjs" verify "$release_dir" >&2; then
		verify_mobile_sync_health "$release_dir" "$port"
	else
		close_mobile_sync_edge && verify_mobile_sync_edge_block
	fi
}

pin_mobile_sync_baseline() {
	local candidate="$1"
	if node "${REPO}/deploy/mobile-sync-release.mjs" verify "$candidate" >&2; then
		ln -sfn "$candidate" "${MOBILE_SYNC_BASELINE}.tmp"
		mv -Tf "${MOBILE_SYNC_BASELINE}.tmp" "$MOBILE_SYNC_BASELINE"
	fi
}

rollback_to_release() {
	local previous="$1" baseline
	close_mobile_sync_edge || return 1
	verify_mobile_sync_edge_block || return 1
	baseline="$(readlink -f "$MOBILE_SYNC_BASELINE" 2>/dev/null || true)"
	if [ -n "$baseline" ] && node "${REPO}/deploy/mobile-sync-release.mjs" verify "$baseline" >&2; then
		previous="$baseline"
	fi
	if [ -z "$previous" ] || [ ! -d "$previous" ]; then return 1; fi
	load_release_identity "$previous" || return 1
	previous_release="$previous"
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

verify_upstream_malformed_referral_deep_link() {
	local base_url="$1"
	local tmpdir="$2"
	local malformed_path="/join/%"
	local status curl_status

	if status="$(curl_with_deadline --http1.1 --path-as-is -sS -D "${tmpdir}/headers" -o "${tmpdir}/body" -w '%{http_code}' "${base_url}${malformed_path}")"; then
		:
	else
		curl_status=$?
		echo "ERROR: failed to request malformed referral deep link from the Node upstream (curl ${curl_status})." >&2
		return 1
	fi
	if [ "$status" != "404" ]; then
		echo "ERROR: Node upstream must return 404 for a malformed referral deep link, received ${status}." >&2
		return 1
	fi
	verify_single_header_value "${tmpdir}/headers" "cache-control" "$REFERRAL_CACHE_POLICY" "Malformed referral deep link" || return 1
	verify_single_header_value "${tmpdir}/headers" "referrer-policy" "$REFERRAL_REFERRER_POLICY" "Malformed referral deep link" || return 1
	verify_single_header_value "${tmpdir}/headers" "x-robots-tag" "$NOINDEX_POLICY" "Malformed referral deep link"
}

verify_edge_rejects_malformed_referral_deep_link() {
	local base_url="$1"
	local tmpdir="$2"
	local malformed_path="/join/%"
	local status curl_status

	if status="$(curl_with_deadline --http1.1 --path-as-is -sS -o "${tmpdir}/body" -w '%{http_code}' "${base_url}${malformed_path}")"; then
		:
	else
		curl_status=$?
		echo "ERROR: failed to verify the public edge rejection for a malformed referral deep link (curl ${curl_status})." >&2
		return 1
	fi
	if [ "$status" != "400" ]; then
		echo "ERROR: public edge must reject a malformed referral deep link with 400, received ${status}." >&2
		return 1
	fi
	if grep -Eqi '<!doctype[[:space:]]+html|<html([[:space:]>])' "${tmpdir}/body"; then
		echo "ERROR: public edge returned an HTML application fallback for a malformed referral deep link." >&2
		return 1
	fi
}

verify_sitewide_noindex() {
	local base_url="$1"
	local tmpdir="$2"

	if ! fetch_typed_asset "$base_url" "/builders-perp" "$tmpdir" "text/html" "Testnet application page"; then
		return 1
	fi
	verify_single_header_value "${tmpdir}/headers" "x-robots-tag" "$NOINDEX_POLICY" "Testnet application page"
}

verify_api_preconnect_header() {
	local headers="$1"
	local expected_origin="$2"
	local forbidden_origin="$3"
	local asset_label="$4"
	local mode="$5"

	node - "$headers" "$expected_origin" "$forbidden_origin" "$asset_label" "$mode" <<'NODE'
const fs = require("node:fs");
const [file, expectedOrigin, forbiddenOrigin, assetLabel, mode] = process.argv.slice(2);
const expectedValue = `<${expectedOrigin}>; rel=preconnect; crossorigin=anonymous`;
const linkContext = "https://link-context.invalid/";
const normalizeHostname = (url) =>
	new URL(url, linkContext).hostname.toLowerCase().replace(/\.+$/, "");
const expectedHostname = normalizeHostname(expectedOrigin);
const forbiddenHostname = normalizeHostname(forbiddenOrigin);
const apiHostnames = new Set([expectedHostname, forbiddenHostname]);
const apiLinks = fs
	.readFileSync(file, "utf8")
	.split(/\r?\n/)
	.filter((line) => line.toLowerCase().startsWith("link:"))
	.flatMap((line) => line.slice(line.indexOf(":") + 1).split(/,(?=\s*<)/))
	.map((value) => value.trim())
	.flatMap((value) => {
		const target = /^<([^>]+)>/.exec(value)?.[1];
		if (!target) return [];
		try {
			const hostname = normalizeHostname(target);
			return apiHostnames.has(hostname) ? [{ hostname, value }] : [];
		} catch {
			return [];
		}
	});

if (mode === "required") {
	if (apiLinks.length !== 1 || apiLinks[0].value.toLowerCase() !== expectedValue.toLowerCase()) {
		throw new Error(`${assetLabel} must return exactly one Link: ${expectedValue}; received ${JSON.stringify(apiLinks)}`);
	}
	if (apiLinks.some(({ hostname }) => hostname === forbiddenHostname)) {
		throw new Error(`${assetLabel} exposed the wrong-network API origin ${forbiddenOrigin}`);
	}
} else if (mode === "absent") {
	if (apiLinks.length !== 0) {
		throw new Error(`${assetLabel} must not return a Hyperliquid API Link; received ${JSON.stringify(apiLinks)}`);
	}
} else {
	throw new Error(`Unknown API preconnect verification mode: ${mode}`);
}
NODE
}

verify_trade_api_resource_hints() {
	local base_url="$1"
	local tmpdir="$2"
	local is_testnet="$3"
	local expected_origin="$MAINNET_API_ORIGIN"
	local forbidden_origin="$TESTNET_API_ORIGIN"
	local path
	local asset_label

	if [ "$is_testnet" = "true" ]; then
		expected_origin="$TESTNET_API_ORIGIN"
		forbidden_origin="$MAINNET_API_ORIGIN"
	fi
	for path in "/trade/HYPE" "/perp" "/spot" "/builders-perp/hyna"; do
		asset_label="Trade API resource hint (${path})"
		if ! fetch_typed_asset "$base_url" "$path" "$tmpdir" "text/html" "$asset_label"; then
			return 1
		fi
		verify_exact_http_status "${tmpdir}/headers" "200" "$asset_label" || return 1
		verify_api_preconnect_header "${tmpdir}/headers" "$expected_origin" "$forbidden_origin" "$asset_label" "required" || return 1
	done

	if ! fetch_typed_asset "$base_url" "/terms" "$tmpdir" "text/html" "Terms resource hints"; then
		return 1
	fi
	verify_exact_http_status "${tmpdir}/headers" "200" "Terms resource hints" || return 1
	verify_api_preconnect_header "${tmpdir}/headers" "$expected_origin" "$forbidden_origin" "Terms resource hints" "absent"
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
	local tmpdir html_file trade_file readiness_error entry_asset trade_asset ready
	tmpdir="$(mktemp -d)"
	html_file="${tmpdir}/builders-perp.html"
	trade_file="${tmpdir}/trade-terminal-page.js"
	readiness_error="${tmpdir}/readiness-error"
	ready="false"

	for _ in $(seq 1 30); do
		if curl_with_deadline -fsS -o "$html_file" "${base_url}/builders-perp" 2>"$readiness_error"; then
			ready="true"
			break
		fi
		sleep 1
	done
	if [ "$ready" != "true" ]; then
		echo "ERROR: application did not become ready at ${base_url}/builders-perp." >&2
		cat "$readiness_error" >&2 || true
		rm -rf "$tmpdir"
		return 1
	fi

	entry_asset="$(extract_first_js_asset "$html_file" || true)"
	if [ -z "$entry_asset" ]; then
		echo "ERROR: application HTML did not reference a client JavaScript entry asset." >&2
		rm -rf "$tmpdir"
		return 1
	fi
	trade_asset="$(node deploy/resolve-client-asset.mjs "$base_url" "$html_file" trade-terminal-page)" || {
		rm -rf "$tmpdir"
		return 1
	}
	if ! fetch_referenced_js_assets "$base_url" "$html_file" "$tmpdir"; then
		rm -rf "$tmpdir"
		return 1
	fi
	if ! fetch_js_asset "$base_url" "$trade_asset" "$tmpdir"; then
		rm -rf "$tmpdir"
		return 1
	fi
	cp "${tmpdir}/body" "$trade_file"
	if ! fetch_referenced_js_assets "$base_url" "$trade_file" "$tmpdir"; then
		rm -rf "$tmpdir"
		return 1
	fi
	if ! fetch_typed_asset "$base_url" "$SOCIAL_IMAGE_PATH" "$tmpdir" "image/png" "Social image"; then
		rm -rf "$tmpdir"
		return 1
	fi
	if ! verify_build_metadata "$base_url" "$tmpdir" "$expected_commit" "$expected_release"; then
		rm -rf "$tmpdir"
		return 1
	fi
	if [ "$require_referral_join" = "true" ] &&
		{ ! verify_referral_deep_link "$base_url" "$tmpdir" || ! verify_upstream_malformed_referral_deep_link "$base_url" "$tmpdir"; }; then
		rm -rf "$tmpdir"
		return 1
	fi
	if [ "$require_chart_delivery" = "true" ] && ! verify_chart_delivery "$base_url" "$tmpdir"; then
		rm -rf "$tmpdir"
		return 1
	fi
	rm -rf "$tmpdir"
	return 0
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
			verify_trade_api_resource_hints "$base_url" "$tmpdir" "$require_sitewide_noindex" &&
			{ [ "$require_referral_join" != "true" ] || verify_referral_deep_link "$base_url" "$tmpdir"; } &&
			{ [ "$require_referral_join" != "true" ] || verify_edge_rejects_malformed_referral_deep_link "$base_url" "$tmpdir"; } &&
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
	local current_target baseline_target release
	current_target="$(readlink -f "$CURRENT" 2>/dev/null || true)"
	baseline_target="$(readlink -f "$MOBILE_SYNC_BASELINE" 2>/dev/null || true)"
	while IFS= read -r release; do
		if [ "$(readlink -f "$release")" = "$current_target" ] || [ "$(readlink -f "$release")" = "$baseline_target" ]; then
			continue
		fi
		rm -rf "$release"
	done < <(find "$RELEASES" -mindepth 1 -maxdepth 1 -type d | sort -r | tail -n +"$((KEEP_RELEASES + 1))")
}

if [ "${BASH_SOURCE[0]}" != "$0" ]; then
	return 0
fi

sync_and_reexec_deploy "$@"
unset GATU_DEPLOY_LOCK_FD GATU_DEPLOY_SYNCED_SHA

echo "==> [2/8] Verify package manager and service configuration"
ensure_pnpm
verify_referral_uri_guard
verify_systemd_unit
verify_caddy_config

echo "==> [3/8] Validate and inject production environment"
test -f "$SHARED/.env.local" || { echo "ERROR: missing $SHARED/.env.local"; exit 1; }
test -f "$SHARED/.env.runtime" || { echo "ERROR: missing $SHARED/.env.runtime"; exit 1; }
clear_inherited_vite_environment
node deploy/validate-production-env.mjs "$SHARED/.env.local" "$SHARED/.env.runtime" apps/terminal
configuration_before="$(node --input-type=module -e 'import {configurationDigest} from "./deploy/mobile-sync-candidate.mjs"; console.log(await configurationDigest(process.argv[1], process.argv[2]))' "$REPO" "$SHARED")"
build_commit="$(git rev-parse HEAD)"
if [ "$DEPLOY_MODE" = "promote" ]; then
	release_name="$CANDIDATE_ID"
	node deploy/mobile-sync-candidate.mjs verify "${CANDIDATES}/${release_name}" "$CANDIDATES" "$REPO" "$SHARED" "$build_commit"
else
	cp "$SHARED/.env.local" apps/terminal/.env.local
	echo "==> [4/8] Install deps (frozen lockfile)"
	pnpm install --frozen-lockfile
	echo "==> [5/8] Build immutable candidate"
	release_name="$(date -u +%Y%m%d%H%M%S)-$(git rev-parse --short HEAD)"
	build_time="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
	NODE_ENV=production GATU_BUILD_SHA="$build_commit" GATU_RELEASE_ID="$release_name" GATU_BUILD_TIME="$build_time" NITRO_PRESET=node-server pnpm build
	test -f "apps/terminal/.output/public${SOCIAL_IMAGE_PATH}"
	compgen -G "apps/terminal/.output/public/assets/*.js" >/dev/null
	verify_chart_build_output apps/terminal/public apps/terminal/.output/public
	node deploy/mobile-sync-release.mjs attest-env apps/terminal/.output "$SHARED/.env.local" "$build_commit" "$release_name"
	printf '%s\n' "$build_commit" > apps/terminal/.output/.gatu-release-commit
	printf '%s\n' "$release_name" > apps/terminal/.output/.gatu-release-id
	printf '%s\n' "$REFERRAL_RELEASE_CAPABILITY" > apps/terminal/.output/.gatu-release-capabilities
	[ "$(node --input-type=module -e 'import {configurationDigest} from "./deploy/mobile-sync-candidate.mjs"; console.log(await configurationDigest(process.argv[1], process.argv[2]))' "$REPO" "$SHARED")" = "$configuration_before" ] || { echo "ERROR: configuration changed during build" >&2; exit 1; }
	node deploy/mobile-sync-candidate.mjs prepare apps/terminal/.output "$CANDIDATES" "$REPO" "$SHARED"
	if [ "$DEPLOY_MODE" = "prepare" ]; then
		echo "Candidate ready: ${release_name}. Current release and service were not changed."
		exit 0
	fi
fi
set -a; . "$SHARED/.env.runtime"; set +a

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
	if rollback_to_release "$previous_release"; then
		verify_mobile_sync_rollback_health "$previous_release" "${PORT:-3000}" || true
	fi
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
	verify_release_parity "$GATU_MAINNET_PUBLIC_BASE_URL" "$GATU_TESTNET_PUBLIC_BASE_URL" "$build_commit" "$release_name" &&
	verify_geo_provider "$PORT" &&
	verify_mobile_sync_health "$new_release" "$PORT"; then
	pin_mobile_sync_baseline "$new_release"
	cleanup_old_releases
	node deploy/mobile-sync-candidate.mjs prune "$CANDIDATES" "${SHARED}/mobile-sync-publications" "$CURRENT" "$MOBILE_SYNC_BASELINE" "$KEEP_RELEASES"
	echo "OK — gatu serving release $(basename "$new_release") on 127.0.0.1:${PORT}, ${GATU_MAINNET_PUBLIC_BASE_URL}, and ${GATU_TESTNET_PUBLIC_BASE_URL} (commit $(git rev-parse --short HEAD))"
	exit 0
fi

echo "HEALTH CHECK FAILED — attempting rollback." >&2
if rollback_to_release "$previous_release" &&
	health_check "$PORT" "$rollback_expected_commit" "$rollback_expected_release" false "$rollback_require_referral_join" &&
	edge_health_check "$GATU_MAINNET_PUBLIC_BASE_URL" "$rollback_expected_commit" "$rollback_expected_release" false "$rollback_require_referral_join" &&
	edge_health_check "$GATU_TESTNET_PUBLIC_BASE_URL" "$rollback_expected_commit" "$rollback_expected_release" true "$rollback_require_referral_join" &&
	verify_release_parity "$GATU_MAINNET_PUBLIC_BASE_URL" "$GATU_TESTNET_PUBLIC_BASE_URL" "$rollback_expected_commit" "$rollback_expected_release" &&
	verify_mobile_sync_rollback_health "$previous_release" "$PORT"; then
	echo "ROLLBACK OK — restored $(basename "$previous_release"). Inspect: journalctl -u gatu -n 100" >&2
	exit 1
fi

echo "HEALTH CHECK FAILED — inspect: journalctl -u gatu -n 50" >&2
exit 1
