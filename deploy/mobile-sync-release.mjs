import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { copyFile, lstat, readdir, readFile, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { createServer } from "node:net";
import { relative, resolve, sep } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import {
	consumeMobileSyncTicket as legacyConsume,
	registerMobileSyncTicket as legacyRegister,
} from "./fixtures/mobile-sync-legacy-client.mjs";

import { validateListener } from "./runtime-listener.mjs";

const MANIFEST = ".gatu-mobile-sync.json";
const TICKET_PATH = "/mobile-agent-sync-ticket";
const ID = "A".repeat(22);
const A = "11".repeat(16);
const B = "22".repeat(16);
const ISSUE = { version: 2, operation: "issue" };
const CONSUME = (syncId = ID, consumerId = A) => ({ version: 2, operation: "consume", syncId, consumerId });
const ORIGINS = ["https://app.gatu.ai", "https://testnet.gatu.ai"];
export const BLOCKED_PATHS = [
	TICKET_PATH,
	`${TICKET_PATH}/`,
	`${TICKET_PATH}\\`,
	`${TICKET_PATH}%5c`,
	`${TICKET_PATH}%5C`,
	`${TICKET_PATH}%2f`,
	`/${TICKET_PATH}`,
	"/%6dobile-agent-sync-ticket",
	"/MOBILE-AGENT-SYNC-TICKET",
];

export function validateCapability(value) {
	assert.equal(value?.ticketApiVersion, 2, "ticket API must be v2");
	assert.equal(value.legacyRegisterDisabled, true, "legacy registration must be disabled");
	assert.equal(value.store, "single-process", "only one Node process is supported");
	assert.equal(typeof value.createAndReveal, "boolean");
	assert.equal(typeof value.importFromQr, "boolean");
	assert.ok(!value.createAndReveal || value.importFromQr);
}

function headers(origin, forwarded) {
	return {
		origin,
		"content-type": "application/json",
		"sec-fetch-site": "same-origin",
		...(forwarded
			? {
					host: new URL(origin).host,
					"x-forwarded-host": new URL(origin).host,
					"x-forwarded-proto": new URL(origin).protocol.slice(0, -1),
					"x-forwarded-for": "203.0.113.10",
					"x-real-ip": "203.0.113.10",
				}
			: {}),
	};
}

function transport(url, options) {
	return new Promise((resolveResponse, reject) => {
		const target = new URL(url);
		const rawPath = url.slice(url.indexOf("/", url.indexOf("://") + 3));
		const send = target.protocol === "https:" ? httpsRequest : httpRequest;
		const pending = send(
			{ hostname: target.hostname, port: target.port, path: rawPath, method: options.method, headers: options.headers },
			(incoming) => {
				const chunks = [];
				let bytes = 0;
				incoming.on("data", (chunk) => {
					bytes += chunk.length;
					if (bytes > 65_536) pending.destroy(new Error("probe response too large"));
					else chunks.push(chunk);
				});
				incoming.on("error", reject);
				incoming.on("end", () => {
					const responseHeaders = new Headers();
					for (const [key, value] of Object.entries(incoming.headers)) {
						if (value !== undefined) responseHeaders.set(key, Array.isArray(value) ? value.join(", ") : value);
					}
					resolveResponse(
						new Response(incoming.statusCode === 204 ? null : Buffer.concat(chunks), {
							status: incoming.statusCode,
							headers: responseHeaders,
						}),
					);
				});
			},
		);
		pending.setTimeout(10_000, () => pending.destroy(new Error("probe request timed out")));
		pending.on("error", reject);
		pending.end(options.body);
	});
}

async function request(base, origin, body, forwarded, path = TICKET_PATH) {
	return transport(
		`${base}${path}`,
		{ method: "POST", headers: headers(origin, forwarded), body: JSON.stringify(body) },
		forwarded,
	);
}

async function expectStatus(response, expected) {
	assert.equal(response.status, expected, `ticket HTTP status: expected ${expected}, received ${response.status}`);
	assert.equal(response.headers.get("cache-control"), "no-store");
	assert.equal(response.headers.get("referrer-policy"), "no-referrer");
	if (expected === 503) assert.equal(response.headers.get("retry-after"), "60");
}

export async function probeBlock(base, origin = base) {
	for (const path of BLOCKED_PATHS)
		await expectStatus(await request(base, origin, { operation: "register", syncId: ID }, false, path), 503);
}

async function metadata(base, origin, forwarded) {
	const response = await transport(`${base}/build-meta.json`, { headers: headers(origin, forwarded) }, forwarded);
	assert.equal(response.status, 200);
	assert.equal(response.headers.get("cache-control"), "no-store");
	const meta = await response.json();
	validateCapability(meta.mobileSync);
	return meta;
}

export async function probe(base, origin, expected, { forwarded = false, blocked = false } = {}) {
	const meta = await metadata(base, origin, forwarded);
	assert.equal(meta.commit, expected.commit, "commit mismatch");
	assert.equal(meta.release, expected.release, "release mismatch");
	assert.deepEqual(meta.mobileSync, expected.mobileSync, "compiled feature mismatch");
	if (blocked) {
		await probeBlock(base, origin);
		return null;
	}
	await expectStatus(await request(base, origin, { operation: "register", syncId: ID }, forwarded), 400);
	await expectStatus(await request(base, origin, { operation: "consume", syncId: ID, consumerId: A }, forwarded), 400);
	await expectStatus(await request(base, origin, { ...ISSUE, syncId: ID }, forwarded), 400);
	await expectStatus(await request(base, origin, CONSUME(), forwarded), meta.mobileSync.importFromQr ? 410 : 503);
	const response = await request(base, origin, ISSUE, forwarded);
	await expectStatus(response, meta.mobileSync.createAndReveal ? 200 : 503);
	if (!meta.mobileSync.createAndReveal) return null;
	const ticket = await response.json();
	assert.deepEqual(Object.keys(ticket).sort(), ["expiresAtMs", "serverNowMs", "syncId", "version"]);
	assert.equal(ticket.version, 2);
	assert.match(ticket.syncId, /^[A-Za-z0-9_-]{21}[AQgw]$/, "issuer returned a noncanonical ID");
	assert.ok(Number.isSafeInteger(ticket.serverNowMs) && ticket.serverNowMs >= 0);
	assert.equal(ticket.expiresAtMs - ticket.serverNowMs, 60_000);
	const results = await Promise.all(
		[A, B].map((consumerId) => request(base, origin, CONSUME(ticket.syncId, consumerId), forwarded)),
	);
	assert.deepEqual(results.map((r) => r.status).sort(), [204, 409]);
	for (const response of results) await expectStatus(response, response.status);
	const winner = results[0].status === 204 ? A : B;
	await expectStatus(await request(base, origin, CONSUME(ticket.syncId, winner), forwarded), 204);
	return ticket.syncId;
}

async function artifactFiles(directory, prefix = "") {
	const files = [];
	for (const entry of (await readdir(resolve(directory, prefix))).sort()) {
		if (!prefix && [MANIFEST, ".gatu-release-commit", ".gatu-release-id", ".gatu-release-capabilities"].includes(entry))
			continue;
		const name = prefix ? `${prefix}/${entry}` : entry;
		const stat = await lstat(resolve(directory, name));
		assert.ok(!stat.isSymbolicLink(), "artifact symlinks are not accepted");
		if (stat.isDirectory()) files.push(...(await artifactFiles(directory, name)));
		else if (stat.isFile()) files.push(name);
		else assert.fail("unsupported artifact entry");
	}
	return files;
}

async function digest(directory, files) {
	const hash = createHash("sha256");
	for (const name of files) {
		assert.ok(!name.includes("\\") && !name.split("/").includes("..") && !name.startsWith("/"));
		const full = resolve(directory, name);
		assert.ok(!relative(directory, full).startsWith(`..${sep}`));
		assert.ok((await lstat(full)).isFile(), "artifact file changed type");
		hash
			.update(name)
			.update("\0")
			.update(await readFile(full))
			.update("\0");
	}
	return hash.digest("hex");
}

export async function verifyRelease(directory, { closed = false, identity = true, carriedAssets = true } = {}) {
	directory = resolve(directory);
	const manifestStat = await lstat(resolve(directory, MANIFEST));
	assert.ok(manifestStat.isFile() && !manifestStat.isSymbolicLink());
	const manifest = JSON.parse(await readFile(resolve(directory, MANIFEST), "utf8"));
	assert.equal(manifest.schema, 1);
	validateCapability(manifest.mobileSync);
	assert.equal(manifest.verification, "production-http-restart-v2");
	assert.ok(typeof manifest.commit === "string" && manifest.commit.length > 0);
	assert.ok(typeof manifest.release === "string" && manifest.release.length > 0);
	assert.ok(Array.isArray(manifest.files) && manifest.files.includes("server/index.mjs"));
	const actualFiles = await artifactFiles(directory);
	for (const file of actualFiles) {
		assert.ok(
			manifest.files.includes(file) || (carriedAssets && /^public\/assets\/[^/]+$/.test(file)),
			"unexpected file outside carried immutable assets",
		);
	}
	assert.deepEqual(
		actualFiles.filter((p) => p.startsWith("server/")),
		manifest.files.filter((p) => p.startsWith("server/")),
		"server tree differs from verified artifact",
	);
	assert.equal(await digest(directory, manifest.files), manifest.sha256, "artifact hash mismatch");
	if (closed)
		assert.ok(
			!manifest.mobileSync.createAndReveal && !manifest.mobileSync.importFromQr,
			"rollback baseline must disable pairing",
		);
	if (identity) {
		for (const name of [".gatu-release-commit", ".gatu-release-id", ".gatu-release-capabilities"]) {
			const stat = await lstat(resolve(directory, name));
			assert.ok(stat.isFile() && !stat.isSymbolicLink(), "release identity must be a regular file");
		}
		assert.ok(manifest.files.includes("referral-uri-guard.cjs"), "release guard is not part of the verified artifact");
		assert.equal(await readFile(resolve(directory, ".gatu-release-capabilities"), "utf8"), "referral-join-v1\n");
		assert.equal((await readFile(resolve(directory, ".gatu-release-commit"), "utf8")).trim(), manifest.commit);
		assert.equal((await readFile(resolve(directory, ".gatu-release-id"), "utf8")).trim(), manifest.release);
	}
	return manifest;
}

async function unusedPort() {
	const server = createServer();
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	const port = server.address().port;
	await new Promise((done) => server.close(done));
	return port;
}

async function start(directory, port, runtimeFlags = "false") {
	validateListener(process.env, { requireHost: false });
	const listener = { HOST: "127.0.0.1", NITRO_HOST: "127.0.0.1", PORT: String(port), NITRO_PORT: String(port) };
	validateListener(listener, { port });
	const guard = resolve(directory, "referral-uri-guard.cjs");
	const hasGuard = await lstat(guard).then(
		() => true,
		() => false,
	);
	const child = spawn(
		process.execPath,
		[...(hasGuard ? [`--require=${guard}`] : []), resolve(directory, "server/index.mjs")],
		{
			cwd: directory,
			env: {
				...process.env,
				...listener,
				NODE_ENV: "production",
				VITE_MOBILE_PAIRING_CREATE_ENABLED: runtimeFlags,
				VITE_MOBILE_PAIRING_IMPORT_ENABLED: runtimeFlags,
			},
			stdio: "ignore",
		},
	);
	const stop = async () => {
		if (child.exitCode !== null || child.signalCode !== null) return;
		const exit = once(child, "exit");
		child.kill("SIGTERM");
		const timeout = setTimeout(() => child.kill("SIGKILL"), 5_000);
		try {
			await exit;
		} finally {
			clearTimeout(timeout);
		}
	};
	try {
		for (let attempt = 0; attempt < 60; attempt += 1) {
			if (child.exitCode !== null || child.signalCode !== null)
				throw new Error("production server exited before readiness");
			try {
				await metadata(`http://127.0.0.1:${port}`, ORIGINS[0], true);
				return { stop };
			} catch {
				await delay(250);
			}
		}
		throw new Error("production server readiness timeout");
	} catch (error) {
		await stop();
		throw error;
	}
}

export async function attest(directory, expectedCreate, expectedImport, commit, release, persist = true) {
	directory = resolve(directory);
	assert.ok(["true", "false"].includes(expectedCreate) && ["true", "false"].includes(expectedImport));
	const files = await artifactFiles(directory);
	const sha256 = await digest(directory, files);
	const port = await unusedPort();
	const base = `http://127.0.0.1:${port}`;
	let server = await start(directory, port);
	let meta;
	const tickets = [];
	try {
		meta = await metadata(base, ORIGINS[0], true);
		assert.equal(meta.mobileSync.createAndReveal, expectedCreate === "true" && expectedImport === "true");
		assert.equal(meta.mobileSync.importFromQr, expectedImport === "true");
		if (commit) assert.equal(meta.commit, commit);
		if (release) assert.equal(meta.release, release);
		for (const origin of ORIGINS) tickets.push(await probe(base, origin, meta, { forwarded: true }));
		if (tickets[0]) await expectStatus(await request(base, ORIGINS[1], CONSUME(tickets[0]), true), 410);
		const wrongOrigin = await transport(
			`${base}${TICKET_PATH}`,
			{
				method: "POST",
				headers: { ...headers(ORIGINS[0], true), origin: "https://evil.test" },
				body: JSON.stringify(ISSUE),
			},
			true,
		);
		await expectStatus(wrongOrigin, 403);
		const nativeFetch = globalThis.fetch;
		try {
			globalThis.fetch = (path, options) =>
				transport(
					`${base}${path}`,
					{ ...options, headers: { ...headers(ORIGINS[0], true), ...options.headers } },
					true,
				);
			assert.deepEqual(await legacyRegister(ID), { status: "unavailable" });
			assert.equal(await legacyConsume(ID, A), "unavailable");
		} finally {
			globalThis.fetch = nativeFetch;
		}

		const lostResponse = await request(base, ORIGINS[0], ISSUE, true);
		if (meta.mobileSync.createAndReveal) {
			const ticket = await lostResponse.json();
			await expectStatus(await request(base, ORIGINS[0], CONSUME(ticket.syncId), true), 204);
			tickets.push(ticket.syncId);
		}
		await server.stop();
		server = await start(directory, port, "true");
		for (const [index, syncId] of tickets.entries()) {
			if (!syncId) continue;
			for (const consumerId of [A, B])
				await expectStatus(await request(base, ORIGINS[index === 1 ? 1 : 0], CONSUME(syncId, consumerId), true), 410);
		}
		for (const origin of ORIGINS) await probe(base, origin, meta, { forwarded: true });
		for (const [index, syncId] of tickets.entries()) {
			if (syncId) await expectStatus(await request(base, ORIGINS[index === 1 ? 1 : 0], CONSUME(syncId), true), 410);
		}
	} finally {
		await server.stop();
	}
	assert.equal(await digest(directory, files), sha256, "artifact changed during verification");
	const manifest = {
		schema: 1,
		commit: meta.commit,
		release: meta.release,
		mobileSync: meta.mobileSync,
		verification: "production-http-restart-v2",
		verifiedAt: new Date().toISOString(),
		sha256,
		files,
	};
	if (persist) await writeFile(resolve(directory, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o644 });
	return manifest;
}

async function main() {
	const [operation, directory, ...args] = process.argv.slice(2);
	if (operation === "attest") await attest(directory, ...args);
	else if (operation === "check") await attest(directory, args[0], args[1], args[2], args[3], false);
	else if (operation === "attest-env") {
		const values = new Map(
			(await readFile(args[0], "utf8"))
				.split(/\r?\n/)
				.map((line) => line.trim().match(/^([A-Z_]+)\s*=(.*)$/))
				.filter(Boolean)
				.map((match) => [match[1], match[2].trim()]),
		);
		const create = values.get("VITE_MOBILE_PAIRING_CREATE_ENABLED") === "true";
		const imported = values.get("VITE_MOBILE_PAIRING_IMPORT_ENABLED") === "true";

		await copyFile(resolve("deploy/referral-uri-guard.cjs"), resolve(directory, "referral-uri-guard.cjs"));
		await attest(directory, String(create), String(imported), args[1], args[2]);
	} else if (operation === "verify") await verifyRelease(directory, { closed: args[0] === "closed" });
	else if (operation === "block") await probeBlock(directory);
	else if (operation === "probe") {
		const manifest = await verifyRelease(directory);
		const [base, origin, mode] = args;
		await probe(base, origin, manifest, { forwarded: mode === "node", blocked: mode === "blocked" });
	} else
		throw new Error(
			"Usage: mobile-sync-release.mjs attest/check <output> <create> <import> [commit release] | verify <release> [closed] | block <origin> | probe <release> <base> <origin> [node|blocked]",
		);
	process.stdout.write(`Mobile sync ${operation}: verified\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
	main().catch((error) => {
		process.stderr.write(`Mobile sync verification failed: ${error.message}\n`);
		process.exitCode = 1;
	});
