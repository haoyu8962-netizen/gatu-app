import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	buildInvalidationCommand,
	buildLambdaCommands,
	buildReuploadCommands,
	buildSyncCommands,
	HTML_CACHE_CONTROL,
	IMMUTABLE_CACHE_CONTROL,
	NO_STORE,
	objectCacheControl,
	planUpload,
	REVALIDATE_CACHE_CONTROL,
	verifyDeployment,
} from "./deploy.mjs";

test("objects get the cache policy the edge expects", () => {
	assert.equal(objectCacheControl("assets/index-abc.js"), IMMUTABLE_CACHE_CONTROL);
	assert.equal(objectCacheControl("charting_library/bundles/runtime.4d986d07cb97d8edacba.js"), IMMUTABLE_CACHE_CONTROL);
	assert.equal(objectCacheControl("charting_library/bundles/1227.68542dac293294290d44.rtl.css"), IMMUTABLE_CACHE_CONTROL);
	assert.equal(objectCacheControl("charting_library/bundles/EuclidCircular.be8f862db48c2976009f.woff2"), IMMUTABLE_CACHE_CONTROL);
	assert.equal(objectCacheControl("charting_library/bundles/library.js"), REVALIDATE_CACHE_CONTROL);
	assert.equal(objectCacheControl("charting_library/charting_library.js"), REVALIDATE_CACHE_CONTROL);
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

function createPublicDir() {
	const dir = mkdtempSync(join(tmpdir(), "gatu-cf-verify-"));
	mkdirSync(join(dir, "docs"), { recursive: true });
	writeFileSync(join(dir, "_shell.html"), "<html>shell</html>");
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
	const headers = { "content-security-policy": "default-src 'self'", link: "<https://api.hyperliquid.xyz>; rel=preconnect" };
	const results = await verifyDeployment({
		origin: "https://app.gatu.ai/",
		publicDir,
		network: "mainnet",
		fetchImpl: fakeFetch({
			"/trade/HYPE": edgeSequence({ body: "<html>shell</html>", headers: { ...headers, "cache-control": HTML_CACHE_CONTROL } }),
			"/charting_library/bundles/runtime.4d986d07cb97d8edacba.js": edgeSequence({ body: "js", headers: { "cache-control": IMMUTABLE_CACHE_CONTROL } }),
			"/docs": { body: "<html>docs</html>", headers: { "content-security-policy": "x" } },
			"/build-meta.json": { body: JSON.stringify({ commit: "abc", release: "r1" }) },
			"/api/geo": { body: JSON.stringify({ country: "GB", proxy: false, tradeRestricted: false }) },
			"/api/referral-geo": (init) => ({
				status: init?.method === "POST" && /^[0-9a-f]{64}$/.test(init.headers?.["x-amz-content-sha256"] ?? "") ? 200 : 403,
				body: JSON.stringify({ checkedAt: 1, country: "GB", status: "allowed", ttlMs: 60_000 }),
			}),
			"/join/__gatu_healthcheck__": {
				body: "<html>shell</html>",
				headers: { "cache-control": "no-store", "referrer-policy": "no-referrer", "x-robots-tag": "noindex, nofollow", "x-gatu-route": "referral-join" },
			},
			"/charting_library/charting_library.js": { body: "js", headers: { "cache-control": REVALIDATE_CACHE_CONTROL } },
			"*": { status: 404, body: "missing" },
		}),
	});
	assert.deepEqual(
		results.filter((result) => !result.ok),
		[],
	);
	assert.equal(results.length, 10);
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
		"chart package revalidates",
		"shell repeats from the edge",
		"chart bundles are immutable at the edge",
		"testnet stays out of search results",
	]);
});
