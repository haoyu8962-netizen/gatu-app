import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const DEPLOY_SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "deploy.sh");
const SERVICE_UNIT = join(dirname(fileURLToPath(import.meta.url)), "gatu.service");
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
	branch = "main",
	flockExitCode = 0,
	gitDiffExitCode = 0,
	gitUntrackedFiles = "",
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
		ls-files)
			printf '%s' "$FAKE_GIT_UNTRACKED_FILES"
			return 0
			;;
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
				FAKE_GIT_UNTRACKED_FILES: gitUntrackedFiles,
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

function extractReleaseLauncher() {
	const execStart = readFileSync(SERVICE_UNIT, "utf8")
		.split("\n")
		.find((line) => line.startsWith("ExecStart="));
	const prefix = "ExecStart=/bin/sh -ec '";
	assert.ok(execStart?.startsWith(prefix), "gatu.service must use the audited release launcher");
	assert.ok(execStart.endsWith("'"), "release launcher must be one quoted shell argument");
	return execStart.slice(prefix.length, -1);
}

function runReleaseLauncher({
	capability = "referral-join-v1\n",
	capabilitySymlink = false,
	guard = true,
	guardSymlink = false,
	identified = true,
} = {}) {
	const root = mkdtempSync(join(tmpdir(), "gatu-release-launcher-"));
	const resultFile = join(root, "result");
	mkdirSync(join(root, "server"), { recursive: true });
	writeFileSync(
		join(root, "server/index.mjs"),
		'import { appendFileSync } from "node:fs"; appendFileSync(process.env.RESULT_FILE, "server\\n");\n',
	);
	if (identified) {
		writeFileSync(join(root, ".gatu-release-commit"), `${TARGET_SHA}\n`);
		writeFileSync(join(root, ".gatu-release-id"), "test-release\n");
	}
	if (capability !== null) {
		const capabilityPath = join(root, ".gatu-release-capabilities");
		if (capabilitySymlink) {
			writeFileSync(join(root, "capability-target"), capability);
			symlinkSync("capability-target", capabilityPath);
		} else {
			writeFileSync(capabilityPath, capability);
		}
	}
	if (guard) {
		const guardPath = join(root, "referral-uri-guard.cjs");
		const guardSource = 'require("node:fs").appendFileSync(process.env.RESULT_FILE, "guard\\n");\n';
		if (guardSymlink) {
			writeFileSync(join(root, "guard-target.cjs"), guardSource);
			symlinkSync("guard-target.cjs", guardPath);
		} else {
			writeFileSync(guardPath, guardSource);
		}
	}

	try {
		const portableLauncher = extractReleaseLauncher()
			.replaceAll("$$(", "$(")
			.replaceAll("/usr/bin/node", process.execPath)
			.replaceAll("/usr/bin/cat", "/bin/cat");
		const result = spawnSync("/bin/sh", ["-ec", portableLauncher], {
			cwd: root,
			encoding: "utf8",
			env: { ...process.env, RESULT_FILE: resultFile },
		});
		return {
			output: (() => {
				try {
					return readFileSync(resultFile, "utf8");
				} catch {
					return "";
				}
			})(),
			result,
		};
	} finally {
		rmSync(root, { force: true, recursive: true });
	}
}

