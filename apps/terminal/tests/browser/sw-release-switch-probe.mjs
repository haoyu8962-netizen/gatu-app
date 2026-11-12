// Runs the real `public/sw.js` in real browser engines against a local server that plays several
// consecutive releases (ADR 0051), and checks what a returning visitor gets after a release:
//   1. release A boots and its startup assets land in the asset cache through the page's own loads;
//   2. release B is deployed; the next navigation is still answered by shell A, shell B is stored
//      on that same navigation (as in v10), and B's assets are stored in the background;
//   3. with every /assets/ request failing, a fresh page boots release B from the cache;
//   4. release C is deployed while one of its assets cannot be fetched; shell C is stored anyway,
//      and once the asset is back the next fresh page boots C, fetching the missing asset;
//   5. release D is deployed; the assets of the shells before C (A and B) are removed;
//   6. a font outside /assets/ is stored in the font cache (the clone fix).
// The releases are synthetic two-file builds, not the terminal: this proves the worker's cache
// behaviour in Chromium and WebKit, not the startup time of the real application or of iOS.
//
// node apps/terminal/tests/browser/sw-release-switch-probe.mjs [chromium,webkit] [worker.js]
//
// Pass another worker file as the second argument to compare (its caches must use the v11 names).
//
// It listens on a loopback port and launches browsers, which the Claude sandbox blocks; run it
// from a normal shell. Exit code 1 when a check fails.
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
import * as playwright from "@playwright/test";

const engines = (process.argv[2] ?? "chromium,webkit").split(",");
const serviceWorker = readFileSync(process.argv[3] ?? resolve(import.meta.dirname, "../../public/sw.js"), "utf8");

function release(name, files) {
	const assets = Object.keys(files);
	const preloads = assets.map((href) => `<link rel="modulepreload" href="${href}"/>`).join("");
	const entry = assets[0];
	const shell = `<!doctype html><html><head><meta charset="utf-8"/>${preloads}<style>@font-face{font-family:probe;src:url(/fonts/probe.woff2) format("woff2")}body{font-family:probe}</style><script>navigator.serviceWorker.register("/sw.js",{scope:"/",updateViaCache:"none"})</script><script type="module" src="${entry}"></script></head><body>release ${name}</body></html>`;
	return { name, shell, files };
}

function files(name) {
	return {
		[`/assets/entry-${name}.js`]: `import "/assets/vendor-${name}.js"; document.title = "${name} ready";`,
		[`/assets/vendor-${name}.js`]: "export {};",
	};
}

const releases = Object.fromEntries(["A", "B", "C", "D"].map((name) => [name, release(name, files(name))]));
const allFiles = Object.assign({}, ...Object.values(releases).map((value) => value.files));

let current = releases.A;
let assetsOffline = false;
const brokenAssets = new Set();
const assetRequests = [];

const server = createServer((request, response) => {
	const path = new URL(request.url ?? "/", "http://localhost").pathname;
	if (path === "/sw.js") {
		response.writeHead(200, { "content-type": "text/javascript", "cache-control": "no-store" });
		response.end(serviceWorker);
		return;
	}
	if (path === "/fonts/probe.woff2") {
		response.writeHead(200, { "content-type": "font/woff2", "cache-control": "no-store" });
		response.end(Buffer.alloc(64));
		return;
	}
	if (path.startsWith("/assets/")) {
		assetRequests.push(path);
		const body = allFiles[path];
		if (assetsOffline || !body || brokenAssets.has(path)) {
			response.writeHead(503, { "content-type": "text/plain", "cache-control": "no-store" });
			response.end("unavailable");
			return;
		}
		response.writeHead(200, { "content-type": "text/javascript", "cache-control": "public, max-age=31536000, immutable" });
		response.end(body);
		return;
	}
	response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" });
	response.end(current.shell);
});

