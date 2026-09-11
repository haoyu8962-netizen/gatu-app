import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { validateCapability, verifyRelease } from "./mobile-sync-release.mjs";

async function fixture(run) {
	const directory = await mkdtemp(resolve(tmpdir(), "gatu-mobile-release-"));
	try {
		await mkdir(resolve(directory, "server"));
		const body = "export default {};\n";
		await writeFile(resolve(directory, "server/index.mjs"), body);
		await writeFile(resolve(directory, "referral-uri-guard.cjs"), "guard");
		await writeFile(resolve(directory, ".gatu-release-capabilities"), "referral-join-v1\n");
		const hash = createHash("sha256")
			.update("referral-uri-guard.cjs\0guard\0server/index.mjs\0")
			.update(body)
			.update("\0")
			.digest("hex");
		const manifest = {
			schema: 1,
			commit: "a".repeat(40),
			release: "closed-v2",
			mobileSync: {
				ticketApiVersion: 2,
				legacyRegisterDisabled: true,
				store: "single-process",
				createAndReveal: false,
				importFromQr: false,
			},
			verification: "production-http-restart-v2",
			files: ["referral-uri-guard.cjs", "server/index.mjs"],
			sha256: hash,
		};
		await writeFile(resolve(directory, ".gatu-release-commit"), `${manifest.commit}\n`);
		await writeFile(resolve(directory, ".gatu-release-id"), `${manifest.release}\n`);
		const save = () => writeFile(resolve(directory, ".gatu-mobile-sync.json"), JSON.stringify(manifest));
		await save();
		await run(directory, manifest, save);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}

test("requires identity and exact verified artifact bytes for a closed rollback baseline", async () =>
	fixture(async (directory, manifest) => {
		assert.equal((await verifyRelease(directory, { closed: true })).commit, manifest.commit);
		await writeFile(resolve(directory, "server/index.mjs"), "changed");
		await assert.rejects(verifyRelease(directory), /hash mismatch/);
	}));

test("rejects added server code and symlinks while allowing carried immutable public assets", async () =>
	fixture(async (directory) => {
		await mkdir(resolve(directory, "public/assets"), { recursive: true });
		await writeFile(resolve(directory, "public/assets/old-hashed.js"), "old");
		await verifyRelease(directory);
		await writeFile(resolve(directory, "server/injected.mjs"), "new");
		await assert.rejects(verifyRelease(directory), /unexpected file|server tree/);
		await rm(resolve(directory, "server/injected.mjs"));
		await symlink(resolve(directory, "server/index.mjs"), resolve(directory, "server/alias.mjs"));
		await assert.rejects(verifyRelease(directory), /symlinks/);
	}));

test("rejects old, mismatched, incomplete and enabled rollback manifests", async () =>
	fixture(async (directory, manifest, save) => {
		manifest.mobileSync.importFromQr = true;
		await save();
		await assert.rejects(verifyRelease(directory, { closed: true }), /disable pairing/);
		manifest.mobileSync.importFromQr = false;
		manifest.commit = "b".repeat(40);
		await save();
		await assert.rejects(verifyRelease(directory));
		await rm(resolve(directory, ".gatu-mobile-sync.json"));
		await assert.rejects(verifyRelease(directory));
	}));

test("rejects invalid protocol, legacy registration and multi-process capabilities", () => {
	const base = {
		ticketApiVersion: 2,
		legacyRegisterDisabled: true,
		store: "single-process",
		createAndReveal: false,
		importFromQr: false,
	};
	for (const change of [
		{ ticketApiVersion: 1 },
		{ legacyRegisterDisabled: false },
		{ store: "cluster" },
		{ createAndReveal: true },
		{ importFromQr: "true" },
	])
		assert.throws(() => validateCapability({ ...base, ...change }));
});

test("release pruning preserves both current and pinned baseline beyond the retention count", async () => {
	const { spawnSync } = await import("node:child_process");
	const { readdir } = await import("node:fs/promises");
	const work = await mkdtemp(resolve(tmpdir(), "gatu-release-pruning-"));
	try {
		const releases = resolve(work, "releases");
		await mkdir(releases);
		for (const name of ["00-baseline", "01-prune", "02-current", "03-latest"]) await mkdir(resolve(releases, name));
		await symlink(resolve(releases, "00-baseline"), resolve(work, "baseline"));
		await symlink(resolve(releases, "02-current"), resolve(work, "current"));
		const result = spawnSync("bash", ["-s"], {
			encoding: "utf8",
			env: { ...process.env, TEST_REPO: process.cwd(), TEST_WORK: work },
			input: `source "$TEST_REPO/deploy/deploy.sh"
RELEASES="$TEST_WORK/releases"
CURRENT="$TEST_WORK/current"
MOBILE_SYNC_BASELINE="$TEST_WORK/baseline"
KEEP_RELEASES=1
cleanup_old_releases
`,
		});
		assert.equal(result.status, 0, result.stderr);
		assert.deepEqual((await readdir(releases)).sort(), ["00-baseline", "02-current", "03-latest"]);
	} finally {
		await rm(work, { recursive: true, force: true });
	}
});

test("rollback selects and verifies the pinned closed baseline instead of the previous release", async () =>
	fixture(async (directory, manifest, save) => {
		const { spawnSync } = await import("node:child_process");
		const { basename } = await import("node:path");
		const { readlink, realpath } = await import("node:fs/promises");
		manifest.release = basename(directory);
		await save();
		await writeFile(resolve(directory, ".gatu-release-id"), `${manifest.release}\n`);
		const work = await mkdtemp(resolve(tmpdir(), "gatu-safe-rollback-"));
		try {
			await mkdir(resolve(work, "previous"));
			await mkdir(resolve(work, "failed"));
			await symlink(resolve(work, "failed"), resolve(work, "current"));
			await symlink(directory, resolve(work, "baseline"));
			const result = spawnSync("bash", ["-s"], {
				encoding: "utf8",
				env: { ...process.env, TEST_REPO: process.cwd(), TEST_WORK: work },
				input: `source "$TEST_REPO/deploy/deploy.sh"
REPO="$TEST_REPO"
CURRENT="$TEST_WORK/current"
MOBILE_SYNC_BASELINE="$TEST_WORK/baseline"
verify_mobile_sync_edge_block() { return 1; }
sudo() { [ "$*" = "systemctl restart gatu" ]; }
mv() {
 if [ "$1" = "-Tf" ]; then command rm -f "$3"; command mv "$2" "$3"; else command mv "$@"; fi
}
rollback_to_release "$TEST_WORK/previous"
`,
			});
			assert.equal(result.status, 0, result.stderr);
			assert.equal(await readlink(resolve(work, "current")), await realpath(directory));
			await writeFile(resolve(directory, "server/index.mjs"), "tampered");
			const failed = spawnSync("bash", ["-s"], {
				encoding: "utf8",
				env: { ...process.env, TEST_REPO: process.cwd(), TEST_WORK: work },
				input: `source "$TEST_REPO/deploy/deploy.sh"
REPO="$TEST_REPO"
MOBILE_SYNC_BASELINE="$TEST_WORK/baseline"
verify_mobile_sync_edge_block() { return 1; }
prepare_mobile_sync_rollback "$TEST_WORK/previous"
`,
			});
			assert.equal(failed.status, 1);
			assert.match(failed.stderr, /refusing release switch/);
		} finally {
			await rm(work, { recursive: true, force: true });
		}
	}));
