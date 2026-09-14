import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { cspHash } from "../../scripts/collect-inline-script-hashes.mjs";
import { parseScriptHashes } from "./function-code.mjs";
import {
	assertReleaseMarkersUploaded,
	buildFunctionUpdateCommands,
	buildInvalidationCommand,
	buildLambdaCommands,
	buildReuploadCommands,
	buildSyncCommands,
	HTML_CACHE_CONTROL,
	IMMUTABLE_CACHE_CONTROL,
	NO_STORE,
	objectCacheControl,
	planUpload,
	prepareResponseFunction,
	releaseFunctionPath,
	REVALIDATE_CACHE_CONTROL,
	verifyDeployment,
} from "./deploy.mjs";

test("objects get the cache policy the edge expects", () => {
	assert.equal(objectCacheControl("assets/index-abc.js"), IMMUTABLE_CACHE_CONTROL);
	assert.equal(objectCacheControl("charting_library/bundles/runtime.4d986d07cb97d8edacba.js"), IMMUTABLE_CACHE_CONTROL);
	assert.equal(objectCacheControl("charting_library/bundles/1227.68542dac293294290d44.rtl.css"), IMMUTABLE_CACHE_CONTROL);
	assert.equal(objectCacheControl("charting_library/bundles/EuclidCircular.be8f862db48c2976009f.woff2"), IMMUTABLE_CACHE_CONTROL);
	assert.equal(objectCacheControl("charting_library/bundles/library.js"), REVALIDATE_CACHE_CONTROL);
	assert.equal(objectCacheControl("charting_library/charting_library.js"), IMMUTABLE_CACHE_CONTROL);
	assert.equal(objectCacheControl("charting_library/charting_library.esm.js"), REVALIDATE_CACHE_CONTROL);
	assert.equal(objectCacheControl("charting_library/sameorigin.html"), REVALIDATE_CACHE_CONTROL);
	assert.ok(HTML_CACHE_CONTROL.includes("s-maxage=60") && HTML_CACHE_CONTROL.includes("stale-while-revalidate"));
	assert.equal(objectCacheControl("tradingview-theme-dark.css"), REVALIDATE_CACHE_CONTROL);
	assert.equal(objectCacheControl("_shell.html"), HTML_CACHE_CONTROL);
	assert.equal(objectCacheControl("docs/index.html"), HTML_CACHE_CONTROL);
	assert.equal(objectCacheControl("build-meta.json"), NO_STORE);
	assert.equal(objectCacheControl("sw.js"), NO_STORE);
	assert.equal(objectCacheControl("manifest.json"), REVALIDATE_CACHE_CONTROL);
	assert.equal(objectCacheControl("assets/index-abc.js.br"), null);
	assert.equal(objectCacheControl("sw.js.gz"), null);
});

test("html and build metadata upload after every asset, precompressed siblings are skipped", () => {
	const files = ["_shell.html", "assets/a.js", "assets/a.js.br", "build-meta.json", "docs/index.html", "sw.js"];
	const plan = planUpload(files);
	assert.deepEqual(
		plan.early.map((item) => item.file),
		["assets/a.js", "sw.js"],
	);
	assert.deepEqual(
		plan.late.map((item) => item.file),
		["_shell.html", "build-meta.json", "docs/index.html"],
	);
	const commands = buildSyncCommands({ publicDir: "/out/public", bucket: "gatu-terminal", files });
	assert.equal(commands.length, 4);
	for (const command of commands) {
		assert.deepEqual(command.slice(0, 4), ["s3", "sync", "/out/public", "s3://gatu-terminal"]);
		assert.ok(!command.includes("--delete"));
		assert.ok(command.includes("--exclude") && command.includes("--cache-control"));
	}
	assert.ok(commands[0].includes("assets/a.js") && commands[0].includes(IMMUTABLE_CACHE_CONTROL));
	assert.ok(commands.at(-1).includes("build-meta.json") || commands.at(-1).includes("_shell.html"));
	assert.ok(!commands.flat().includes("assets/a.js.br"));
});

