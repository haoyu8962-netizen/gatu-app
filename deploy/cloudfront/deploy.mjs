#!/usr/bin/env node
// Static deployment of the trading terminal: uploads the client build to S3 in an order that never
// lets a new shell reference missing assets, invalidates CloudFront, updates the API Lambda and
// verifies the public origin. Every AWS command is printed; nothing runs without `--execute`.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { collectInlineScriptHashes, collectInlineScripts, listPrerenderedPages } from "../../scripts/collect-inline-script-hashes.mjs";
import { applyDistributionAliases } from "./distribution-config.mjs";
import { fillScriptHashes, hasScriptHashLines, missingScriptHashes, parseScriptHashes, readEdgeConfig, rotateScriptHashes } from "./function-code.mjs";

export const PRECOMPRESSED_EXTENSIONS = new Set([".br", ".gz", ".zst"]);
/** Browsers revalidate every navigation; the edge answers from cache for a minute and refreshes in the background. */
export const HTML_CACHE_CONTROL = "public, max-age=0, s-maxage=60, stale-while-revalidate=300";
export const NO_STORE = "no-store";
export const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";
export const REVALIDATE_CACHE_CONTROL = "public, max-age=0, must-revalidate";
/** CloudFront signs Lambda origin requests without their body; POST callers send the body hash themselves. */
export const PAYLOAD_HASH_HEADER = "x-amz-content-sha256";
const NO_STORE_FILES = new Set(["build-meta.json", "sw.js"]);
/** TradingView writes a 20-hex content hash into every bundle file name, so those never change in place. */
const HASHED_CHART_BUNDLE = /^charting_library\/bundles\/[^/]+\.[0-9a-f]{20}(\.rtl)?\.[a-z0-9]+$/;
const MAX_KEYS_PER_COMMAND = 500;
/** The build copies the TradingView loader under a 16-hex content hash; the plain `charting_library.js` stays revalidated. */
const HASHED_CHART_ENTRY = /^charting_library\/charting_library\.[0-9a-f]{16}\.js$/;
/** The build injects the trade startup closure into the shell; a shell with fewer links skipped that step. */
const MIN_SHELL_PRELOADS = 20;
/** Surface-specific preload lists the bootstrap entry reads; written by scripts/inject-shell-preloads.mjs. */
const SURFACE_PRELOAD_META_NAMES = ["sairn-preload-desktop", "sairn-preload-mobile", "sairn-chart-prefetch"];

/** Cache policy for one object in the public directory; `null` means the file is not uploaded. */
export function objectCacheControl(relativePath) {
	const key = relativePath.replaceAll("\\", "/");
	if (PRECOMPRESSED_EXTENSIONS.has(extname(key))) return null;
	if (key.startsWith("assets/") || HASHED_CHART_BUNDLE.test(key) || HASHED_CHART_ENTRY.test(key)) return IMMUTABLE_CACHE_CONTROL;
	if (key.startsWith("charting_library/") || /^tradingview-theme-.*\.css$/.test(key)) return REVALIDATE_CACHE_CONTROL;
	if (NO_STORE_FILES.has(key)) return NO_STORE;
	if (key.endsWith(".html")) return HTML_CACHE_CONTROL;
	return REVALIDATE_CACHE_CONTROL;
}

/** HTML and build metadata go last so a viewer never receives a shell whose assets are not there yet. */
export function isLatePhaseObject(relativePath) {
	const key = relativePath.replaceAll("\\", "/");
	return key.endsWith(".html") || key === "build-meta.json";
}

export function listPublicFiles(publicDir) {
	const files = [];
	function walk(directory) {
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) walk(path);
			else if (entry.isFile()) files.push(relative(publicDir, path).replaceAll("\\", "/"));
		}
	}
	walk(publicDir);
	return files.sort();
}

export function planUpload(files) {
	const early = [];
	const late = [];
	for (const file of files) {
		const cacheControl = objectCacheControl(file);
		if (cacheControl === null) continue;
		(isLatePhaseObject(file) ? late : early).push({ file, cacheControl });
	}
	return { early, late };
}

function groupByCacheControl(items) {
	const groups = new Map();
	for (const item of items) {
		const group = groups.get(item.cacheControl) ?? [];
		group.push(item.file);
		groups.set(item.cacheControl, group);
	}
	return groups;
}

/**
 * One `aws s3 sync` per cache policy and phase. Include/exclude patterns are exact file keys, so the
 * sync never touches objects from another release and never deletes anything: viewers holding an
 * older shell keep working until their next navigation.
 */
export function buildSyncCommands({ publicDir, bucket, files }) {
	const { early, late } = planUpload(files);
	const commands = [];
	for (const phase of [early, late]) {
		for (const [cacheControl, keys] of groupByCacheControl(phase)) {
			const includes = keys.flatMap((key) => ["--include", key]);
			commands.push([
				"s3",
				"sync",
				publicDir,
				`s3://${bucket}`,
				"--exclude",
				"*",
				...includes,
				"--cache-control",
				cacheControl,
				"--no-progress",
			]);
		}
	}
	return commands;
}

