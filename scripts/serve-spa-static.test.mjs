import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	acceptsHtmlNavigation,
	createStaticHandler,
	hasExactPath,
	readArgs,
	resolveStaticRequest,
	SHELL_FILE,
} from "./serve-spa-static.mjs";

test("arguments select the public directory, port, host and optional API origin", () => {
	const defaults = readArgs([], {});
	assert.equal(defaults.publicDir, "apps/terminal/.output/public");
	assert.equal(defaults.port, 3030);
	assert.equal(defaults.apiOrigin, undefined);

	const explicit = readArgs(["dist/public", "--port", "4000", "--api", "http://127.0.0.1:3000/ignored/path"], {});
	assert.equal(explicit.publicDir, "dist/public");
	assert.equal(explicit.port, 4000);
	assert.equal(explicit.apiOrigin, "http://127.0.0.1:3000");

	assert.equal(readArgs(["--api=https://api.example.test"], {}).apiOrigin, "https://api.example.test");
	assert.equal(readArgs([], { SPA_API_ORIGIN: "http://localhost:3000" }).apiOrigin, "http://localhost:3000");
});

test("navigation detection mirrors CDN rewrites: only explicit non-HTML requests are refused", () => {
	assert.equal(acceptsHtmlNavigation(undefined), true);
	assert.equal(acceptsHtmlNavigation(""), true);
	assert.equal(acceptsHtmlNavigation("*/*"), true);
	assert.equal(acceptsHtmlNavigation("text/html,application/xhtml+xml,*/*;q=0.8"), true);
	assert.equal(acceptsHtmlNavigation("application/json"), false);
});

function resolver(files, acceptsHtml = true) {
	const set = new Set(files);
	return (pathname) => resolveStaticRequest(pathname, { acceptsHtml, isFile: (file) => set.has(file) });
}

test("existing files are served before any fallback", () => {
	const resolve = resolver(["assets/app.js", "docs/index.html", SHELL_FILE]);
	assert.deepEqual(resolve("/assets/app.js"), { kind: "file", file: "assets/app.js" });
	assert.deepEqual(resolve("/docs"), { kind: "file", file: "docs/index.html" });
	assert.deepEqual(resolve("/docs/"), { kind: "file", file: "docs/index.html" });
});

test("application routes fall back to the prerendered shell", () => {
	const resolve = resolver([SHELL_FILE]);
	assert.deepEqual(resolve("/trade/BTC"), { kind: "shell", file: SHELL_FILE });
	assert.deepEqual(resolve("/trade/xyz:CXMT"), { kind: "shell", file: SHELL_FILE });
	assert.deepEqual(resolve("/"), { kind: "shell", file: SHELL_FILE });
	assert.deepEqual(resolve("/portfolio"), { kind: "shell", file: SHELL_FILE });
});

test("server-only routes never receive the shell", () => {
	const resolve = resolver([SHELL_FILE]);
	assert.equal(resolve("/_serverFn/abc").kind, "server-only");
	assert.equal(resolve("/api/leaderboard").kind, "server-only");
	assert.equal(resolve("/client-error-report").kind, "server-only");
	for (const path of ["/mobile-agent-sync-ticket", "/mobile-agent-sync-ticket/", "/mobile-agent-sync-ticket/consume"]) {
		assert.deepEqual(resolve(path), { kind: "retired" }, path);
	}
	assert.equal(resolve("/mobile-agent-sync").kind, "shell");
});

test("build metadata is a static file of the client build, not an API route", () => {
	assert.deepEqual(resolver([SHELL_FILE, "build-meta.json"], false)("/build-meta.json"), {
		kind: "file",
		file: "build-meta.json",
	});
	assert.deepEqual(resolver([SHELL_FILE], false)("/build-meta.json"), { kind: "not-found" });
});

test("build metadata is served uncached without an API origin, as the CDN serves it", async (context) => {
	const publicDir = mkdtempSync(join(tmpdir(), "gatu-spa-static-"));
	context.after(() => rmSync(publicDir, { recursive: true, force: true }));
	writeFileSync(join(publicDir, SHELL_FILE), "<html></html>");
	writeFileSync(join(publicDir, "build-meta.json"), '{"commit":"abc"}');
	const server = createServer(createStaticHandler(publicDir));
	context.after(() => new Promise((resolve) => server.close(resolve)));
	await new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", resolve);
	});
	const origin = `http://127.0.0.1:${server.address().port}`;

	const response = await fetch(`${origin}/build-meta.json`, { headers: { accept: "application/json" } });
	assert.equal(response.status, 200);
	assert.equal(response.headers.get("cache-control"), "no-store");
	assert.deepEqual(await response.json(), { commit: "abc" });

	const alias = await fetch(`${origin}/Build-Meta.json`, { headers: { accept: "application/json" } });
	assert.equal(alias.status, 404);
	await alias.text();

	for (const path of ["/mobile-agent-sync", "/Mobile-Agent-Sync/"]) {
		const pairing = await fetch(`${origin}${path}`, { headers: { accept: "text/html" } });
		assert.equal(pairing.status, 200, path);
		assert.equal(pairing.headers.get("cache-control"), "no-store", path);
		assert.equal(pairing.headers.get("referrer-policy"), "no-referrer", path);
		await pairing.text();
	}
	const trade = await fetch(`${origin}/trade/HYPE`, { headers: { accept: "text/html" } });
	assert.equal(trade.headers.get("cache-control"), "no-cache");
	assert.equal(trade.headers.get("referrer-policy"), null);
	await trade.text();
});

test("a path is a file only when every segment is spelled as the directory lists it", () => {
	const listing = { "/public": ["assets", "build-meta.json"], "/public/assets": ["App.js"] };
	const listDirectory = (directory) => listing[directory] ?? [];
	assert.equal(hasExactPath("/public", "build-meta.json", listDirectory), true);
	assert.equal(hasExactPath("/public", "assets/App.js", listDirectory), true);
	assert.equal(hasExactPath("/public", "Build-Meta.json", listDirectory), false);
	assert.equal(hasExactPath("/public", "assets/app.js", listDirectory), false);
	assert.equal(hasExactPath("/public", "Assets/App.js", listDirectory), false);
});

test("missing assets and non-navigation requests are 404, not the shell", () => {
	const html = resolver([SHELL_FILE]);
	assert.deepEqual(html("/assets/missing.js"), { kind: "not-found" });
	const fetchLike = resolver([SHELL_FILE], false);
	assert.deepEqual(fetchLike("/trade/BTC"), { kind: "not-found" });
});

test("path traversal and malformed encodings are rejected", () => {
	const resolve = resolver([SHELL_FILE, "assets/app.js"]);
	assert.deepEqual(resolve("/../package.json"), { kind: "not-found" });
	assert.deepEqual(resolve("/assets/../../package.json"), { kind: "not-found" });
	assert.deepEqual(resolve("/%zz"), { kind: "not-found" });
});