test("reupload rewrites only the selected files with cp, bounded per command", () => {
	const files = ["_shell.html", "assets/a.js", "charting_library/bundles/x.0123456789abcdef0123.js", "charting_library/charting_library.js", "docs/index.html"];
	const commands = buildReuploadCommands({ publicDir: "/out/public", bucket: "b", files, prefixes: ["charting_library/bundles/", "_shell.html"] });
	assert.equal(commands.length, 2);
	assert.deepEqual(commands[0].slice(0, 5), ["s3", "cp", "/out/public", "s3://b", "--recursive"]);
	assert.ok(commands[0].includes("charting_library/bundles/x.0123456789abcdef0123.js") && commands[0].includes(IMMUTABLE_CACHE_CONTROL));
	assert.ok(commands[1].includes("_shell.html") && commands[1].includes(HTML_CACHE_CONTROL));
	assert.ok(!commands.flat().includes("docs/index.html") && !commands.flat().includes("charting_library/charting_library.js"));
	const many = Array.from({ length: 1_001 }, (_, index) => `charting_library/bundles/${index}.0123456789abcdef0123.js`);
	assert.equal(buildReuploadCommands({ publicDir: "/p", bucket: "b", files: many, prefixes: ["charting_library/"] }).length, 3);
});

test("a sync that stopped before the shell is reported instead of passing silently", () => {
	const publicDir = createPublicDir();
	const sizes = { "_shell.html": SHELL_HTML.length, "build-meta.json": JSON.stringify({ commit: "abc", release: "r1" }).length };
	assert.doesNotThrow(() => assertReleaseMarkersUploaded({ bucket: "b", publicDir, headObject: (_, key) => sizes[key] }));
	assert.throws(
		() => assertReleaseMarkersUploaded({ bucket: "b", publicDir, headObject: (_, key) => (key === "_shell.html" ? 12_677 : sizes[key]) }),
		/_shell.html in s3:\/\/b is 12677 bytes/,
	);
});

test("cloudfront functions are updated from their files and published with the returned etag", () => {
	const [update, publish] = buildFunctionUpdateCommands({ name: "gatu-terminal-response", file: "/repo/deploy/cloudfront/functions/terminal-response.js", etag: "E1", comment: "gatu route marker + csp" });
	assert.deepEqual(update.slice(0, 6), ["cloudfront", "update-function", "--name", "gatu-terminal-response", "--if-match", "E1"]);
	assert.ok(update.includes("fileb:///repo/deploy/cloudfront/functions/terminal-response.js"));
	assert.ok(update.includes("Comment=gatu route marker + csp,Runtime=cloudfront-js-2.0"));
	assert.deepEqual(publish, ["cloudfront", "publish-function", "--name", "gatu-terminal-response", "--if-match", "<updated-etag>"]);
});

test("invalidation and lambda commands are explicit and bounded", () => {
	assert.deepEqual(buildInvalidationCommand("E123"), [
		"cloudfront",
		"create-invalidation",
		"--distribution-id",
		"E123",
		"--paths",
		"/*",
	]);
	const [update, wait] = buildLambdaCommands({ functionName: "gatu-terminal-api", zipPath: "/tmp/lambda.zip" });
	assert.ok(update.includes("update-function-code") && update.includes("fileb:///tmp/lambda.zip") && update.includes("--publish"));
	assert.ok(wait.includes("function-updated"));
});

const SHELL_PRELOADS = Array.from({ length: 24 }, (_, index) => `/assets/chunk-${index}.js`);
const CHART_ENTRY = "/charting_library/charting_library.js?v=abc";
const THEME_SCRIPT = '(()=>{document.documentElement.classList.add("dark")})();';
const THEME_HASH = cspHash(THEME_SCRIPT);
const SHELL_HTML = `<html><head><script>${THEME_SCRIPT}</script>${SHELL_PRELOADS.map((href) => `<link rel="modulepreload" href="${href}"/>`).join("")}<link rel="preload" href="${CHART_ENTRY}" as="script" media="(min-width: 1001px)"/><meta name="gatu-preload-desktop" content="/assets/chunk-1.js"/><meta name="gatu-preload-mobile" content=""/><meta name="gatu-chart-prefetch" content="/charting_library/sameorigin.html"/></head></html>`;
const REPORT_ONLY_HEADER = `default-src 'self'; script-src 'self' 'report-sample' '${THEME_HASH}'; report-uri https://reports.example/`;