/**
 * Standalone document pages that builds before ADR 0020 prerendered. Navigations reach the shell
 * now, but a file-like request such as `/terms/index.html` would still read the frozen copy. An
 * executing sync overwrites each of them with this build's shell instead of deleting it, so every
 * legal path answers the shell as on the official terminal, and a rollback whose older request
 * function still rewrites `/terms` to `/terms/index.html` keeps working until the older pages are
 * uploaded again. A build that still ships one of these pages keeps its own copy.
 */
export const RETIRED_PAGE_KEYS = ["cookies", "docs", "privacy", "risk", "support", "terms"].map(
	(route) => `${route}/index.html`,
);

export function buildRetiredPageCommands({ publicDir, bucket, files }) {
	return RETIRED_PAGE_KEYS.filter((key) => !files.includes(key)).map((key) => [
		"s3",
		"cp",
		join(publicDir, "_shell.html"),
		`s3://${bucket}/${key}`,
		"--cache-control",
		HTML_CACHE_CONTROL,
		"--content-type",
		"text/html; charset=utf-8",
		"--no-progress",
	]);
}

const FUNCTIONS_DIR = resolve(fileURLToPath(new URL(".", import.meta.url)), "functions");
export const RESPONSE_FUNCTION_NAME = "gatu-terminal-response";
export const CLOUDFRONT_FUNCTIONS = [
	{ name: "gatu-terminal-request", file: "terminal-request.js" },
	{ name: RESPONSE_FUNCTION_NAME, file: "terminal-response.js" },
];

/** Where a release writes the response function filled with the build's inline script hashes; never the committed file. */
export function releaseFunctionPath(publicDir) {
	return resolve(publicDir, "..", "edge", "terminal-response.js");
}

/**
 * The committed response function with this build's inline script hashes as CURRENT and the live
 * function's CURRENT as PREVIOUS, so pages the edge still serves from the previous release stay
 * allowed until the invalidation and the shell's `s-maxage` have passed.
 */
export function prepareResponseFunction({ committedCode, buildHashes, liveCode = "", servedHashes = [] }) {
	if (buildHashes.length === 0) throw new Error("The build has no inline scripts; refusing to publish a policy that would allow none");
	const live = liveCode && hasScriptHashLines(liveCode) ? parseScriptHashes(liveCode) : { current: [], previous: [] };
	const sets = rotateScriptHashes({ build: buildHashes, live, served: servedHashes });
	return { code: fillScriptHashes(committedCode, sets), ...sets };
}

/** The routes a viewer can request for each prerendered page; the shell answers every client route. */
export function servedPageRoutes(publicDir) {
	return listPrerenderedPages(publicDir)
		.filter((page) => page === "_shell.html" || page.endsWith("/index.html"))
		.map((page) => (page === "_shell.html" ? "/trade/HYPE" : `/${page.slice(0, -"/index.html".length)}`));
}

/**
 * Inline script hashes of the pages the origin serves right now, so a rotation never drops them.
 * The retired legal page files are read by their file URL as well: an interrupted sync can leave one
 * of them on an older build than the shell, and navigations to `/terms` would only show the shell. A
 * bucket that never held such a file answers 404, which is skipped.
 */
export async function collectServedScriptHashes({ origin, publicDir, fetchImpl = fetch }) {
	const base = origin.replace(/\/+$/, "");
	const hashes = new Set();
	const headers = { accept: "text/html", "cache-control": "no-cache" };
	for (const route of servedPageRoutes(publicDir)) {
		const response = await fetchImpl(`${base}${route}`, { headers });
		if (!response.ok) throw new Error(`${route} answered ${response.status} while reading the served inline script hashes`);
		for (const script of collectInlineScripts(await response.text())) hashes.add(script.hash);
	}
	for (const key of RETIRED_PAGE_KEYS) {
		const response = await fetchImpl(`${base}/${key}`, { headers });
		if (response.status === 404) continue;
		if (!response.ok) throw new Error(`/${key} answered ${response.status} while reading the served inline script hashes`);
		for (const script of collectInlineScripts(await response.text())) hashes.add(script.hash);
	}
	return [...hashes].sort();
}

function functionComment(file) {
	return file === "terminal-request.js" ? "sairn shell rewrite" : "sairn route marker + csp";
}

/**
 * Updates a CloudFront Function from its file and publishes it to LIVE. `update-function` needs the
 * current ETag and `publish-function` the ETag the update returned, so the caller re-reads it in
 * between; the returned publish command ends with a placeholder for that value.
 */
