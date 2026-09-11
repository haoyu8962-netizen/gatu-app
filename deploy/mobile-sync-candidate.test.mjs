import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readlink, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { createValidationDoc } from "./fixtures/mobile-device-evidence.mjs";
import {
	authorizePromotion,
	evidenceIdentity,
	prepareCandidate,
	pruneCandidates,
	verifyCandidate,
	verifyEvidence,
} from "./mobile-sync-candidate.mjs";
import { attest, verifyRelease } from "./mobile-sync-release.mjs";

function evidence(record, options) {
	const fields = {
		Schema: "1",
		"Git commit": record.commit,
		"Release ID": record.release,
		"Artifact SHA256": record.sha256,
		"Configuration SHA256": record.configurationSha256,
		"Ticket API version": "2",
		"Mobile create gate": String(record.mobileSync.createAndReveal),
		"Mobile import gate": String(record.mobileSync.importFromQr),
	};
	return `## Candidate Identity\n\n| Field | Value |\n| --- | --- |\n${Object.entries(fields)
		.map(([key, value]) => `| ${key} | ${value} |`)
		.join(
			"\n",
		)}\n\n${createValidationDoc(options).replaceAll("abc1234", record.commit).replaceAll("preview-v2", record.release).replaceAll("| Mobile create gate | true |", `| Mobile create gate | ${record.mobileSync.createAndReveal} |`).replaceAll("| Mobile import gate | true |", `| Mobile import gate | ${record.mobileSync.importFromQr} |`)}`;
}

async function fixture(run, actual = false) {
	const work = await realpath(await mkdtemp(resolve(tmpdir(), "gatu-candidate-")));
	const repo = resolve(work, "repo"),
		shared = resolve(work, "shared"),
		output = resolve(work, "output"),
		root = resolve(shared, "mobile-sync-candidates");
	try {
		await mkdir(resolve(repo, "deploy"), { recursive: true });
		await mkdir(resolve(shared, "mobile-sync-evidence"), { recursive: true });
		for (const name of [
			"Caddyfile",
			"gatu.service",
			"referral-uri-guard.cjs",
			"mobile-sync-candidate.mjs",
			"mobile-sync-release.mjs",
			"runtime-listener.mjs",
		])
			await cp(resolve("deploy", name), resolve(repo, "deploy", name));
		await cp(resolve("deploy/fixtures"), resolve(repo, "deploy/fixtures"), { recursive: true });
		await mkdir(resolve(repo, "scripts"));
		await cp(
			resolve("scripts/validate-mobile-phone-access-device-validation.js"),
			resolve(repo, "scripts/validate-mobile-phone-access-device-validation.js"),
		);
		await writeFile(resolve(repo, "deploy/Caddyfile"), "unblocked test configuration\n");
		for (const name of [".env.local", ".env.runtime"])
			await writeFile(resolve(shared, name), "synthetic fixture only\n");
		const git = (...args) => {
			const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
			assert.equal(result.status, 0, result.stderr);
			return result.stdout.trim();
		};
		git("init", "-q");
		git("add", "deploy", "scripts");
		git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "fixture");
		const head = git("rev-parse", "HEAD");
		let manifest;
		if (actual) {
			await cp(process.env.MOBILE_SYNC_OUTPUT, output, { recursive: true });
			await cp(resolve("deploy/referral-uri-guard.cjs"), resolve(output, "referral-uri-guard.cjs"));
			const prior = JSON.parse(await readFile(resolve(output, ".gatu-mobile-sync.json"), "utf8"));
			manifest = await attest(
				output,
				String(prior.mobileSync.createAndReveal),
				String(prior.mobileSync.importFromQr),
				prior.commit,
				prior.release,
			);
		} else {
			await mkdir(resolve(output, "server"), { recursive: true });
			await writeFile(resolve(output, "server/index.mjs"), "export default {};\n");
			await writeFile(resolve(output, "referral-uri-guard.cjs"), "guard\n");
			const files = ["referral-uri-guard.cjs", "server/index.mjs"];
			const hash = createHash("sha256");
			for (const name of files)
				hash
					.update(name)
					.update("\0")
					.update(await readFile(resolve(output, name)))
					.update("\0");
			manifest = {
				schema: 1,
				commit: head,
				release: "fixture-candidate",
				sha256: hash.digest("hex"),
				files,
				verification: "production-http-restart-v2",
				mobileSync: {
					ticketApiVersion: 2,
					legacyRegisterDisabled: true,
					store: "single-process",
					createAndReveal: true,
					importFromQr: true,
				},
			};
			await writeFile(resolve(output, ".gatu-mobile-sync.json"), JSON.stringify(manifest));
		}
		for (const [name, value] of [
			["commit", manifest.commit],
			["id", manifest.release],
			["capabilities", "referral-join-v1"],
		])
			await writeFile(resolve(output, `.gatu-release-${name}`), `${value}\n`);
		let candidate;
		if (actual) {
			const prepared = spawnSync(
				"bash",
				[
					"-ec",
					'node "$SOURCE_REPO/deploy/mobile-sync-candidate.mjs" prepare "$FIXTURE_OUTPUT" "$FIXTURE_ROOT" "$FIXTURE_REPO" "$FIXTURE_SHARED"',
				],
				{
					encoding: "utf8",
					timeout: 60_000,
					env: {
						...process.env,
						SOURCE_REPO: process.cwd(),
						FIXTURE_OUTPUT: output,
						FIXTURE_ROOT: root,
						FIXTURE_REPO: repo,
						FIXTURE_SHARED: shared,
					},
				},
			);
			assert.equal(prepared.status, 0, prepared.stderr);
			candidate = prepared.stdout.trim();
		} else candidate = await prepareCandidate(output, root, repo, shared);
		const { record } = await verifyCandidate(candidate, root, repo, shared, manifest.commit);
		const proof = resolve(shared, "mobile-sync-evidence", `${record.release}.md`);
		await run({ work, repo, shared, output, root, candidate, record, proof, git, head });
	} finally {
		await rm(work, { recursive: true, force: true });
	}
}