function createPublicDir() {
	const dir = mkdtempSync(join(tmpdir(), "gatu-cf-verify-"));
	mkdirSync(join(dir, "docs"), { recursive: true });
	mkdirSync(join(dir, "assets"), { recursive: true });
	for (const href of SHELL_PRELOADS) writeFileSync(join(dir, href.slice(1)), "js");
	writeFileSync(join(dir, "_shell.html"), SHELL_HTML);
	writeFileSync(join(dir, "docs", "index.html"), "<html>docs</html>");
	writeFileSync(join(dir, "build-meta.json"), JSON.stringify({ commit: "abc", release: "r1" }));
	mkdirSync(join(dir, "charting_library", "bundles"), { recursive: true });
	writeFileSync(join(dir, "charting_library", "bundles", "runtime.4d986d07cb97d8edacba.js"), "js");
	return dir;
}

function edgeSequence(route) {
	let hits = 0;
	return () => ({ ...route, headers: { ...route.headers, "x-cache": hits++ === 0 ? "Miss from cloudfront" : "Hit from cloudfront" } });
}

function fakeFetch(routes) {
	return async (url, init) => {
		const path = new URL(url).pathname;
		const route = routes[path] ?? routes["*"];
		const { status = 200, body = "", headers = {} } = typeof route === "function" ? route(init) : route;
		return new Response(body, { status, headers });
	};
}

test("verification passes when the edge serves the build with the expected headers", async () => {
	const publicDir = createPublicDir();
	const headers = { "content-security-policy": "default-src 'self'", "content-security-policy-report-only": REPORT_ONLY_HEADER, link: "<https://api.hyperliquid.xyz>; rel=preconnect" };
	const results = await verifyDeployment({
		origin: "https://app.gatu.ai/",
		publicDir,
		network: "mainnet",
		scriptHashesMode: "report-only",
		fetchImpl: fakeFetch({
			"/trade/HYPE": edgeSequence({ body: SHELL_HTML, headers: { ...headers, "cache-control": HTML_CACHE_CONTROL } }),
			[SHELL_PRELOADS.at(-1)]: { body: "js", headers: { "cache-control": IMMUTABLE_CACHE_CONTROL } },
			"/api/health": { status: 204, body: null, headers: { "cache-control": NO_STORE } },
			"/charting_library/bundles/runtime.4d986d07cb97d8edacba.js": edgeSequence({ body: "js", headers: { "cache-control": IMMUTABLE_CACHE_CONTROL } }),
			"/docs": { body: "<html>docs</html>", headers: { "content-security-policy": "x", "content-security-policy-report-only": REPORT_ONLY_HEADER } },
			"/build-meta.json": { body: JSON.stringify({ commit: "abc", release: "r1" }) },
			"/api/geo": { body: JSON.stringify({ country: "GB", proxy: false, tradeRestricted: false }) },
			"/api/referral-geo": (init) => ({
				status: init?.method === "POST" && /^[0-9a-f]{64}$/.test(init.headers?.["x-amz-content-sha256"] ?? "") ? 200 : 403,
				body: JSON.stringify({ checkedAt: 1, country: "GB", status: "allowed", ttlMs: 60_000 }),
			}),
			"/join/__gatu_healthcheck__": {
				body: SHELL_HTML,
				headers: { "cache-control": "no-store", "referrer-policy": "no-referrer", "x-robots-tag": "noindex, nofollow", "x-gatu-route": "referral-join" },
			},
			"/charting_library/charting_library.js": { body: "js", headers: { "cache-control": IMMUTABLE_CACHE_CONTROL } },
			"*": { status: 404, body: "missing" },
		}),
	});
	assert.deepEqual(
		results.filter((result) => !result.ok),
		[],
	);
	assert.equal(results.length, 13);
	assert.equal(results.find((result) => result.name === "shell preloads the startup closure")?.detail, "24 links");
	assert.equal(results.find((result) => result.name === "inline scripts are allowed by the edge policy")?.detail, "2 pages, 1 inline scripts, report-only");
	assert.equal(results.find((result) => result.name.startsWith("chart entry"))?.detail, CHART_ENTRY);
	assert.equal(results.find((result) => result.name === "shell repeats from the edge")?.detail, "Hit from cloudfront");
	assert.equal(results.find((result) => result.name.startsWith("signed lambda post"))?.detail, "status allowed");
});