function runSystemdUnitCheck({
	dropInPaths = "",
	execStart = `{ path=/bin/sh ; argv[]=/bin/sh -ec ${extractReleaseLauncher().replaceAll("$$", "$")} ; ignore_errors=no ; }`,
	fragmentPath = "/etc/systemd/system/gatu.service",
	loadState = "loaded",
	needDaemonReload = "no",
	workingDirectory = "/opt/gatu/current",
} = {}) {
	const root = mkdtempSync(join(tmpdir(), "gatu-systemd-unit-"));
	const callsFile = join(root, "systemctl-calls");
	const shell = String.raw`
source "$DEPLOY_SCRIPT_PATH"
CURRENT="$FAKE_CURRENT"
cmp() {
	return 0
}
systemctl_show_property() {
	printf '%s\n' "$1" >> "$SYSTEMCTL_CALLS_FILE"
	case "$1" in
		LoadState) printf '%s\n' "$FAKE_LOAD_STATE" ;;
		FragmentPath) printf '%s\n' "$FAKE_FRAGMENT_PATH" ;;
		DropInPaths) printf '%s\n' "$FAKE_DROP_IN_PATHS" ;;
		NeedDaemonReload) printf '%s\n' "$FAKE_NEED_DAEMON_RELOAD" ;;
		WorkingDirectory) printf '%s\n' "$FAKE_WORKING_DIRECTORY" ;;
		ExecStart) printf '%s\n' "$FAKE_EXEC_START" ;;
		*) return 64 ;;
	esac
}
verify_systemd_unit
`;

	try {
		const result = spawnSync("bash", ["-s"], {
			encoding: "utf8",
			env: {
				...process.env,
				DEPLOY_SCRIPT_PATH: DEPLOY_SCRIPT,
				FAKE_CURRENT: "/opt/gatu/current",
				FAKE_DROP_IN_PATHS: dropInPaths,
				FAKE_EXEC_START: execStart,
				FAKE_FRAGMENT_PATH: fragmentPath,
				FAKE_LOAD_STATE: loadState,
				FAKE_NEED_DAEMON_RELOAD: needDaemonReload,
				FAKE_WORKING_DIRECTORY: workingDirectory,
				SYSTEMCTL_CALLS_FILE: callsFile,
			},
			input: shell,
		});
		return {
			calls: (() => {
				try {
					return readFileSync(callsFile, "utf8").trim().split("\n");
				} catch {
					return [];
				}
			})(),
			result,
		};
	} finally {
		rmSync(root, { force: true, recursive: true });
	}
}

function runFailedRestartRollback() {
	const root = mkdtempSync(join(tmpdir(), "gatu-release-rollback-"));
	const previousRelease = join(root, "previous");
	const failedRelease = join(root, "failed");
	const current = join(root, "current");
	const restartLog = join(root, "restart-log");
	mkdirSync(previousRelease);
	mkdirSync(failedRelease);
	writeFileSync(join(previousRelease, "referral-uri-guard.cjs"), "previous-guard\n");
	writeFileSync(join(failedRelease, "referral-uri-guard.cjs"), "failed-guard\n");
	symlinkSync(failedRelease, current, "dir");

	const shell = String.raw`
source "$DEPLOY_SCRIPT_PATH"
CURRENT="$TEST_CURRENT"
mv() {
	if [ "${"$"}1" = "-Tf" ]; then
		local source="${"$"}2" target="${"$"}3"
		command rm -f "$target"
		command mv "$source" "$target"
		return
	fi
	command mv "${"$"}@"
}
sudo() {
	[ "${"$"}*" = "systemctl restart gatu" ] || return 64
	local guard
	guard="$(/bin/cat "$CURRENT/referral-uri-guard.cjs")"
	printf '%s\n' "$guard" >> "$RESTART_LOG"
	[ "$guard" = "previous-guard" ]
}
if sudo systemctl restart gatu; then
	exit 70
fi
rollback_to_release "$PREVIOUS_RELEASE"
`;

	try {
		const result = spawnSync("bash", ["-s"], {
			encoding: "utf8",
			env: {
				...process.env,
				DEPLOY_SCRIPT_PATH: DEPLOY_SCRIPT,
				PREVIOUS_RELEASE: previousRelease,
				RESTART_LOG: restartLog,
				TEST_CURRENT: current,
			},
			input: shell,
		});
		return {
			currentTarget: readlinkSync(current),
			restarts: readFileSync(restartLog, "utf8").trim().split("\n"),
			result,
		};
	} finally {
		rmSync(root, { force: true, recursive: true });
	}
}