test("external complete evidence authorizes identical candidate bytes without changing real Git HEAD", async () =>
	fixture(async (f) => {
		await assert.rejects(authorizePromotion(f.candidate, f.root, f.repo, f.shared, f.record.commit));
		await writeFile(f.proof, evidence(f.record));
		const approval = await authorizePromotion(f.candidate, f.root, f.repo, f.shared, f.record.commit);
		assert.match(approval.evidenceSha256, /^[0-9a-f]{64}$/);
		assert.equal((await verifyRelease(resolve(f.candidate, "artifact"))).sha256, f.record.sha256);
		assert.equal(f.git("rev-parse", "HEAD"), f.head);
		assert.equal(f.git("status", "--porcelain"), "");
		await assert.rejects(prepareCandidate(f.output, f.root, f.repo, f.shared), /already exists/);
	}));

test("promotion fails closed on wrong commit, changed config, malformed or incomplete evidence, and symlinks", async () =>
	fixture(async (f) => {
		const valid = evidence(f.record);
		for (const invalid of [
			valid.replace(f.record.sha256, "0".repeat(64)),
			valid.replace("| Schema | 1 |", "| Schema | 1 |\n| Schema | 1 |"),
			valid.replace("| Schema | 1 |", "| Unknown | 1 |"),
			valid.replaceAll(f.record.commit, f.record.commit.slice(0, 7)),
			valid.replaceAll("| Result | pass |", "| Result | fail |"),
			evidence(f.record, { status: "Not run" }),
			valid.replace("| Release ID | fixture-candidate |", "| Release ID | stale |"),
		]) {
			await writeFile(f.proof, invalid);
			await assert.rejects(authorizePromotion(f.candidate, f.root, f.repo, f.shared, f.record.commit));
		}
		await writeFile(f.proof, valid);
		await assert.rejects(verifyCandidate(f.candidate, f.root, f.repo, f.shared, "0".repeat(40)), /synchronized main/);
		await writeFile(resolve(f.shared, ".env.runtime"), "changed");
		await assert.rejects(
			verifyCandidate(f.candidate, f.root, f.repo, f.shared, f.record.commit),
			/configuration changed/,
		);
		await rm(f.proof);
		await symlink(resolve(f.repo, "deploy/Caddyfile"), f.proof);
		await assert.rejects(verifyEvidence(f.proof, resolve(f.shared, "mobile-sync-evidence"), f.record), /symlink/);
		await assert.rejects(
			verifyEvidence(resolve(f.repo, "deploy/Caddyfile"), resolve(f.shared, "mobile-sync-evidence"), f.record),
			/controlled root/,
		);
		assert.throws(() => evidenceIdentity(`${valid}\n## Candidate Identity\n`, f.record), /exactly one/);
	}));

