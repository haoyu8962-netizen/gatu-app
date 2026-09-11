import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	cp,
	link,
	lstat,
	mkdir,
	mkdtemp,
	open,
	readdir,
	readFile,
	realpath,
	rename,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { verifyRelease } from "./mobile-sync-release.mjs";

const VALIDATOR = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"../scripts/validate-mobile-phone-access-device-validation.js",
);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const enabled = (manifest) => manifest.mobileSync.createAndReveal || manifest.mobileSync.importFromQr;

export async function regularPath(path, root) {
	const absolute = resolve(path);
	const boundary = resolve(root);
	assert.ok(absolute.startsWith(`${boundary}/`), "path must be inside the controlled root");
	assert.equal(await realpath(boundary), boundary, "controlled root must not contain symlinks");
	let current = boundary;
	for (const part of absolute.slice(boundary.length + 1).split("/")) {
		current = resolve(current, part);
		assert.ok(!(await lstat(current)).isSymbolicLink(), "symlink paths are forbidden");
	}
	return absolute;
}

export async function configurationDigest(repo, shared) {
	const hash = createHash("sha256");
	for (const path of [
		resolve(shared, ".env.local"),
		resolve(shared, ".env.runtime"),
		...["Caddyfile", "gatu.service", "referral-uri-guard.cjs"].map((name) => resolve(repo, "deploy", name)),
	]) {
		assert.ok(
			(await lstat(path)).isFile() && !(await lstat(path)).isSymbolicLink(),
			"configuration must be a regular file",
		);
		hash.update(await readFile(path)).update("\0");
	}
	return hash.digest("hex");
}

function identity(manifest, config) {
	assert.match(manifest.commit, /^[0-9a-f]{40}$/);
	assert.match(manifest.release, /^[A-Za-z0-9][A-Za-z0-9_-]{0,100}$/);
	return {
		schema: 1,
		commit: manifest.commit,
		release: manifest.release,
		sha256: manifest.sha256,
		configurationSha256: config,
		mobileSync: manifest.mobileSync,
	};
}

export async function prepareCandidate(output, root, repo, shared) {
	const manifest = await verifyRelease(output, { carriedAssets: false });
	const record = identity(manifest, await configurationDigest(repo, shared));
	await mkdir(root, { recursive: true, mode: 0o750 });
	assert.equal(await realpath(root), resolve(root));
	const target = resolve(root, record.release);
	const temporary = await mkdtemp(resolve(root, ".preparing-"));
	try {
		await cp(output, resolve(temporary, "artifact"), { recursive: true, errorOnExist: true, force: false });
		await verifyRelease(resolve(temporary, "artifact"), { carriedAssets: false });
		await writeFile(resolve(temporary, "candidate.json"), `${JSON.stringify(record, null, 2)}\n`, { mode: 0o440 });
		assert.equal(
			await lstat(target).then(
				() => true,
				(error) => {
					if (error.code === "ENOENT") return false;
					throw error;
				},
			),
			false,
			"candidate already exists",
		);
		await rename(temporary, target);
	} finally {
		await rm(temporary, { force: true, recursive: true });
	}
	return target;
}

export async function verifyCandidate(candidate, root, repo, shared, commit) {
	await regularPath(candidate, root);
	await regularPath(resolve(candidate, "candidate.json"), root);
	const record = JSON.parse(await readFile(resolve(candidate, "candidate.json"), "utf8"));
	await regularPath(resolve(candidate, "artifact"), root);
	const manifest = await verifyRelease(resolve(candidate, "artifact"), { carriedAssets: false });
	assert.deepEqual(
		record,
		identity(manifest, await configurationDigest(repo, shared)),
		"candidate identity or configuration changed; prepare and validate a new candidate",
	);
	assert.equal(record.commit, commit, "candidate commit no longer matches synchronized main");
	assert.equal(record.release, candidate.split("/").at(-1), "candidate directory identity mismatch");
	return { record, manifest };
}