test("deployment synchronizes to an exact commit and re-execs the canonical script once", () => {
	const { gitCalls, result, resultFile } = runBootstrap();
	assert.equal(result.status, 0, result.stderr);
	assert.deepEqual(resultFile.trim().split("\n"), [TARGET_SHA, "9", "7", "1", "main", "lock-open"]);
	assert.match(gitCalls, /fetch --prune origin/);
	assert.match(gitCalls, new RegExp(`reset --hard ${TARGET_SHA}`));
	assert.match(gitCalls, /rev-parse --verify refs\/remotes\/origin\/main\^\{commit\}/);
});

test("production deployment rejects a non-main branch before fetch or reset", () => {
	const { gitCalls, result, resultFile } = runBootstrap({ branch: "test-pr102" });
	assert.equal(result.status, 64);
	assert.match(result.stderr, /only synchronize origin\/main/);
	assert.equal(gitCalls, "");
	assert.equal(resultFile, "");
});

test("deployment fails fast when another process owns the deployment lock", () => {
	const { gitCalls, result, resultFile } = runBootstrap({ flockExitCode: 1 });
	assert.equal(result.status, 75);
	assert.match(result.stderr, /another deployment is already running/);
	assert.equal(resultFile, "");
	assert.equal(gitCalls.trim(), "check-ref-format --branch main");
});

test("synchronized invocation verifies its commit and inherited lock before continuing", () => {
	const { gitCalls, result, resultFile } = runBootstrap({ marker: TARGET_SHA, mode: "verified" });
	assert.equal(result.status, 0, result.stderr);
	const [verification, workingDirectory] = resultFile.trim().split("\n");
	assert.equal(verification, "verified");
	assert.ok(workingDirectory.endsWith("/repo"), `expected ${workingDirectory} to end with /repo`);
	assert.match(gitCalls, /rev-parse HEAD/);
	assert.match(gitCalls, /diff --quiet HEAD --/);
	assert.match(gitCalls, /ls-files --others --exclude-standard/);
	assert.doesNotMatch(gitCalls, /fetch|reset/);
});

test("synchronized invocation rejects a staged tracked-file change", () => {
	const { result } = runBootstrap({ gitDiffExitCode: 1, marker: TARGET_SHA, mode: "verified" });
	assert.equal(result.status, 1);
	assert.match(result.stderr, /tracked repository files changed after deployment synchronization/);
});