test(
	"actual shell publication promotes the attested Nitro candidate without rebuilding or changing bytes",
	{ skip: !process.env.MOBILE_SYNC_OUTPUT },
	async () =>
		fixture(async (f) => {
			await writeFile(f.proof, evidence(f.record));
			await mkdir(resolve(f.work, "previous"));
			await symlink(resolve(f.work, "previous"), resolve(f.work, "current"));
			const shell = `source "$SOURCE_REPO/deploy/deploy.sh"
REPO="$FIXTURE_REPO"
SHARED="$FIXTURE_SHARED"
CANDIDATES="$SHARED/mobile-sync-candidates"
RELEASES="$FIXTURE_WORK/releases"
CURRENT="$FIXTURE_WORK/current"
prepare_mobile_sync_rollback() { return 0; }
pnpm() { echo 'unexpected rebuild' >&2; return 99; }
mv() { if [ "$1" = "-Tf" ]; then command rm -f "$3"; command mv "$2" "$3"; else command mv "$@"; fi; }
publish_release "$FIXTURE_WORK/previous" "$FIXTURE_RELEASE" "$FIXTURE_COMMIT"
`;
			const run = () =>
				spawnSync("bash", ["-s"], {
					input: shell,
					encoding: "utf8",
					timeout: 60_000,
					env: {
						...process.env,
						SOURCE_REPO: process.cwd(),
						FIXTURE_REPO: f.repo,
						FIXTURE_SHARED: f.shared,
						FIXTURE_WORK: f.work,
						FIXTURE_RELEASE: f.record.release,
						FIXTURE_COMMIT: f.record.commit,
					},
				});
			await writeFile(f.proof, evidence(f.record, { status: "Not run" }));
			if (f.record.mobileSync.importFromQr) {
				assert.notEqual(run().status, 0);
				assert.equal(await readlink(resolve(f.work, "current")), resolve(f.work, "previous"));
			}
			await writeFile(f.proof, evidence(f.record));
			const result = run();
			assert.equal(result.status, 0, result.stderr);
			const published = await readlink(resolve(f.work, "current"));
			assert.equal((await verifyRelease(published)).sha256, f.record.sha256);
			assert.equal((await verifyRelease(resolve(f.candidate, "artifact"))).sha256, f.record.sha256);
			assert.equal(f.git("rev-parse", "HEAD"), f.head);
		}, true),
);

test("candidate pruning preserves pending validation, current and baseline outside release pruning", async () => {
	const work = await realpath(await mkdtemp(resolve(tmpdir(), "gatu-candidate-prune-")));
	try {
		const root = resolve(work, "candidates"),
			receipts = resolve(work, "receipts");
		await mkdir(root);
		await mkdir(receipts);
		for (const name of ["00-baseline", "01-current", "02-pending", "03-prune", "04-latest"]) {
			await mkdir(resolve(root, name));
			const record = { release: name, sha256: "a".repeat(64), commit: "b".repeat(40) };
			await writeFile(resolve(root, name, "candidate.json"), JSON.stringify(record));
			if (name !== "02-pending") await writeFile(resolve(receipts, `${name}.json`), JSON.stringify(record));
		}
		await symlink(resolve(root, "01-current"), resolve(work, "current"));
		await symlink(resolve(root, "00-baseline"), resolve(work, "baseline"));
		await pruneCandidates(root, receipts, resolve(work, "current"), resolve(work, "baseline"), "1");
		const { readdir } = await import("node:fs/promises");
		assert.deepEqual((await readdir(root)).sort(), ["00-baseline", "01-current", "02-pending", "04-latest"]);
	} finally {
		await rm(work, { recursive: true, force: true });
	}
});

test("candidate verification rejects extra client assets before the publication-only carry step", async () =>
	fixture(async (f) => {
		await mkdir(resolve(f.candidate, "artifact/public/assets"), { recursive: true });
		await writeFile(resolve(f.candidate, "artifact/public/assets/undeclared.js"), "unexpected");
		await assert.rejects(verifyCandidate(f.candidate, f.root, f.repo, f.shared, f.record.commit), /unexpected file/);
	}));
