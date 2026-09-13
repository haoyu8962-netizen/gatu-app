#!/usr/bin/env node
// Static deployment of the trading terminal: uploads the client build to S3 in an order that never
// lets a new shell reference missing assets, invalidates CloudFront, updates the API Lambda and
// verifies the public origin. Every AWS command is printed; nothing runs without `--execute`.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
/** Versioned by its `?v=<commit>` query in the browser and refreshed at the edge by the release invalidation. */
const CHART_ENTRY_KEY = "charting_library/charting_library.js";
/** The build injects the trade startup closure into the shell; a shell with fewer links skipped that step. */
const MIN_SHELL_PRELOADS = 20;

/** Cache policy for one object in the public directory; `null` means the file is not uploaded. */
export function objectCacheControl(relativePath) {
	const key = relativePath.replaceAll("\\", "/");
	if (PRECOMPRESSED_EXTENSIONS.has(extname(key))) return null;
	if (key.startsWith("assets/") || HASHED_CHART_BUNDLE.test(key) || key === CHART_ENTRY_KEY) return IMMUTABLE_CACHE_CONTROL;
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

function chunk(items, size) {
	const chunks = [];
	for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
	return chunks;
}

/**
 * `aws s3 sync` skips unchanged files, so a cache policy change never reaches objects that are
 * already in the bucket. This re-uploads the selected files with `aws s3 cp` (which always writes
 * the object and its metadata), grouped by cache policy and bounded per command.
 */
export function buildReuploadCommands({ publicDir, bucket, files, prefixes }) {
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
					publicDir,
					`s3://${bucket}`,
					"--recursive",
					"--exclude",
					"*",
					...includes,
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
 * shell and document parity with the local build, security and preconnect headers, the live geo
 * endpoint, referral deep-link headers, and 404s for missing files.
 */
export async function verifyDeployment({ origin, publicDir, network, fetchImpl = fetch }) {
	const base = origin.replace(/\/+$/, "");
	const expectedApiOrigin = network === "testnet" ? "https://api.hyperliquid-testnet.xyz" : "https://api.hyperliquid.xyz";
	const shell = readFileSync(join(publicDir, "_shell.html"));
	const docs = readFileSync(join(publicDir, "docs", "index.html"));
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
	await check("prerendered document route", async () => {
		const response = await fetchImpl(`${base}/docs`, { headers: { accept: "text/html" } });
		expect(response.status === 200, `status ${response.status}`);
		expect(sha256(Buffer.from(await response.arrayBuffer())) === sha256(docs), "body differs from local docs/index.html");
		expect(!(response.headers.get("link") ?? "").includes("preconnect"), "document route must not preconnect the API");
	});
	await check("build metadata parity", async () => {
		const response = await fetchImpl(`${base}/build-meta.json`);
		expect(response.status === 200, `status ${response.status}`);
		const remote = await response.json();
		expect(remote.commit === buildMeta.commit && remote.release === buildMeta.release, "remote build-meta differs");
		return `${remote.commit.slice(0, 8)} / ${remote.release}`;
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
		const response = await fetchImpl(`${base}/join/__gatu_healthcheck__`, { headers: { accept: "text/html" } });
		expect(response.status === 200, `status ${response.status}`);
		expect(response.headers.get("cache-control") === "no-store", "cache-control must be no-store");
		expect(response.headers.get("referrer-policy") === "no-referrer", "referrer-policy must be no-referrer");
		expect((response.headers.get("x-robots-tag") ?? "").includes("noindex"), "x-robots-tag must be noindex");
		expect(response.headers.get("x-gatu-route") === "referral-join", "x-gatu-route marker missing");
	});
	await check("missing files stay 404", async () => {
		const asset = await fetchImpl(`${base}/assets/missing-${Date.now()}.js`);
		expect(asset.status === 404, `asset status ${asset.status}`);
		const chart = await fetchImpl(`${base}/charting_library/missing-${Date.now()}.js`);
		expect(chart.status === 404, `chart status ${chart.status}`);
		const serverFn = await fetchImpl(`${base}/_serverFn/abc`);
		expect(serverFn.status === 404, `server function status ${serverFn.status}`);
	});
	await check("chart entry is immutable and preloaded by the shell", async () => {
		const href = /<link rel="preload" href="(\/charting_library\/charting_library\.js\?v=[^"]+)" as="script"/.exec(shell.toString("utf8"))?.[1];
		expect(href, "the local shell does not preload the chart entry");
		const response = await fetchImpl(`${base}${href}`);
		expect(response.status === 200, `status ${response.status}`);
		expect(response.headers.get("cache-control") === IMMUTABLE_CACHE_CONTROL, `cache-control ${response.headers.get("cache-control")}`);
		return href;
	});
	await check("shell preloads the startup closure", async () => {
		const hrefs = [...shell.toString("utf8").matchAll(/<link rel="modulepreload" href="(\/assets\/[^"]+)"/g)].map((match) => match[1]);
		expect(hrefs.length >= MIN_SHELL_PRELOADS, `only ${hrefs.length} modulepreload links in the local shell`);
		for (const href of hrefs) expect(existsSync(join(publicDir, href.slice(1))), `${href} is not in the local build`);
		const response = await fetchImpl(`${base}${hrefs.at(-1)}`);
		expect(response.status === 200, `status ${response.status} for ${hrefs.at(-1)}`);
		expect(response.headers.get("cache-control") === IMMUTABLE_CACHE_CONTROL, `cache-control ${response.headers.get("cache-control")}`);
		return `${hrefs.length} links`;
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

function readArgs(argv) {
	const [command, ...rest] = argv;
	const options = {
		command,
		execute: false,
		publicDir: "apps/terminal/.output/public",
		lambdaDir: "apps/terminal/dist-lambda",
		network: "mainnet",
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
			case "--network":
				options.network = value();
				break;
			default:
				throw new Error(`Unknown argument ${argument}`);
		}
	}
	return options;
}

function runAws(args, execute) {
	console.log(`aws ${args.map((arg) => (/[\s*]/.test(arg) ? JSON.stringify(arg) : arg)).join(" ")}`);
	if (!execute) return;
	execFileSync("aws", args, { stdio: ["ignore", "inherit", "inherit"] });
}

function readAwsJson(args) {
	return JSON.parse(execFileSync("aws", [...args, "--output", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }));
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
	switch (options.command) {
		case "sync": {
			const bucket = requireOption(options, "bucket");
			if (!existsSync(join(publicDir, "_shell.html"))) throw new Error(`No _shell.html in ${publicDir}; run pnpm build first`);
			for (const command of buildSyncCommands({ publicDir, bucket, files: listPublicFiles(publicDir) })) {
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
			const commands = buildReuploadCommands({ publicDir, bucket, files: listPublicFiles(publicDir), prefixes });
			if (commands.length === 0) throw new Error(`No uploadable files match ${prefixes.join(", ")}`);
			for (const command of commands) runAws(command, options.execute);
			break;
		}
		case "invalidate":
			runAws(buildInvalidationCommand(requireOption(options, "distributionId")), options.execute);
			break;
		case "lambda": {
			const functionName = requireOption(options, "functionName");
			const bundle = resolve(options.lambdaDir, "index.mjs");
			if (!existsSync(bundle) || !statSync(bundle).isFile()) throw new Error(`No Lambda bundle at ${bundle}; run pnpm --filter @gatu/terminal build:lambda`);
			const zipPath = resolve(options.lambdaDir, "lambda.zip");
			console.log(`zip -j ${zipPath} ${bundle}`);
			if (options.execute) execFileSync("zip", ["-j", "-q", zipPath, bundle], { stdio: "inherit" });
			for (const command of buildLambdaCommands({ functionName, zipPath })) runAws(command, options.execute);
			break;
		}
		case "verify": {
			const results = await verifyDeployment({ origin: requireOption(options, "origin"), publicDir, network: options.network });
			for (const result of results) console.log(`${result.ok ? "ok  " : "FAIL"} ${result.name}${result.detail ? ` — ${result.detail}` : ""}`);
			if (results.some((result) => !result.ok)) process.exit(1);
			break;
		}
		default:
			console.error("usage: node deploy/cloudfront/deploy.mjs <sync|reupload|invalidate|lambda|verify> [--execute] [--bucket B] [--only PREFIX]... [--distribution ID] [--function-name F] [--origin URL] [--network mainnet|testnet]");
			process.exit(2);
	}
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	});
}