export function buildFunctionUpdateCommands({ name, file, etag, comment }) {
	return [
		["cloudfront", "update-function", "--name", name, "--if-match", etag, "--function-config", `Comment=${comment},Runtime=cloudfront-js-2.0`, "--function-code", `fileb://${file}`],
		["cloudfront", "publish-function", "--name", name, "--if-match", "<updated-etag>"],
	];
}

function chunk(items, size) {
	const chunks = [];
	for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
	return chunks;
}

/**
 * `aws s3 sync` skips unchanged files, so a cache policy change never reaches objects that are
 * already in the bucket. This rewrites the metadata of the selected objects with an in-bucket copy
 * (`--metadata-directive REPLACE`), grouped by cache policy and bounded per command. It never
 * uploads a local body: a shell or page must only reach the bucket through `sync`, which checks the
 * live edge policy and uploads assets first.
 */
export function buildReuploadCommands({ bucket, files, prefixes }) {
	const selected = files.filter((file) => prefixes.some((prefix) => file === prefix || file.startsWith(prefix)));
	const { early, late } = planUpload(selected);
	const commands = [];
	for (const phase of [early, late]) {
		for (const [cacheControl, keys] of groupByCacheControl(phase)) {
			for (const keyChunk of chunk(keys, MAX_KEYS_PER_COMMAND)) {
				const includes = keyChunk.flatMap((key) => ["--include", key]);
				commands.push([
					"s3",
					"cp",
					`s3://${bucket}`,
					`s3://${bucket}`,
					"--recursive",
					"--exclude",
					"*",
					...includes,
					"--metadata-directive",
					"REPLACE",
					"--cache-control",
					cacheControl,
					"--no-progress",
				]);
			}
		}
	}
	return commands;
}

export function buildInvalidationCommand(distributionId) {
	return ["cloudfront", "create-invalidation", "--distribution-id", distributionId, "--paths", "/*"];
}

export function buildLambdaCommands({ functionName, zipPath }) {
	return [
		["lambda", "update-function-code", "--function-name", functionName, "--zip-file", `fileb://${zipPath}`, "--publish"],
		["lambda", "wait", "function-updated", "--function-name", functionName],
	];
}

function findChartBundle(publicDir) {
	const directory = join(publicDir, "charting_library", "bundles");
	if (!existsSync(directory)) return undefined;
	const files = readdirSync(directory).filter((file) => HASHED_CHART_BUNDLE.test(`charting_library/bundles/${file}`));
	return files.find((file) => file.startsWith("runtime.")) ?? files.find((file) => file.endsWith(".js"));
}