test("synchronized invocation rejects a nonignored untracked repository file", () => {
	const { result } = runBootstrap({
		gitUntrackedFiles: "apps/terminal/public/unreviewed.js\n",
		marker: TARGET_SHA,
		mode: "verified",
	});
	assert.equal(result.status, 1);
	assert.match(result.stderr, /nonignored untracked repository files remain/);
	assert.match(result.stderr, /apps\/terminal\/public\/unreviewed\.js/);
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

test("canonical publication writes the guard identity and exact capability before switching current", () => {
	const source = readFileSync(DEPLOY_SCRIPT, "utf8");
	const guardCopy = source.indexOf('cp deploy/referral-uri-guard.cjs "${release_tmp}/referral-uri-guard.cjs"');
	const commitMarker = source.indexOf('> "${release_tmp}/.gatu-release-commit"');
	const releaseMarker = source.indexOf('> "${release_tmp}/.gatu-release-id"');
	const capabilityMarker = source.indexOf('> "${release_tmp}/.gatu-release-capabilities"');
	const publishDirectory = source.indexOf('mv "$release_tmp" "$release_dir"');
	const switchCurrent = source.indexOf('mv -Tf "$current_tmp" "$CURRENT"');
	assert.match(source, /REFERRAL_RELEASE_CAPABILITY="referral-join-v1"/);
	assert.ok(guardCopy >= 0 && guardCopy < commitMarker);
	assert.ok(commitMarker < publishDirectory);
	assert.ok(releaseMarker < publishDirectory);
	assert.ok(capabilityMarker < publishDirectory);
	assert.ok(publishDirectory < switchCurrent);
});

test("deployment rejects invalid branches and forged synchronization markers", async (context) => {
	await context.test("git refuses the canonical main branch", () => {
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

test("systemd preflight verifies the loaded immutable service contract", () => {
	const { calls, result } = runSystemdUnitCheck();
	assert.equal(result.status, 0, result.stderr);
	assert.deepEqual(calls, [
		"LoadState",
		"FragmentPath",
		"DropInPaths",
		"NeedDaemonReload",
		"WorkingDirectory",
		"ExecStart",
	]);
});

test(
	"Linux systemd parser accepts the canonical release launcher",
	{ skip: process.platform !== "linux" },
	() => {
		const result = spawnSync("/usr/bin/systemd-analyze", ["--man=no", "verify", SERVICE_UNIT], {
			encoding: "utf8",
		});
		assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
	},
);

test("systemd preflight fails closed for stale or overridden loaded units", async (context) => {
	await context.test("daemon reload required", () => {
		const { result } = runSystemdUnitCheck({ needDaemonReload: "yes" });
		assert.equal(result.status, 1);
		assert.match(result.stderr, /run sudo systemctl daemon-reload/);
	});

	await context.test("legacy working directory", () => {
		const { result } = runSystemdUnitCheck({
			workingDirectory: "/opt/gatu/repo/apps/terminal/.output",
		});
		assert.equal(result.status, 1);
		assert.match(result.stderr, /expected \/opt\/gatu\/current/);
	});

	await context.test("drop-in override", () => {
		const { result } = runSystemdUnitCheck({
			dropInPaths: "/etc/systemd/system/gatu.service.d/override.conf",
		});
		assert.equal(result.status, 1);
		assert.match(result.stderr, /unsupported systemd drop-ins/);
	});

	await context.test("shared mutable referral guard", () => {
		const { result } = runSystemdUnitCheck({
			execStart:
				"{ path=/usr/bin/node ; argv[]=/usr/bin/node --require=/opt/gatu/shared/referral-uri-guard.cjs server/index.mjs ; }",
		});
		assert.equal(result.status, 1);
		assert.match(result.stderr, /does not enforce the immutable release referral guard/);
	});
});

test("identified releases require the exact referral capability and immutable guard", async (context) => {
	await context.test("valid identified release", () => {
		const { output, result } = runReleaseLauncher();
		assert.equal(result.status, 0, result.stderr);
		assert.equal(output, "guard\nserver\n");
	});

	for (const [name, options] of [
		["missing capability", { capability: null }],
		["extra capability newline", { capability: "referral-join-v1\n\n" }],
		["wrong capability", { capability: "referral-join-v2\n" }],
		["symlinked capability", { capabilitySymlink: true }],
		["missing guard", { guard: false }],
		["symlinked guard", { guardSymlink: true }],
	]) {
		await context.test(name, () => {
			const { output, result } = runReleaseLauncher(options);
			assert.notEqual(result.status, 0);
			assert.match(result.stderr, /identified release is missing the exact referral-join-v1 capability or guard/);
			assert.equal(output, "");
		});
	}
});

test("markerless legacy releases remain a narrowly scoped rollback path", () => {
	const { output, result } = runReleaseLauncher({ capability: null, guard: false, identified: false });
	assert.equal(result.status, 0, result.stderr);
	assert.equal(output, "server\n");
});

test("failed deployment rollback restarts with the previous immutable release guard", () => {
	const { currentTarget, restarts, result } = runFailedRestartRollback();
	assert.equal(result.status, 0, result.stderr);
	assert.equal(currentTarget.endsWith("/previous"), true);
	assert.deepEqual(restarts, ["failed-guard", "previous-guard"]);
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
