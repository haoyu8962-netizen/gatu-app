import assert from "node:assert/strict";
import test from "node:test";
import { acceptsHtmlNavigation, readArgs, resolveStaticRequest, SHELL_FILE } from "./serve-spa-static.mjs";

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
	assert.equal(resolve("/build-meta.json").kind, "server-only");
	assert.equal(resolve("/client-error-report").kind, "server-only");
	assert.equal(resolve("/mobile-agent-sync-ticket").kind, "server-only");
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