function sha256(buffer) {
	return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Checks the public origin exactly the way the old Node health check did, but through CloudFront:
 * shell parity with the local build, security and preconnect headers, the live geo
 * endpoint, referral deep-link headers, and 404s for missing files.
 */
export async function verifyDeployment({ origin, publicDir, network, fetchImpl = fetch, scriptHashesMode = "report-only", imageSourcesMode = "report-only" }) {
	const base = origin.replace(/\/+$/, "");
	const expectedApiOrigin = network === "testnet" ? "https://api.hyperliquid-testnet.xyz" : "https://api.hyperliquid.xyz";
	const shell = readFileSync(join(publicDir, "_shell.html"));
	const buildMeta = JSON.parse(readFileSync(join(publicDir, "build-meta.json"), "utf8"));
	const results = [];
	async function check(name, run) {
		try {
			const detail = await run();
			results.push({ name, ok: true, detail: detail ?? "" });
		} catch (error) {
			results.push({ name, ok: false, detail: error instanceof Error ? error.message : String(error) });
		}
	}
	function expect(condition, message) {
		if (!condition) throw new Error(message);
	}

	await check("shell for a trade navigation", async () => {
		const response = await fetchImpl(`${base}/trade/HYPE`, { headers: { accept: "text/html" } });
		expect(response.status === 200, `status ${response.status}`);
		expect(sha256(Buffer.from(await response.arrayBuffer())) === sha256(shell), "body differs from local _shell.html");
		expect(response.headers.get("content-security-policy"), "missing content-security-policy");
		const link = response.headers.get("link") ?? "";
		expect(link.includes(`<${expectedApiOrigin}>`) && link.includes("preconnect"), `missing ${expectedApiOrigin} preconnect`);
		return `csp ok, preconnect ${expectedApiOrigin}`;
	});
	await check("legal pages match the build", async () => {
		const summary = { shell: 0, standalone: 0 };
		for (const key of RETIRED_PAGE_KEYS) {
			const localPage = join(publicDir, key);
			const standalone = existsSync(localPage);
			const expected = sha256(standalone ? readFileSync(localPage) : shell);
			const expectedName = standalone ? `local ${key}` : "local _shell.html";
			const route = `/${key.slice(0, -"/index.html".length)}`;
			for (const path of [route, `/${key}`]) {
				const response = await fetchImpl(`${base}${path}`, { headers: { accept: "text/html" } });
				expect(response.status === 200, `${path} status ${response.status}`);
				expect(sha256(Buffer.from(await response.arrayBuffer())) === expected, `${path} body differs from ${expectedName}`);
			}
			summary[standalone ? "standalone" : "shell"] += 1;
		}
		return `${summary.shell} shell, ${summary.standalone} standalone`;
	});
	await check("build metadata parity", async () => {
		const response = await fetchImpl(`${base}/build-meta.json`);
		expect(response.status === 200, `status ${response.status}`);
		const remote = await response.json();
		expect(remote.commit === buildMeta.commit && remote.release === buildMeta.release, "remote build-meta differs");
		const localGates = describeGateState(releaseGateState(buildMeta));
		const remoteGates = describeGateState(releaseGateState(remote));
		expect(remoteGates === localGates, `remote release gates (${remoteGates}) differ from the local build (${localGates})`);
		return `${remote.commit.slice(0, 8)} / ${remote.release} / ${remoteGates}`;
	});
	await check("geo endpoint answers with a real verdict", async () => {
		const response = await fetchImpl(`${base}/api/geo`, { headers: { accept: "application/json" } });
		const text = await response.text();
		expect(response.status === 200, `status ${response.status}: ${text.slice(0, 120)}`);
		const verdict = JSON.parse(text);
		expect(typeof verdict.country === "string" && verdict.country.length === 2, "verdict has no country");
		return `country ${verdict.country}`;
	});
	await check("signed lambda post with a payload hash", async () => {
		const body = JSON.stringify({ override: null });
		const response = await fetchImpl(`${base}/api/referral-geo`, {
			method: "POST",
			headers: {
				accept: "application/json",
				"content-type": "application/json",
				origin: base,
				"sec-fetch-site": "same-origin",
				[PAYLOAD_HASH_HEADER]: sha256(Buffer.from(body, "utf8")),
			},
			body,
		});
		const text = await response.text();
		expect(response.status === 200, `status ${response.status}: ${text.slice(0, 120)}`);
		const decision = JSON.parse(text);
		expect(typeof decision.status === "string", "decision has no status");
		return `status ${decision.status}`;
	});
	await check("referral deep link headers", async () => {
		const response = await fetchImpl(`${base}/join/__sairn_healthcheck__`, { headers: { accept: "text/html" } });
		expect(response.status === 200, `status ${response.status}`);
		expect(response.headers.get("cache-control") === "no-store", "cache-control must be no-store");
		expect(response.headers.get("referrer-policy") === "no-referrer", "referrer-policy must be no-referrer");
		expect((response.headers.get("x-robots-tag") ?? "").includes("noindex"), "x-robots-tag must be noindex");
		expect(response.headers.get("x-sairn-route") === "referral-join", "x-sairn-route marker missing");
	});
	await check("pairing page headers", async () => {
		const response = await fetchImpl(`${base}/mobile-agent-sync`, { headers: { accept: "text/html" } });
		expect(response.status === 200, `status ${response.status}`);
		expect(response.headers.get("cache-control") === "no-store", "cache-control must be no-store");
		expect(response.headers.get("referrer-policy") === "no-referrer", "referrer-policy must be no-referrer");
		expect(response.headers.get("x-sairn-route") === "mobile-agent-sync", "x-sairn-route marker missing");
	});
	await check("missing files stay 404", async () => {
		for (const path of ["/missing.webmanifest", "/.env"]) {
			const response = await fetchImpl(`${base}${path}`);
			expect(response.status === 404, `${path} status ${response.status}`);
		}
		const asset = await fetchImpl(`${base}/assets/missing-${Date.now()}.js`);
		expect(asset.status === 404, `asset status ${asset.status}`);
		const chart = await fetchImpl(`${base}/charting_library/missing-${Date.now()}.js`);
		expect(chart.status === 404, `chart status ${chart.status}`);
		const serverFn = await fetchImpl(`${base}/_serverFn/abc`);
		expect(serverFn.status === 404, `server function status ${serverFn.status}`);
	});
	await check("chart entry is immutable and preloaded by the shell", async () => {
		const href = /<link rel="preload" href="(\/charting_library\/charting_library\.[0-9a-f]{16}\.js)" as="script"/.exec(shell.toString("utf8"))?.[1];
		expect(href, "the local shell does not preload a content-hashed chart entry");
		expect(existsSync(join(publicDir, href.slice(1))), `${href} is not in the local build`);
		const response = await fetchImpl(`${base}${href}`);
		expect(response.status === 200, `status ${response.status}`);
		expect(response.headers.get("cache-control") === IMMUTABLE_CACHE_CONTROL, `cache-control ${response.headers.get("cache-control")}`);
		const plain = await fetchImpl(`${base}/charting_library/charting_library.js`);
		expect(plain.headers.get("cache-control") === REVALIDATE_CACHE_CONTROL, `unhashed entry cache-control ${plain.headers.get("cache-control")}`);
		return href;
	});
	await check("shell preloads the startup closure", async () => {
		const hrefs = [...shell.toString("utf8").matchAll(/<link rel="modulepreload" href="(\/assets\/[^"]+)"/g)].map((match) => match[1]);
		expect(hrefs.length >= MIN_SHELL_PRELOADS, `only ${hrefs.length} modulepreload links in the local shell`);
		for (const href of hrefs) expect(existsSync(join(publicDir, href.slice(1))), `${href} is not in the local build`);
		const response = await fetchImpl(`${base}${hrefs.at(-1)}`);
		expect(response.status === 200, `status ${response.status} for ${hrefs.at(-1)}`);
		expect(response.headers.get("cache-control") === IMMUTABLE_CACHE_CONTROL, `cache-control ${response.headers.get("cache-control")}`);
		for (const name of SURFACE_PRELOAD_META_NAMES) {
			expect(shell.toString("utf8").includes(`<meta name="${name}" content="`), `the local shell has no ${name} metadata`);
		}
		return `${hrefs.length} links`;
	});
	await check("inline scripts are allowed by the edge policy", async () => {
		const pages = listPrerenderedPages(publicDir).filter((page) => page === "_shell.html" || page.endsWith("/index.html"));
		const headerName = scriptHashesMode === "enforce" ? "content-security-policy" : "content-security-policy-report-only";
		let total = 0;
		for (const page of pages) {
			const route = page === "_shell.html" ? "/trade/HYPE" : `/${page.slice(0, -"/index.html".length)}`;
			const response = await fetchImpl(`${base}${route}`, { headers: { accept: "text/html" } });
			expect(response.status === 200, `${route} status ${response.status}`);
			const hashes = collectInlineScripts(await response.text()).map((script) => script.hash);
			const scriptSrc = /(?:^|;\s*)script-src ([^;]*)/.exec(response.headers.get(headerName) ?? "")?.[1];
			expect(scriptSrc !== undefined, `${route} has no ${headerName} with a script-src`);
			for (const hash of hashes) expect(scriptSrc.includes(`'${hash}'`), `${route}: ${headerName} does not allow inline script ${hash}`);
			if (scriptHashesMode === "enforce") expect(!scriptSrc.includes("'unsafe-inline'"), `${route}: script-src still allows 'unsafe-inline'`);
			total += hashes.length;
		}
		return `${pages.length} pages, ${total} inline scripts, ${scriptHashesMode}`;
	});
	await check("image sources follow the edge config", async () => {
		const response = await fetchImpl(`${base}/trade/HYPE`, { headers: { accept: "text/html" } });
		const headerName = imageSourcesMode === "enforce" ? "content-security-policy" : "content-security-policy-report-only";
		const imgSrc = /(?:^|;\s*)img-src ([^;]*)/.exec(response.headers.get(headerName) ?? "")?.[1];
		expect(imgSrc !== undefined, `no ${headerName} with an img-src`);
		const sources = imgSrc.split(" ");
		expect(sources.includes("'self'") && !sources.includes("https:"), `${headerName} img-src still allows any https origin: ${imgSrc}`);
		return `${sources.length} sources, ${imageSourcesMode}`;
	});
	await check("health probe answers 204", async () => {
		const response = await fetchImpl(`${base}/api/health`);
		expect(response.status === 204, `status ${response.status}`);
		expect(response.headers.get("cache-control") === NO_STORE, `cache-control ${response.headers.get("cache-control")}`);
	});
	await check("shell repeats from the edge", async () => {
		await fetchImpl(`${base}/trade/HYPE`, { headers: { accept: "text/html" } });
		const response = await fetchImpl(`${base}/trade/HYPE`, { headers: { accept: "text/html" } });
		expect(response.headers.get("cache-control") === HTML_CACHE_CONTROL, `cache-control ${response.headers.get("cache-control")}`);
		const cache = response.headers.get("x-cache") ?? "";
		expect(/^(Hit|RefreshHit) from cloudfront/.test(cache), `x-cache ${cache || "missing"}`);
		return cache;
	});
	await check("chart bundles are immutable at the edge", async () => {
		const bundle = findChartBundle(publicDir);
		expect(bundle, "no hashed chart bundle in the local build");
		await fetchImpl(`${base}/charting_library/bundles/${bundle}`);
		const response = await fetchImpl(`${base}/charting_library/bundles/${bundle}`);
		expect(response.status === 200, `status ${response.status}`);
		expect(response.headers.get("cache-control") === IMMUTABLE_CACHE_CONTROL, `cache-control ${response.headers.get("cache-control")}`);
		const cache = response.headers.get("x-cache") ?? "";
		expect(/^(Hit|RefreshHit) from cloudfront/.test(cache), `x-cache ${cache || "missing"}`);
		return `${bundle} ${cache}`;
	});
	if (network === "testnet") {
		await check("testnet stays out of search results", async () => {
			const response = await fetchImpl(`${base}/trade/HYPE`, { headers: { accept: "text/html" } });
			expect((response.headers.get("x-robots-tag") ?? "").includes("noindex"), "x-robots-tag must be noindex");
		});
	}
	return results;
}

export const DEFAULT_RELEASE_PROFILE = "gatu-edge";

/** The AWS CLI profile for every command: `--profile`, else `AWS_PROFILE`, else the release user. */
export function resolveAwsProfile({ profile, env = process.env }) {
	const chosen = (profile ?? env.AWS_PROFILE ?? DEFAULT_RELEASE_PROFILE).trim();
	if (!chosen) throw new Error("An AWS profile name is required");
	return chosen;
}

/** Releases run as the restricted IAM user, never as the account root; see deploy/cloudfront/iam/. */
export function assertReleaseIdentity(identityArn) {
	if (typeof identityArn !== "string" || identityArn.length === 0) throw new Error("Could not read the AWS caller identity");
	if (/:root$/.test(identityArn)) throw new Error(`Refusing to release as the account root (${identityArn}); use the ${DEFAULT_RELEASE_PROFILE} IAM user`);
	if (!/:(user|assumed-role)\//.test(identityArn)) throw new Error(`Unexpected release identity ${identityArn}`);
	return identityArn;
}

let awsProfile;

function readArgs(argv) {
	const [command, ...rest] = argv;
	const options = {
		command,
		execute: false,
		publicDir: "apps/terminal/.output/public",
		lambdaDir: "apps/terminal/dist-lambda",
		lambdaEntry: "index.mjs",
		network: "mainnet",
		acknowledged: [],
	};
	for (let index = 0; index < rest.length; index += 1) {
		const argument = rest[index];
		const [flag, inline] = argument.split("=", 2);
		const value = () => inline ?? rest[++index];
		switch (flag) {
			case "--execute":
				options.execute = true;
				break;
			case "--bucket":
				options.bucket = value();
				break;
			case "--distribution":
				options.distributionId = value();
				break;
			case "--function-name":
				options.functionName = value();
				break;
			case "--public-dir":
				options.publicDir = value();
				break;
			case "--lambda-dir":
				options.lambdaDir = value();
				break;
			case "--origin":
				options.origin = value();
				break;
			case "--only":
				(options.prefixes ??= []).push(value());
				break;
			case "--lambda-entry":
				options.lambdaEntry = value();
				break;
			case "--network":
				options.network = value();
				break;
			case "--alias":
				(options.aliases ??= []).push(value());
				break;
			case "--certificate-arn":
				options.certificateArn = value();
				break;
			case "--profile":
				options.profile = value();
				break;
			case "--allow-sponsored-mainnet-deposits":
			case "--allow-mobile-pairing":
				options.acknowledged.push(RELEASE_GATES.find((gate) => gate.option === flag).id);
				break;
			default:
				throw new Error(`Unknown argument ${argument}`);
		}
	}
	return options;
}

function awsArgs(args) {
	return awsProfile ? [...args, "--profile", awsProfile] : args;
}

function runAws(args, execute) {
	const full = awsArgs(args);
	console.log(`aws ${full.map((arg) => (/[\s*]/.test(arg) ? JSON.stringify(arg) : arg)).join(" ")}`);
	if (!execute) return;
	execFileSync("aws", full, { stdio: ["ignore", "inherit", "inherit"] });
}

function readAwsJson(args) {
	return JSON.parse(
		execFileSync("aws", [...awsArgs(args), "--output", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }),
	);
}

/** The code CloudFront currently runs for a function; `get-function` writes it to a file. */
function readLiveFunctionCode(name) {
	const outFile = join(tmpdir(), `${name}-live-${process.pid}.js`);
	try {
		readAwsJson(["cloudfront", "get-function", "--name", name, "--stage", "LIVE", outFile]);
		return readFileSync(outFile, "utf8");
	} finally {
		rmSync(outFile, { force: true });
	}
}

/** Uploading pages whose inline scripts the live policy does not allow would be an outage under `enforce`. */
function assertLivePolicyAllowsBuild(publicDir) {
	const build = collectInlineScriptHashes(publicDir);
	const missing = missingScriptHashes(readLiveFunctionCode(RESPONSE_FUNCTION_NAME), build.hashes);
	if (missing.length > 0) {
		throw new Error(
			`The live ${RESPONSE_FUNCTION_NAME} function does not allow ${missing.length} of this build's ${build.hashes.length} inline script hashes; run: node deploy/cloudfront/deploy.mjs functions --execute`,
		);
	}
	console.log(`The live edge policy allows all ${build.hashes.length} inline script hashes of this build`);
}

/**
 * Build flags that expose a funds or credential path. `build-meta.json` records what the build
 * actually baked in, and an upload that turns one on needs the operator to say so again: the value
 * in `.env.local` alone is not an acknowledgement. Naming a gate the build does not expose is
 * refused too, because the operator and the artifact then disagree about what is being released.
 */
export const RELEASE_GATES = Object.freeze([
	{
		id: "sponsored-mainnet-deposits",
		option: "--allow-sponsored-mainnet-deposits",
		label: "sponsored Mainnet CCTP deposits",
		read: (buildMeta) => buildMeta.cctpDeposits?.mainnetSponsoredWallet,
	},
	{
		id: "mobile-pairing",
		option: "--allow-mobile-pairing",
		label: "Mobile Agent pairing",
		read: (buildMeta) => {
			const pairing = buildMeta.mobileSync;
			if (typeof pairing?.enabled === "boolean") return pairing.enabled;
			if (typeof pairing?.createAndReveal !== "boolean" || typeof pairing?.importFromQr !== "boolean") return undefined;
			return pairing.createAndReveal || pairing.importFromQr;
		},
	},
]);

/** The gate state of a build, compared between the local artifact and the live origin. */
export function releaseGateState(buildMeta) {
	return Object.fromEntries(
		RELEASE_GATES.map((gate) => {
			const exposed = gate.read(buildMeta);
			if (typeof exposed !== "boolean") throw new Error(`build-meta.json does not record ${gate.label}; rebuild with the current source`);
			return [gate.id, exposed];
		}),
	);
}

export function evaluateReleaseGates({ buildMeta, acknowledged = [] }) {
	const state = releaseGateState(buildMeta);
	const problems = [];
	for (const gate of RELEASE_GATES) {
		const named = acknowledged.includes(gate.id);
		if (state[gate.id] && !named) problems.push(`This build exposes ${gate.label}; pass ${gate.option} to acknowledge it, or rebuild with the flag off`);
		if (!state[gate.id] && named) problems.push(`${gate.option} was passed but this build does not expose ${gate.label}; rebuild with the flag on, or drop the option`);
	}
	return { state, problems };
}

function describeGateState(state) {
	return Object.entries(state)
		.map(([id, exposed]) => `${id}=${exposed ? "on" : "off"}`)
		.join(" ");
}

/** The files a viewer receives first; a sync that stopped early must never look like a release. */
export const RELEASE_MARKER_FILES = ["_shell.html", "build-meta.json"];

export function assertReleaseMarkersUploaded({ bucket, publicDir, headObject }) {
	for (const file of RELEASE_MARKER_FILES) {
		const localBytes = statSync(join(publicDir, file)).size;
		const remoteBytes = headObject(bucket, file);
		if (remoteBytes !== localBytes) {
			throw new Error(`${file} in s3://${bucket} is ${remoteBytes} bytes but the local build is ${localBytes} bytes; the sync did not finish`);
		}
	}
}

function requireOption(options, name) {
	if (!options[name]) throw new Error(`--${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} is required`);
	return options[name];
}

async function main() {
	const options = readArgs(process.argv.slice(2));
	const publicDir = resolve(options.publicDir);
	if (options.command !== "verify") {
		awsProfile = resolveAwsProfile({ profile: options.profile });
		console.log(`aws profile: ${awsProfile}`);
		if (options.execute) assertReleaseIdentity(readAwsJson(["sts", "get-caller-identity"]).Arn);
	}
	switch (options.command) {
		case "sync": {
			const bucket = requireOption(options, "bucket");
			if (!existsSync(join(publicDir, "_shell.html"))) throw new Error(`No _shell.html in ${publicDir}; run pnpm build first`);
			const gates = evaluateReleaseGates({
				buildMeta: JSON.parse(readFileSync(join(publicDir, "build-meta.json"), "utf8")),
				acknowledged: options.acknowledged,
			});
			console.log(`release gates: ${describeGateState(gates.state)}`);
			if (gates.problems.length > 0) {
				if (options.execute) throw new Error(gates.problems.join("\n"));
				for (const problem of gates.problems) console.warn(`An executing sync would refuse this build: ${problem}`);
			}
			if (options.execute) assertLivePolicyAllowsBuild(publicDir);
			const files = listPublicFiles(publicDir);
			for (const command of buildSyncCommands({ publicDir, bucket, files })) {
				runAws(command, options.execute);
			}
			for (const command of buildRetiredPageCommands({ publicDir, bucket, files })) {
				runAws(command, options.execute);
			}
			if (options.execute) {
				assertReleaseMarkersUploaded({
					bucket,
					publicDir,
					headObject: (name, key) => readAwsJson(["s3api", "head-object", "--bucket", name, "--key", key]).ContentLength,
				});
				console.log(`Release markers match the local build: ${RELEASE_MARKER_FILES.join(", ")}`);
			}
			break;
		}
		case "reupload": {
			const bucket = requireOption(options, "bucket");
			const prefixes = requireOption(options, "prefixes");
			const commands = buildReuploadCommands({ bucket, files: listPublicFiles(publicDir), prefixes });
			if (commands.length === 0) throw new Error(`No uploadable files match ${prefixes.join(", ")}`);
			for (const command of commands) runAws(command, options.execute);
			break;
		}
		case "invalidate":
			runAws(buildInvalidationCommand(requireOption(options, "distributionId")), options.execute);
			break;
		case "aliases": {
			const distributionId = requireOption(options, "distributionId");
			const aliases = requireOption(options, "aliases");
			const certificateArn = requireOption(options, "certificateArn");
			const live = readAwsJson(["cloudfront", "get-distribution-config", "--id", distributionId]);
			const updated = applyDistributionAliases(live.DistributionConfig, { aliases, certificateArn });
			const file = join(tmpdir(), `sairn-distribution-${distributionId}-${process.pid}.json`);
			writeFileSync(file, `${JSON.stringify(updated, null, 2)}\n`);
			console.log(`Distribution ${distributionId}: aliases ${aliases.join(", ")} with certificate ${certificateArn} (ETag ${live.ETag}) → ${file}`);
			runAws(
				["cloudfront", "update-distribution", "--id", distributionId, "--if-match", live.ETag, "--distribution-config", `file://${file}`],
				options.execute,
			);
			runAws(["cloudfront", "wait", "distribution-deployed", "--id", distributionId], options.execute);
			break;
		}
		case "lambda": {
			const functionName = requireOption(options, "functionName");
			const bundle = resolve(options.lambdaDir, options.lambdaEntry);
			if (!existsSync(bundle) || !statSync(bundle).isFile()) throw new Error(`No Lambda bundle at ${bundle}; run pnpm --filter @gatu/terminal build:lambda`);
			const zipPath = resolve(options.lambdaDir, `${options.lambdaEntry.replace(/\.mjs$/, "")}.zip`);
			console.log(`zip -j ${zipPath} ${bundle}`);
			if (options.execute) execFileSync("zip", ["-j", "-q", zipPath, bundle], { stdio: "inherit" });
			for (const command of buildLambdaCommands({ functionName, zipPath })) runAws(command, options.execute);
			break;
		}
		case "functions": {
			for (const { name, file } of CLOUDFRONT_FUNCTIONS) {
				let path = resolve(FUNCTIONS_DIR, file);
				if (!existsSync(path)) throw new Error(`No CloudFront Function code at ${path}`);
				if (name === RESPONSE_FUNCTION_NAME) {
					if (!existsSync(join(publicDir, "_shell.html"))) throw new Error(`No _shell.html in ${publicDir}; the response function needs the build's inline script hashes`);
					const servedHashes = options.origin ? await collectServedScriptHashes({ origin: options.origin, publicDir }) : [];
					if (!options.origin) console.warn("No --origin given: the served pages' hashes are not checked; pass the CloudFront origin so a rotation cannot drop a page still online");
					const prepared = prepareResponseFunction({
						committedCode: readFileSync(path, "utf8"),
						buildHashes: collectInlineScriptHashes(publicDir).hashes,
						liveCode: options.execute ? readLiveFunctionCode(name) : "",
						servedHashes,
					});
					path = releaseFunctionPath(publicDir);
					mkdirSync(dirname(path), { recursive: true });
					writeFileSync(path, prepared.code);
					console.log(
						`Rendered ${path}: ${prepared.current.length} current + ${prepared.previous.length} previous inline script hashes${options.execute ? "" : " (dry run: the previous set comes from the live function)"}`,
					);
				}
				const current = options.execute ? readAwsJson(["cloudfront", "describe-function", "--name", name]) : { ETag: "<etag>" };
				const [update, publish] = buildFunctionUpdateCommands({ name, file: path, etag: current.ETag, comment: functionComment(file) });
				runAws(update, options.execute);
				const updatedEtag = options.execute ? readAwsJson(["cloudfront", "describe-function", "--name", name]).ETag : "<updated-etag>";
				runAws([...publish.slice(0, -1), updatedEtag], options.execute);
			}
			break;
		}
		case "verify": {
			const results = await verifyDeployment({
				origin: requireOption(options, "origin"),
				publicDir,
				network: options.network,
				scriptHashesMode: readEdgeConfig().cspScriptHashes,
				imageSourcesMode: readEdgeConfig().cspImageSources,
			});
			for (const result of results) console.log(`${result.ok ? "ok  " : "FAIL"} ${result.name}${result.detail ? ` — ${result.detail}` : ""}`);
			if (results.some((result) => !result.ok)) process.exit(1);
			break;
		}
		default:
			console.error("usage: node deploy/cloudfront/deploy.mjs <sync|reupload|invalidate|aliases|lambda|functions|verify> [--execute] [--bucket B] [--only PREFIX]... [--alias HOST]... [--certificate-arn ARN] [--distribution ID] [--function-name F] [--lambda-entry index.mjs] [--origin URL] [--network mainnet|testnet] [--allow-sponsored-mainnet-deposits] [--allow-mobile-pairing]");
			process.exit(2);
	}
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	});
}