test("verification reports a stale shell, a wrong preconnect and a failed geo verdict", async () => {
	const publicDir = createPublicDir();
	const results = await verifyDeployment({
		origin: "https://testnet.gatu.ai",
		publicDir,
		network: "testnet",
		fetchImpl: fakeFetch({
			"/trade/HYPE": { body: "<html>old shell</html>", headers: { "content-security-policy": "x", link: "<https://api.hyperliquid.xyz>; rel=preconnect" } },
			"/docs": { body: "<html>docs</html>" },
			"/build-meta.json": { body: JSON.stringify({ commit: "old", release: "r0" }) },
			"/api/geo": { status: 503, body: JSON.stringify({ error: "unavailable", reason: "missing_config" }) },
			"/join/__gatu_healthcheck__": { body: "x", headers: { "cache-control": "no-store" } },
			"/charting_library/charting_library.js": { body: "js", headers: { "cache-control": "max-age=0" } },
			"*": { status: 200, body: "<html>shell</html>" },
		}),
	});
	const failed = results.filter((result) => !result.ok).map((result) => result.name);
	assert.deepEqual(failed, [
		"shell for a trade navigation",
		"build metadata parity",
		"geo endpoint answers with a real verdict",
		"signed lambda post with a payload hash",
		"referral deep link headers",
		"missing files stay 404",
		"chart entry is immutable and preloaded by the shell",
		"shell preloads the startup closure",
		"inline scripts are allowed by the edge policy",
		"health probe answers 204",
		"shell repeats from the edge",
		"chart bundles are immutable at the edge",
		"testnet stays out of search results",
	]);
});

test("the enforced stage rejects a policy that still allows unsafe-inline or misses a page's script", async () => {
	const publicDir = createPublicDir();
	async function run(header) {
		const results = await verifyDeployment({
			origin: "https://app.gatu.ai",
			publicDir,
			network: "mainnet",
			scriptHashesMode: "enforce",
			fetchImpl: fakeFetch({
				"/trade/HYPE": { body: SHELL_HTML, headers: { "content-security-policy": header } },
				"/docs": { body: "<html>docs</html>", headers: { "content-security-policy": header } },
				"*": { status: 404, body: "missing" },
			}),
		});
		return results.find((result) => result.name === "inline scripts are allowed by the edge policy");
	}
	assert.equal((await run(`default-src 'self'; script-src 'self' '${THEME_HASH}'`)).ok, true);
	assert.match((await run(`default-src 'self'; script-src 'self' 'unsafe-inline' '${THEME_HASH}'`)).detail, /still allows 'unsafe-inline'/);
	assert.match((await run("default-src 'self'; script-src 'self'")).detail, /does not allow inline script sha256-/);
	assert.match((await run("default-src 'self'")).detail, /has no content-security-policy with a script-src/);
});

test("a release fills the committed function with the build's hashes and keeps the live set as previous", () => {
	const committed = 'var SCRIPT_HASHES_CURRENT = "";\nvar SCRIPT_HASHES_PREVIOUS = "";\nfunction handler(event) { return event.response; }\n';
	const A = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
	const B = "sha256-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=";
	const first = prepareResponseFunction({ committedCode: committed, buildHashes: [A] });
	assert.deepEqual([first.current, first.previous], [[A], []]);
	assert.deepEqual(parseScriptHashes(first.code), { current: [A], previous: [] });
	const second = prepareResponseFunction({ committedCode: committed, buildHashes: [B], liveCode: first.code });
	assert.deepEqual(parseScriptHashes(second.code), { current: [B], previous: [A] });
	const third = prepareResponseFunction({ committedCode: committed, buildHashes: [B], liveCode: second.code });
	assert.deepEqual(parseScriptHashes(third.code), { current: [B], previous: [A] });
	const migrated = prepareResponseFunction({ committedCode: committed, buildHashes: [A], liveCode: "var TERMINAL_CSP = 'legacy';\nfunction handler(event) { return event.response; }\n" });
	assert.deepEqual(parseScriptHashes(migrated.code), { current: [A], previous: [] });
	assert.throws(() => prepareResponseFunction({ committedCode: committed, buildHashes: [] }), /no inline scripts/);
	assert.ok(releaseFunctionPath("/repo/apps/terminal/.output/public").endsWith(join(".output", "edge", "terminal-response.js")));
});
