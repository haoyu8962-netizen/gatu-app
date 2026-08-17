import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const DEPLOY_SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "deploy.sh");
const TARGET_SHA = "0123456789abcdef0123456789abcdef01234567";

function createHarness() {
	const root = mkdtempSync(join(tmpdir(), "gatu-deploy-bootstrap-"));
	const repository = join(root, "repo");
	const shared = join(root, "shared");
	const resultFile = join(root, "result");
	const gitCallsFile = join(root, "git-calls");
	mkdirSync(join(repository, "deploy"), { recursive: true });
	mkdirSync(shared, { recursive: true });
	writeFileSync(
		join(repository, "deploy/deploy.sh"),
		`#!/usr/bin/env bash\nset -euo pipefail\nprintf '%s\\n' "\${GATU_DEPLOY_SYNCED_SHA:-}" "\${GATU_DEPLOY_LOCK_FD:-}" "$KEEP_RELEASES" "$#" "\${1:-}" > "$RESULT_FILE"\nif [ -e /dev/fd/9 ]; then printf 'lock-open\\n' >> "$RESULT_FILE"; else printf 'lock-closed\\n' >> "$RESULT_FILE"; fi\n`,
	);
	return { gitCallsFile, repository, resultFile, root, shared };
}

function runBootstrap({
	branch = "feature/test",
	flockExitCode = 0,
	gitDiffExitCode = 0,
	lockFdMarker,
	marker = "",
	mode = "initial",
	validBranch = true,
} = {}) {
	const harness = createHarness();
	const shell = String.raw`
set -- "$TEST_BRANCH"
source "$DEPLOY_SCRIPT_PATH"
REPO="$TEST_REPOSITORY"
SHARED="$TEST_SHARED"
DEPLOY_LOCK_PATH="${"$"}{SHARED}/deploy.lock"
git() {
	printf '%s\n' "$*" >> "$GIT_CALLS_FILE"
	case "$1" in
		check-ref-format) [ "$FAKE_VALID_BRANCH" = "true" ] ;;
		fetch|reset) return 0 ;;
		diff) return "$FAKE_GIT_DIFF_EXIT_CODE" ;;
		rev-parse)
			if [ "${"$"}{2:-}" = "--verify" ] || [ "${"$"}{2:-}" = "HEAD" ]; then
				printf '%s\n' "$FAKE_TARGET_SHA"
				return 0
			fi
			return 1
			;;
		*) return 1 ;;
	esac
}
flock() {
	return "$FAKE_FLOCK_EXIT_CODE"
}
if [ "$FAKE_BOOTSTRAP_MODE" = "verified" ]; then
	exec 9>"$DEPLOY_LOCK_PATH"
	readlink() {
		printf '%s\n' "$DEPLOY_LOCK_PATH"
	}
fi
sync_and_reexec_deploy "$@"
printf 'verified\n%s\n' "$PWD" > "$RESULT_FILE"
`;

	try {
		const result = spawnSync("bash", ["-s"], {
			encoding: "utf8",
			env: {
				...process.env,
				DEPLOY_SCRIPT_PATH: DEPLOY_SCRIPT,
				FAKE_BOOTSTRAP_MODE: mode,
				FAKE_FLOCK_EXIT_CODE: String(flockExitCode),
				FAKE_GIT_DIFF_EXIT_CODE: String(gitDiffExitCode),
				FAKE_TARGET_SHA: TARGET_SHA,
				FAKE_VALID_BRANCH: String(validBranch),
				GATU_DEPLOY_LOCK_FD: lockFdMarker ?? (marker ? "9" : ""),
				GATU_DEPLOY_SYNCED_SHA: marker,
				GIT_CALLS_FILE: harness.gitCallsFile,
				KEEP_RELEASES: "7",
				RESULT_FILE: harness.resultFile,
				TEST_BRANCH: branch,
				TEST_REPOSITORY: harness.repository,
				TEST_SHARED: harness.shared,
			},
			input: shell,
		});
		return {
			gitCalls: (() => {
				try {
					return readFileSync(harness.gitCallsFile, "utf8");
				} catch {
					return "";
				}
			})(),
			result,
			resultFile: (() => {
				try {
					return readFileSync(harness.resultFile, "utf8");
				} catch {
					return "";
				}
			})(),
		};
	} finally {
		rmSync(harness.root, { force: true, recursive: true });
	}
}