await new Promise((done) => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;

async function cacheState(page) {
	return page.evaluate(async () => {
		const read = async (name) => {
			if (!(await caches.has(name))) return [];
			const cache = await caches.open(name);
			return (await cache.keys()).map((request) => new URL(request.url).pathname).sort();
		};
		const shellCache = (await caches.has("shell-v11")) ? await caches.open("shell-v11") : undefined;
		const shell = await (await shellCache?.match(new URL("shell-v11", location.origin).href))?.text();
		return {
			shell: shell?.match(/release (\w)/)?.[1],
			assets: await read("assets-v11"),
			fonts: await read("fonts-v11"),
		};
	});
}

async function waitFor(page, predicate, label, timeoutMs = 15_000) {
	const started = Date.now();
	let state;
	while (Date.now() - started < timeoutMs) {
		state = await cacheState(page);
		if (predicate(state)) return state;
		await page.waitForTimeout(100);
	}
	throw new Error(`${label}: ${JSON.stringify(state)}`);
}

function has(state, name) {
	return state.assets.includes(`/assets/entry-${name}.js`) && state.assets.includes(`/assets/vendor-${name}.js`);
}

function hasAny(state, name) {
	return state.assets.some((path) => path.endsWith(`-${name}.js`));
}

const results = [];
for (const engine of engines) {
	current = releases.A;
	assetsOffline = false;
	brokenAssets.clear();
	assetRequests.length = 0;
	const browser = await playwright[engine].launch();
	const context = await browser.newContext({ serviceWorkers: "allow" });
	const checks = [];
	function check(name, ok, detail) {
		checks.push({ name, ok, detail });
	}
	try {
		let page = await context.newPage();
		await page.goto(`${origin}/trade`);
		await page.evaluate(() => navigator.serviceWorker.ready);
		await page.goto(`${origin}/trade`);
		await page.waitForFunction(() => document.title === "A ready");
		const a = await waitFor(page, (state) => state.shell === "A" && has(state, "A") && state.fonts.length === 1, "release A cached");
		check("release A shell and assets cached", true, a);
		check("font outside /assets/ cached", a.fonts.includes("/fonts/probe.woff2"), a.fonts);

		current = releases.B;
		await page.goto(`${origin}/portfolio`);
		await page.waitForFunction(() => document.title === "A ready");
		check("navigation after the release still answers from shell A", true);
		const b = await waitFor(page, (state) => state.shell === "B" && has(state, "B"), "release B stored");
		check("shell B stored on that navigation and its assets stored in the background", true, b.assets);

		assetsOffline = true;
		let before = assetRequests.length;
		await page.close();
		page = await context.newPage();
		await page.goto(`${origin}/trade`);
		await page.waitForFunction(() => document.title === "B ready", undefined, { timeout: 10_000 });
		check("release B boots with /assets/ offline", true);
		check("no /assets/ request reached the server for that start", assetRequests.length === before, assetRequests.slice(before));
		assetsOffline = false;

		current = releases.C;
		brokenAssets.add("/assets/vendor-C.js");
		await page.goto(`${origin}/trade`);
		const c = await waitFor(page, (state) => state.shell === "C" && state.assets.includes("/assets/entry-C.js"), "release C stored");
		check("shell C stored although one of its assets could not be fetched", !c.assets.includes("/assets/vendor-C.js"), c.assets);
		brokenAssets.clear();
		before = assetRequests.length;
		await page.close();
		page = await context.newPage();
		await page.goto(`${origin}/trade`);
		await page.waitForFunction(() => document.title === "C ready", undefined, { timeout: 10_000 });
		const fetched = assetRequests.slice(before);
		check(
			"the next fresh page boots C and fetches only the missing asset",
			fetched.length === 1 && fetched[0] === "/assets/vendor-C.js",
			fetched,
		);

		current = releases.D;
		await page.goto(`${origin}/trade`);
		const d = await waitFor(
			page,
			(state) => state.shell === "D" && has(state, "D") && !hasAny(state, "A") && !hasAny(state, "B"),
			"release D refreshed",
		);
		check("release D keeps C and D and removes the assets of A and B", has(d, "C"), d.assets);
	} catch (error) {
		check("probe", false, error instanceof Error ? error.message : String(error));
	} finally {
		await browser.close();
	}
	results.push({ engine, checks });
}

server.close();
console.log(JSON.stringify(results, null, 2));
if (results.some((result) => result.checks.some((value) => !value.ok))) process.exit(1);