export function evidenceIdentity(content, record) {
	const sections = content.split(/^## Candidate Identity\s*$/m);
	assert.equal(sections.length, 2, "evidence requires exactly one Candidate Identity section");
	const section = sections[1].split(/^## /m)[0];
	const entries = section
		.split(/\r?\n/)
		.filter((line) => line.trim().startsWith("|"))
		.map((line) =>
			line
				.split("|")
				.slice(1, -1)
				.map((cell) => cell.trim()),
		);
	assert.deepEqual(
		entries.splice(0, 2),
		[
			["Field", "Value"],
			["---", "---"],
		],
		"invalid candidate identity table",
	);
	const expected = {
		Schema: "1",
		"Git commit": record.commit,
		"Release ID": record.release,
		"Artifact SHA256": record.sha256,
		"Configuration SHA256": record.configurationSha256,
		"Ticket API version": "2",
		"Mobile create gate": String(record.mobileSync.createAndReveal),
		"Mobile import gate": String(record.mobileSync.importFromQr),
	};
	assert.equal(entries.length, Object.keys(expected).length, "missing, duplicate or unknown identity fields");
	assert.equal(new Set(entries.map(([key]) => key)).size, entries.length, "duplicate identity field");
	assert.ok(
		entries.every((entry) => entry.length === 2),
		"identity rows require exactly two columns",
	);
	assert.deepEqual(Object.fromEntries(entries), expected, "evidence is for a different candidate");
}

export async function verifyEvidence(file, root, record) {
	await regularPath(file, root);
	assert.ok((await lstat(file)).isFile(), "evidence must be a regular file");
	const bytes = await readFile(file);
	evidenceIdentity(bytes.toString("utf8"), record);
	const temporary = await mkdtemp(resolve(tmpdir(), "gatu-device-evidence-"));
	try {
		const snapshot = resolve(temporary, "evidence.md");
		await writeFile(snapshot, bytes, { mode: 0o400 });
		const result = spawnSync(
			process.execPath,
			[
				VALIDATOR,
				"--file",
				snapshot,
				"--commit",
				record.commit,
				"--release",
				record.release,
				"--create",
				String(record.mobileSync.createAndReveal),
				"--import",
				String(record.mobileSync.importFromQr),
			],
			{ encoding: "utf8", timeout: 30_000 },
		);
		assert.equal(result.status, 0, `physical-device evidence is incomplete or invalid: ${result.stderr}`);
	} finally {
		await rm(temporary, { recursive: true, force: true });
	}
	return sha(bytes);
}

export async function authorizePromotion(candidate, root, repo, shared, commit) {
	const { record, manifest } = await verifyCandidate(candidate, root, repo, shared, commit);
	const blocked = (await readFile(resolve(repo, "deploy/Caddyfile"), "utf8")).includes(
		"respond @mobile_sync_block 503",
	);
	assert.ok(
		!blocked || !enabled(manifest),
		"canonical Caddy still seals ticket routes; publish a closed baseline first",
	);
	let evidenceSha256 = null;
	if (enabled(manifest))
		evidenceSha256 = await verifyEvidence(
			resolve(shared, "mobile-sync-evidence", `${record.release}.md`),
			resolve(shared, "mobile-sync-evidence"),
			record,
		);
	return { ...record, evidenceSha256 };
}

async function verifyPublicationRecord(root, authorization) {
	const path = resolve(root, `${authorization.release}.json`);
	await regularPath(path, root);
	assert.ok((await lstat(path)).isFile(), "publication record must be a regular file");
	assert.deepEqual(
		JSON.parse(await readFile(path, "utf8")),
		authorization,
		"publication record differs from current authorization",
	);
}

export async function recordPublication(root, authorization) {
	assert.match(authorization.release, /^[A-Za-z0-9][A-Za-z0-9_-]{0,100}$/);
	await mkdir(root, { recursive: true, mode: 0o750 });
	assert.equal(await realpath(root), resolve(root), "publication root must not contain symlinks");
	const temporary = await mkdtemp(resolve(root, ".recording-"));
	try {
		const path = resolve(temporary, "record.json");
		const handle = await open(path, "wx", 0o440);
		try {
			await handle.writeFile(`${JSON.stringify(authorization)}\n`);
			await handle.chmod(0o440);
			await handle.sync();
		} finally {
			await handle.close();
		}
		try {
			await link(path, resolve(root, `${authorization.release}.json`));
		} catch (error) {
			if (error.code !== "EEXIST") throw error;
		}
		await verifyPublicationRecord(root, authorization);
	} finally {
		await rm(temporary, { recursive: true, force: true });
	}
}

export async function verifyPublishedRelease(directory, root, publications, authorization) {
	await regularPath(directory, root);
	assert.equal(directory.split("/").at(-1), authorization.release, "published directory identity mismatch");
	await verifyPublicationRecord(publications, authorization);
	const manifest = await verifyRelease(directory);
	assert.equal(manifest.commit, authorization.commit, "published commit mismatch");
	assert.equal(manifest.release, authorization.release, "published release mismatch");
	assert.equal(manifest.sha256, authorization.sha256, "published artifact differs from candidate");
	assert.deepEqual(manifest.mobileSync, authorization.mobileSync, "published gates differ from candidate");
	return manifest;
}

export async function pruneCandidates(root, publications, current, baseline, keep = "5") {
	assert.match(String(keep), /^[1-9][0-9]*$/);
	const protectedIds = new Set(
		await Promise.all(
			[current, baseline].map(async (path) => (await realpath(path).catch(() => "")).split("/").at(-1)),
		),
	);
	const names = (await readdir(root))
		.filter((name) => /^[A-Za-z0-9][A-Za-z0-9_-]{0,100}$/.test(name))
		.sort()
		.reverse();
	for (const name of names.slice(Number(keep))) {
		if (protectedIds.has(name)) continue;
		const directory = resolve(root, name);
		await regularPath(directory, root);
		const receipt = resolve(publications, `${name}.json`);
		const exists = await lstat(receipt).then(
			() => true,
			(error) => {
				if (error.code === "ENOENT") return false;
				throw error;
			},
		);
		if (!exists) continue;
		await regularPath(receipt, publications);
		const record = JSON.parse(await readFile(resolve(directory, "candidate.json"), "utf8"));
		const published = JSON.parse(await readFile(receipt, "utf8"));
		if (published.release === name && published.sha256 === record.sha256 && published.commit === record.commit)
			await rm(directory, { recursive: true });
	}
}

async function main() {
	const [operation, ...args] = process.argv.slice(2);
	if (operation === "prepare") process.stdout.write(`${await prepareCandidate(...args)}\n`);
	else if (operation === "record") await recordPublication(args[0], JSON.parse(args[1]));
	else if (operation === "reuse") await verifyPublishedRelease(args[0], args[1], args[2], JSON.parse(args[3]));
	else if (operation === "prune") await pruneCandidates(...args);
	else if (operation === "verify") await verifyCandidate(...args);
	else if (operation === "authorize") process.stdout.write(`${JSON.stringify(await authorizePromotion(...args))}\n`);
	else
		throw new Error(
			"Usage: mobile-sync-candidate.mjs prepare <output> <root> <repo> <shared> | verify/authorize <candidate> <root> <repo> <shared> <commit> | record <publications> <authorization-json> | reuse <release> <releases> <publications> <authorization-json>",
		);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
	main().catch((error) => {
		process.stderr.write(`Candidate rejected: ${error.message}\n`);
		process.exitCode = 1;
	});