test("deployment synchronizes to an exact commit and re-execs the canonical script once", () => {
	const { gitCalls, result, resultFile } = runBootstrap();
	assert.equal(result.status, 0, result.stderr);
	assert.deepEqual(resultFile.trim().split("\n"), [TARGET_SHA, "9", "7", "1", "feature/test", "lock-open"]);
	assert.match(gitCalls, /fetch --prune origin/);
	assert.match(gitCalls, new RegExp(`reset --hard ${TARGET_SHA}`));
	assert.match(gitCalls, /rev-parse --verify refs\/remotes\/origin\/feature\/test\^\{commit\}/);
});

test("deployment fails fast when another process owns the deployment lock", () => {
	const { gitCalls, result, resultFile } = runBootstrap({ flockExitCode: 1 });
	assert.equal(result.status, 75);
	assert.match(result.stderr, /another deployment is already running/);
	assert.equal(resultFile, "");
	assert.equal(gitCalls.trim(), "check-ref-format --branch feature/test");
});

test("synchronized invocation verifies its commit and inherited lock before continuing", () => {
	const { gitCalls, result, resultFile } = runBootstrap({ marker: TARGET_SHA, mode: "verified" });
	assert.equal(result.status, 0, result.stderr);
	const [verification, workingDirectory] = resultFile.trim().split("\n");
	assert.equal(verification, "verified");
	assert.ok(workingDirectory.endsWith("/repo"), `expected ${workingDirectory} to end with /repo`);
	assert.match(gitCalls, /rev-parse HEAD/);
	assert.match(gitCalls, /diff --quiet HEAD --/);
	assert.doesNotMatch(gitCalls, /fetch|reset/);
});

test("synchronized invocation rejects a staged tracked-file change", () => {
	const { result } = runBootstrap({ gitDiffExitCode: 1, marker: TARGET_SHA, mode: "verified" });
	assert.equal(result.status, 1);
	assert.match(result.stderr, /tracked repository files changed after deployment synchronization/);
});

test("a forged synchronization marker without the inherited lock fails closed", () => {
	const { result } = runBootstrap({ lockFdMarker: "", marker: TARGET_SHA });
	assert.equal(result.status, 1);
	assert.match(result.stderr, /did not inherit its lock descriptor/);
});

test("production deployment fixes NODE_ENV before building", () => {
	const source = readFileSync(DEPLOY_SCRIPT, "utf8");
	assert.match(source, /NODE_ENV=production[^\n]*NITRO_PRESET=node-server pnpm build/);
});

test("deployment rejects invalid branches and forged synchronization markers", async (context) => {
	await context.test("invalid branch", () => {
		const { result } = runBootstrap({ validBranch: false });
		assert.equal(result.status, 64);
		assert.match(result.stderr, /invalid deployment branch/);
	});

	await context.test("invalid marker", () => {
		const { result } = runBootstrap({ marker: "not-a-commit", mode: "verified" });
		assert.equal(result.status, 1);
		assert.match(result.stderr, /invalid synchronized deployment commit marker/);
	});
});

test(
	"Linux deployment lock survives child exec, blocks competitors, and releases afterward",
	{ skip: process.platform !== "linux" },
	() => {
		const root = mkdtempSync(join(tmpdir(), "gatu-deploy-flock-"));
		try {
			const result = spawnSync(
				"bash",
				[
					"-c",
					'exec 9>"$1"; flock -n 9; /bin/bash -c \'[ -e /proc/$$/fd/9 ]; if flock -n -E 75 "$1" /bin/true 9>&-; then exit 1; else rc=$?; [ "$rc" -eq 75 ]; fi\' _ "$1"; exec 9>&-; flock -n -E 75 "$1" /bin/true',
					"_",
					join(root, "deploy.lock"),
				],
				{ encoding: "utf8" },
			);
			assert.equal(result.status, 0, result.stderr);
		} finally {
			rmSync(root, { force: true, recursive: true });
		}
	},
);
