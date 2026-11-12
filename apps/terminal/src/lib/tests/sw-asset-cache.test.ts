import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IMMUTABLE_CACHE_CONTROL, objectCacheControl } from "../../../../../deploy/cloudfront/deploy.mjs";
import { SURFACE_PRELOAD_META } from "../../../../../scripts/inject-shell-preloads.mjs";

const terminalRoot = resolve(__dirname, "../../..");
const serviceWorker = readFileSync(resolve(terminalRoot, "public/sw.js"), "utf8");
const origin = "https://app.sairn.ai";
const shellKey = `${origin}/shell-v11`;

type Handler = () => Response | Promise<Response>;

function abortError() {
	return new DOMException("aborted", "AbortError");
}

function asset(body: string, contentType = "text/javascript") {
	return new Response(body, { headers: { "content-type": contentType } });
}

function shell(assets: string[], extra = "") {
	const links = assets.map((href) => `<link rel="modulepreload" href="${href}"/>`).join("");
	return new Response(`<!doctype html><html><head>${links}${extra}</head><body></body></html>`, {
		headers: { "content-type": "text/html; charset=utf-8" },
	});
}

function deferred<T>() {
	let resolve: (value: T) => void = () => undefined;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

function tick() {
	return new Promise((done) => setTimeout(done, 0));
}

function createHarness() {
	const stores = new Map<string, Map<string, Response>>();
	const listeners = new Map<string, (event: Record<string, unknown>) => void>();
	const handlers = new Map<string, Handler>();
	const requested: string[] = [];
	const failingPuts = new Set<string>();
	const failingPutUrls = new Set<string>();
	const hangingPuts = new Set<string>();
	const puts = new Map<string, number>();
	const matches = new Map<string, number>();
	const aborted: string[] = [];
	const flight = { current: 0, peak: 0 };
	const fetch = vi.fn(async (input: Request | string, init?: RequestInit) => {
		const url = typeof input === "string" ? input : input.url;
		requested.push(url);
		const handler = handlers.get(url);
		if (!handler) throw new TypeError(`no network answer for ${url}`);
		const signal = init?.signal;
		flight.current += 1;
		flight.peak = Math.max(flight.peak, flight.current);
		try {
			return await new Promise<Response>((resolve, reject) => {
				signal?.addEventListener("abort", () => {
					aborted.push(url);
					reject(abortError());
				});
				Promise.resolve().then(handler).then(resolve, reject);
			});
		} finally {
			flight.current -= 1;
		}
	});
	function keyOf(request: Request | string) {
		return typeof request === "string" ? new URL(request).href : request.url;
	}
	const open = vi.fn(async (name: string) => {
		await tick();
		let store = stores.get(name);
		if (!store) {
			store = new Map();
			stores.set(name, store);
		}
		const entries = store;
		return {
			match: async (request: Request | string, options?: { ignoreVary?: boolean }) => {
				matches.set(name, (matches.get(name) ?? 0) + 1);
				const found = entries.get(keyOf(request));
				if (found?.headers.has("vary") && !options?.ignoreVary) return undefined;
				return found?.clone();
			},
			put: async (request: Request | string, response: Response) => {
				if (response.bodyUsed) throw new TypeError("body already used");
				puts.set(name, (puts.get(name) ?? 0) + 1);
				if (hangingPuts.has(name)) {
					hangingPuts.delete(name);
					await new Promise(() => {});
				}
				if (failingPuts.has(name)) throw new DOMException("quota exceeded", "QuotaExceededError");
				if (failingPutUrls.has(keyOf(request))) throw new TypeError("Vary: * cannot be stored");
				entries.set(keyOf(request), new Response(await response.arrayBuffer(), response));
			},
			keys: async () => [...entries.keys()].map((url) => new Request(url)),
			delete: async (request: Request | string) => entries.delete(keyOf(request)),
		};
	});
	const self = {
		location: { origin },
		addEventListener: (name: string, callback: (event: Record<string, unknown>) => void) => {
			listeners.set(name, callback);
		},
	};
	async function match(request: Request | string) {
		for (const entries of stores.values()) {
			const found = entries.get(keyOf(request));
			if (found) return found.clone();
		}
		return undefined;
	}
	runInNewContext(serviceWorker, {
		self,
		caches: { open, match },
		fetch,
		Request,
		Response,
		URL,
		AbortController,
		setTimeout,
		clearTimeout,
	});
	function dispatch(request: Request) {
		let response: Promise<Response> | undefined;
		const background: Promise<unknown>[] = [];
		listeners.get("fetch")?.({
			request,
			respondWith: (value: Promise<Response>) => {
				response = Promise.resolve(value);
			},
			waitUntil: (value: Promise<unknown>) => {
				background.push(value);
			},
		});
		return { response, background, settled: () => Promise.all(background) };
	}
	function navigate(path: string) {
		const request = new Request(new URL(path, origin), { redirect: "manual" });
		Object.defineProperty(request, "mode", { value: "navigate" });
		return dispatch(request);
	}
	function get(path: string, init: RequestInit & { destination?: string } = {}) {
		const { destination, ...rest } = init;
		const request = new Request(new URL(path, origin), rest);
		if (destination) Object.defineProperty(request, "destination", { value: destination });
		return dispatch(request);
	}
	function respond(path: string, handler: Handler) {
		handlers.set(new URL(path, origin).href, handler);
	}
	function requests(path: string) {
		const url = new URL(path, origin).href;
		return requested.filter((value) => value === url).length;
	}
	async function cachedText(cacheName: string, key: string) {
		return stores.get(cacheName)?.get(new URL(key, origin).href)?.clone().text();
	}
	function cachedKeys(cacheName: string) {
		return [...(stores.get(cacheName)?.keys() ?? [])].map((url) => url.replace(origin, "")).sort();
	}
	async function seed(cacheName: string, key: string, response: Response) {
		const cache = await open(cacheName);
		await cache.put(new URL(key, origin).href, response);
	}
	return {
		fetch,
		open,
		navigate,
		get,
		respond,
		requests,
		cachedText,
		cachedKeys,
		seed,
		failingPuts,
		failingPutUrls,
		hangingPuts,
		puts,
		matches,
		aborted,
		flight,
	};
}

afterEach(() => {
	vi.useRealTimers();
});

describe("service worker font cache", () => {
	it.each([
		["a font outside /assets/", "/fonts/inter.woff2", "fonts-v11"],
		["a hashed font under /assets/", "/assets/inter-Dx4kXJAl.woff2", "assets-v11"],
	])("stores %s while the page reads the response and answers the next request offline", async (_, path, cacheName) => {
		const harness = createHarness();
		harness.respond(path, () => asset("font bytes", "font/woff2"));
		const first = harness.get(path, { destination: "font" });
		expect(await (await first.response)?.text()).toBe("font bytes");
		await first.settled();
		expect(await harness.cachedText(cacheName, path)).toBe("font bytes");

		const second = harness.get(path, { destination: "font" });
		expect(await (await second.response)?.text()).toBe("font bytes");
		expect(harness.requests(path)).toBe(1);
	});
});

describe("service worker asset cache", () => {
	it("answers an immutable asset from the cache without a network request once it has been stored", async () => {
		const harness = createHarness();
		harness.respond("/assets/index-A.js", () => asset("entry"));
		const miss = harness.get("/assets/index-A.js");
		expect(await (await miss.response)?.text()).toBe("entry");
		await miss.settled();
		const hit = harness.get("/assets/index-A.js");
		expect(await (await hit.response)?.text()).toBe("entry");
		expect(harness.fetch).toHaveBeenCalledTimes(1);
	});

	it.each([
		["a 404", () => new Response("missing", { status: 404, headers: { "content-type": "text/plain" } })],
		["an HTML fallback", () => new Response("<html>", { headers: { "content-type": "text/html" } })],
	])("passes %s to the page without storing it", async (_, answer) => {
		const harness = createHarness();
		harness.respond("/assets/missing-A.js", answer);
		const miss = harness.get("/assets/missing-A.js");
		await (await miss.response)?.text();
		await miss.settled();
		expect(harness.cachedKeys("assets-v11")).toEqual([]);
	});

	it("still answers the page when the cache write fails", async () => {
		const harness = createHarness();
		harness.failingPuts.add("assets-v11");
		harness.respond("/assets/index-A.js", () => asset("entry"));
		const miss = harness.get("/assets/index-A.js");
		expect(await (await miss.response)?.text()).toBe("entry");
		await miss.settled();
		expect(harness.cachedKeys("assets-v11")).toEqual([]);
	});

	it.each([
		["a root file", "/manifest.json", {}],
		["a TradingView bundle", "/charting_library/bundles/library.f5eaeb6901219f861981.js", {}],
		["another origin", "https://cdn.example/assets/index-A.js", {}],
		["a query string", "/assets/index-A.js?v=2", {}],
		["a precompressed sibling", "/assets/index-A.js.br", {}],
		["a range request", "/assets/index-A.js", { headers: { range: "bytes=0-10" } }],
		["a POST", "/assets/index-A.js", { method: "POST", body: "x" }],
	])("does not answer %s", (_, path, init) => {
		const harness = createHarness();
		const request = harness.get(path, init as RequestInit);
		expect(request.response).toBeUndefined();
		expect(harness.fetch).not.toHaveBeenCalled();
		expect(harness.open).not.toHaveBeenCalled();
	});

	it("answers exactly the immutable assets/ scope of the deploy cache policy", async () => {
		const keys = [
			"assets/index-A.js",
			"assets/styles-B.css",
			"assets/inter-C.woff2",
			"assets/nested/chunk-D.js",
			"charting_library/bundles/library.f5eaeb6901219f861981.js",
			"charting_library/charting_library.6d17e2dafb1007c4.js",
			"charting_library/charting_library.js",
			"tradingview-theme-dark.css",
			"manifest.json",
			"sw.js",
			"_shell.html",
		];
		for (const key of keys) {
			const harness = createHarness();
			harness.respond(`/${key}`, () => asset(key, "font/woff2"));
			const request = harness.get(`/${key}`);
			const immutable = objectCacheControl(key) === IMMUTABLE_CACHE_CONTROL;
			expect(request.response !== undefined, key).toBe(immutable && key.startsWith("assets/"));
			if (request.response) await (await request.response).text();
			await request.settled();
		}
	});
});

describe("service worker shell replacement", () => {
	it("keeps the cached shell when one asset of the new shell cannot be fetched, and replaces it once all are stored", async () => {
		const harness = createHarness();
		await harness.seed("shell-v11", shellKey, shell(["/assets/index-A.js"]));
		harness.respond("/trade/BTC", () => shell(["/assets/index-B.js", "/assets/vendor-B.js"]));
		harness.respond("/assets/index-B.js", () => asset("index B"));
		harness.respond("/assets/vendor-B.js", () => new Response("busy", { status: 503 }));

		const first = harness.navigate("/trade/BTC");
		expect(await (await first.response)?.text()).toContain("/assets/index-A.js");
		await first.settled();
		expect(await harness.cachedText("shell-v11", shellKey)).toContain("/assets/index-A.js");

		harness.respond("/assets/vendor-B.js", () => asset("vendor B"));
		const second = harness.navigate("/trade/BTC");
		expect(await (await second.response)?.text()).toContain("/assets/index-A.js");
		await second.settled();
		expect(await harness.cachedText("shell-v11", shellKey)).toContain("/assets/index-B.js");
		expect(harness.requests("/assets/index-B.js")).toBe(1);
		expect(harness.requests("/assets/vendor-B.js")).toBe(2);
		expect(harness.cachedKeys("assets-v11")).toEqual(["/assets/index-B.js", "/assets/vendor-B.js"]);
	});

	it("replaces the shell only after the last asset is stored", async () => {
		const harness = createHarness();
		await harness.seed("shell-v11", shellKey, shell(["/assets/index-A.js"]));
		const vendor = deferred<Response>();
		harness.respond("/portfolio", () => shell(["/assets/index-B.js", "/assets/vendor-B.js"]));
		harness.respond("/assets/index-B.js", () => asset("index B"));
		harness.respond("/assets/vendor-B.js", () => vendor.promise);

		const navigation = harness.navigate("/portfolio");
		await navigation.response;
		for (let index = 0; index < 20; index += 1) await tick();
		expect(harness.cachedKeys("assets-v11")).toEqual(["/assets/index-B.js"]);
		expect(await harness.cachedText("shell-v11", shellKey)).toContain("/assets/index-A.js");

		vendor.resolve(asset("vendor B"));
		await navigation.settled();
		expect(await harness.cachedText("shell-v11", shellKey)).toContain("/assets/index-B.js");
	});

	it("still moves to the new shell when the asset cache refuses every write (storage full)", async () => {
		const harness = createHarness();
		await harness.seed("shell-v11", shellKey, shell(["/assets/index-A.js"]));
		harness.failingPuts.add("assets-v11");
		harness.respond("/trade/BTC", () => shell(["/assets/index-B.js", "/assets/vendor-B.js"]));
		harness.respond("/assets/index-B.js", () => asset("index B"));
		harness.respond("/assets/vendor-B.js", () => asset("vendor B"));
		const first = harness.navigate("/trade/BTC");
		expect(await (await first.response)?.text()).toContain("/assets/index-A.js");
		await first.settled();
		const second = harness.navigate("/trade/BTC");
		expect(await (await second.response)?.text()).toContain("/assets/index-B.js");
		await second.settled();
		expect(harness.cachedKeys("assets-v11")).toEqual([]);
	});

	it("still moves to the new shell when one asset can never be stored (Vary: *)", async () => {
		const harness = createHarness();
		await harness.seed("shell-v11", shellKey, shell(["/assets/index-A.js"]));
		harness.failingPutUrls.add(`${origin}/assets/vendor-B.js`);
		harness.respond("/trade/BTC", () => shell(["/assets/index-B.js", "/assets/vendor-B.js"]));
		harness.respond("/assets/index-B.js", () => asset("index B"));
		harness.respond("/assets/vendor-B.js", () => asset("vendor B"));
		const navigation = harness.navigate("/trade/BTC");
		await navigation.settled();
		expect(await harness.cachedText("shell-v11", shellKey)).toContain("/assets/index-B.js");
		expect(harness.cachedKeys("assets-v11")).toEqual(["/assets/index-B.js"]);
	});

	it.each([
		["a redirected response", () => Object.defineProperty(asset("vendor B"), "redirected", { value: true })],
		["JavaScript served as text/plain", () => asset("Service Unavailable", "text/plain")],
		[
			"a response marked no-store",
			() =>
				new Response("vendor B", {
					headers: { "content-type": "text/javascript", "cache-control": "private, no-store" },
				}),
		],
	])("keeps the cached shell and stores nothing for %s", async (_, answer) => {
		const harness = createHarness();
		await harness.seed("shell-v11", shellKey, shell(["/assets/index-A.js"]));
		harness.respond("/trade/BTC", () => shell(["/assets/vendor-B.js"]));
		harness.respond("/assets/vendor-B.js", answer);
		const navigation = harness.navigate("/trade/BTC");
		await navigation.settled();
		expect(await harness.cachedText("shell-v11", shellKey)).toContain("/assets/index-A.js");
		expect(harness.cachedKeys("assets-v11")).toEqual([]);
	});

	it.each([
		["/assets/styles-B.css", "text/plain"],
		["/assets/entry-B.mjs", "application/octet-stream"],
	])("does not store %s served as %s", async (path, contentType) => {
		const harness = createHarness();
		harness.respond(path, () => asset("body", contentType));
		const request = harness.get(path);
		await (await request.response)?.text();
		await request.settled();
		expect(harness.cachedKeys("assets-v11")).toEqual([]);
	});

	it.each([
		["/assets/entry-B.js", "application/javascript"],
		["/assets/entry-B.js", "text/javascript; charset=utf-8"],
		["/assets/styles-B.css", "text/css"],
		["/assets/inter-B.woff2", "binary/octet-stream"],
		["/assets/inter-B.woff2", "font/woff2"],
	])("stores %s served as %s", async (path, contentType) => {
		const harness = createHarness();
		harness.respond(path, () => asset("body", contentType));
		const request = harness.get(path);
		await (await request.response)?.text();
		await request.settled();
		expect(harness.cachedKeys("assets-v11")).toEqual([path]);
	});

	it("does not keep the partial assets of earlier failed candidates", async () => {
		const harness = createHarness();
		await harness.seed("shell-v11", shellKey, shell(["/assets/index-A.js"]));
		await harness.seed("assets-v11", "/assets/index-A.js", asset("index A"));
		for (const name of ["B", "C", "D"]) {
			harness.respond("/trade/BTC", () => shell([`/assets/index-${name}.js`, `/assets/vendor-${name}.js`]));
			harness.respond(`/assets/index-${name}.js`, () => asset(`index ${name}`));
			harness.respond(`/assets/vendor-${name}.js`, () => new Response("busy", { status: 503 }));
			await harness.navigate("/trade/BTC").settled();
		}
		expect(await harness.cachedText("shell-v11", shellKey)).toContain("/assets/index-A.js");
		expect(harness.cachedKeys("assets-v11")).toEqual(["/assets/index-A.js", "/assets/index-D.js"]);
	});

	it("does nothing more for a shell identical to the cached one", async () => {
		const harness = createHarness();
		await harness.seed("shell-v11", shellKey, shell(["/assets/index-A.js"]));
		harness.respond("/trade/BTC", () => shell(["/assets/index-A.js"]));
		const writes = harness.puts.get("shell-v11");
		await harness.navigate("/trade/BTC").settled();
		expect(harness.puts.get("shell-v11")).toBe(writes);
		expect(harness.matches.get("assets-v11")).toBeUndefined();
		expect(harness.requests("/assets/index-A.js")).toBe(0);
	});

	it("rewrites an identical shell whose security policy changed, without prefetching", async () => {
		const harness = createHarness();
		await harness.seed("shell-v11", shellKey, shell(["/assets/index-A.js"]));
		harness.respond("/trade/BTC", () => {
			const changed = shell(["/assets/index-A.js"]);
			changed.headers.set("content-security-policy", "script-src 'sha256-new'");
			return changed;
		});
		await harness.navigate("/trade/BTC").settled();
		const cache = await harness.open("shell-v11");
		expect((await cache.match(shellKey))?.headers.get("content-security-policy")).toBe("script-src 'sha256-new'");
		expect(harness.matches.get("assets-v11")).toBeUndefined();
	});

	it("prefetches six assets at a time", async () => {
		const harness = createHarness();
		await harness.seed("shell-v11", shellKey, shell(["/assets/index-A.js"]));
		const names = Array.from({ length: 10 }, (_, index) => `/assets/chunk-${index}.js`);
		harness.respond("/trade/BTC", () => shell(names));
		for (const name of names) {
			harness.respond(name, () => new Promise((done) => setTimeout(() => done(asset(name)), 5)));
		}
		await harness.navigate("/trade/BTC").settled();
		expect(harness.flight.peak).toBe(6);
		expect(await harness.cachedText("shell-v11", shellKey)).toContain("chunk-9.js");
	});

	it("answers from an entry stored with a Vary header", async () => {
		const harness = createHarness();
		harness.respond(
			"/assets/index-A.js",
			() => new Response("entry", { headers: { "content-type": "text/javascript", vary: "Accept-Encoding" } }),
		);
		const miss = harness.get("/assets/index-A.js");
		await (await miss.response)?.text();
		await miss.settled();
		const hit = harness.get("/assets/index-A.js");
		expect(await (await hit.response)?.text()).toBe("entry");
		expect(harness.requests("/assets/index-A.js")).toBe(1);
	});

	it("lets the commit queue move on when a shell write stalls", async () => {
		vi.useFakeTimers();
		const harness = createHarness();
		await vi.advanceTimersByTimeAsync(1);
		const seeding = harness.seed("shell-v11", shellKey, shell(["/assets/index-A.js"]));
		await vi.advanceTimersByTimeAsync(1);
		await seeding;
		harness.hangingPuts.add("shell-v11");
		harness.respond("/trade/BTC", () => shell([]));
		const stalled = harness.navigate("/trade/BTC");
		await vi.advanceTimersByTimeAsync(10_100);
		await stalled.settled();
		harness.respond("/trade/BTC", () => shell([], '<meta name="release" content="C"/>'));
		const next = harness.navigate("/trade/BTC");
		await vi.advanceTimersByTimeAsync(100);
		await next.settled();
		vi.useRealTimers();
		expect(await harness.cachedText("shell-v11", shellKey)).toContain('content="C"');
	});

	it("gives up after the time limit and keeps the cached shell", async () => {
		vi.useFakeTimers();
		const harness = createHarness();
		await vi.runOnlyPendingTimersAsync();
		harness.respond("/trade/BTC", () => shell(["/assets/index-B.js"]));
		harness.respond("/assets/index-B.js", () => new Promise<Response>(() => {}));
		const seeding = harness.seed("shell-v11", shellKey, shell(["/assets/index-A.js"]));
		await vi.advanceTimersByTimeAsync(1);
		await seeding;
		const navigation = harness.navigate("/trade/BTC");
		await vi.advanceTimersByTimeAsync(1);
		expect(await (await navigation.response)?.text()).toContain("/assets/index-A.js");
		let settled = false;
		void navigation.settled().then(() => {
			settled = true;
		});
		await vi.advanceTimersByTimeAsync(59_000);
		expect(settled).toBe(false);
		await vi.advanceTimersByTimeAsync(1_100);
		expect(settled).toBe(true);
		expect(harness.aborted).toEqual([`${origin}/assets/index-B.js`]);
		expect(await harness.cachedText("shell-v11", shellKey)).toContain("/assets/index-A.js");

		harness.respond("/assets/index-B.js", () => asset("index B"));
		const retry = harness.navigate("/trade/BTC");
		await vi.advanceTimersByTimeAsync(100);
		await retry.settled();
		vi.useRealTimers();
		expect(harness.requests("/assets/index-B.js")).toBe(2);
		expect(await harness.cachedText("shell-v11", shellKey)).toContain("/assets/index-B.js");
	});

	it("does not abort a download the page shares when the job times out", async () => {
		vi.useFakeTimers();
		const harness = createHarness();
		await vi.advanceTimersByTimeAsync(1);
		const seeding = harness.seed("shell-v11", shellKey, shell(["/assets/index-A.js"]));
		await vi.advanceTimersByTimeAsync(1);
		await seeding;
		const entry = deferred<Response>();
		harness.respond("/trade/BTC", () => shell(["/assets/index-B.js"]));
		harness.respond("/assets/index-B.js", () => entry.promise);
		const navigation = harness.navigate("/trade/BTC");
		await vi.advanceTimersByTimeAsync(10);
		const page = harness.get("/assets/index-B.js");
		await vi.advanceTimersByTimeAsync(61_000);
		await navigation.settled();
		expect(harness.aborted).toEqual([]);
		entry.resolve(asset("index B"));
		const text = page.response?.then((response) => response.text());
		await vi.advanceTimersByTimeAsync(10);
		expect(await text).toBe("index B");
		await vi.advanceTimersByTimeAsync(10);
		await page.settled();
		vi.useRealTimers();
		expect(harness.requests("/assets/index-B.js")).toBe(1);
	});

	it("serves the network shell on a miss and caches it with its assets", async () => {
		const harness = createHarness();
		harness.respond("/trade/ETH", () => shell(["/assets/index-B.js"]));
		harness.respond("/assets/index-B.js", () => asset("index B"));
		const navigation = harness.navigate("/trade/ETH");
		expect(await (await navigation.response)?.text()).toContain("/assets/index-B.js");
		await navigation.settled();
		expect(await harness.cachedText("shell-v11", shellKey)).toContain("/assets/index-B.js");
		expect(harness.cachedKeys("assets-v11")).toEqual(["/assets/index-B.js"]);
	});

	it("shares one network request per asset between the page and the shell prefetch", async () => {
		const harness = createHarness();
		const entry = deferred<Response>();
		harness.respond("/trade/ETH", () => shell(["/assets/index-B.js"]));
		harness.respond("/assets/index-B.js", () => entry.promise);
		const navigation = harness.navigate("/trade/ETH");
		await navigation.response;
		for (let index = 0; index < 20; index += 1) await tick();
		const page = harness.get("/assets/index-B.js");
		for (let index = 0; index < 20; index += 1) await tick();
		entry.resolve(asset("index B"));
		expect(await (await page.response)?.text()).toBe("index B");
		await Promise.all([navigation.settled(), page.settled()]);
		expect(harness.requests("/assets/index-B.js")).toBe(1);
		expect(await harness.cachedText("shell-v11", shellKey)).toContain("/assets/index-B.js");
	});

	it("prefetches each asset once when several navigations fetch the same new shell", async () => {
		const harness = createHarness();
		await harness.seed("shell-v11", shellKey, shell(["/assets/index-A.js"]));
		harness.respond("/trade/BTC", () => shell(["/assets/index-B.js"]));
		harness.respond("/assets/index-B.js", () => asset("index B"));
		const shellWrites = harness.puts.get("shell-v11");
		const navigations = [harness.navigate("/trade/BTC"), harness.navigate("/trade/BTC"), harness.navigate("/docs")];
		await Promise.all(navigations.map((navigation) => navigation.settled()));
		expect(harness.requests("/assets/index-B.js")).toBe(1);
		expect(harness.puts.get("shell-v11")).toBe((shellWrites ?? 0) + 1);
		expect(await harness.cachedText("shell-v11", shellKey)).toContain("/assets/index-B.js");
	});

	it("never lets an older shell replace a newer one that was committed first", async () => {
		const harness = createHarness();
		await harness.seed("shell-v11", shellKey, shell(["/assets/index-A.js"]));
		const slow = deferred<Response>();
		harness.respond("/trade/BTC", () => shell(["/assets/index-B.js"]));
		harness.respond("/assets/index-B.js", () => slow.promise);
		const older = harness.navigate("/trade/BTC");
		await older.response;
		for (let index = 0; index < 20; index += 1) await tick();
		harness.respond("/trade/BTC", () => shell(["/assets/index-C.js"]));
		harness.respond("/assets/index-C.js", () => asset("index C"));
		const newer = harness.navigate("/trade/BTC");
		await newer.settled();
		expect(await harness.cachedText("shell-v11", shellKey)).toContain("/assets/index-C.js");
		slow.resolve(asset("index B"));
		await older.settled();
		expect(await harness.cachedText("shell-v11", shellKey)).toContain("/assets/index-C.js");
	});

	it("does not drop the stored assets of another candidate still being prefetched", async () => {
		const harness = createHarness();
		await harness.seed("shell-v11", shellKey, shell(["/assets/index-A.js"]));
		const vendor = deferred<Response>();
		harness.respond("/trade/BTC", () => shell(["/assets/index-B.js", "/assets/vendor-B.js"]));
		harness.respond("/assets/index-B.js", () => asset("index B"));
		harness.respond("/assets/vendor-B.js", () => vendor.promise);
		const older = harness.navigate("/trade/BTC");
		await older.response;
		for (let index = 0; index < 50 && !harness.cachedKeys("assets-v11").includes("/assets/index-B.js"); index += 1) {
			await tick();
		}
		expect(harness.cachedKeys("assets-v11")).toContain("/assets/index-B.js");
		harness.respond("/trade/BTC", () => shell(["/assets/index-C.js"]));
		harness.respond("/assets/index-C.js", () => asset("index C"));
		await harness.navigate("/trade/BTC").settled();
		expect(await harness.cachedText("shell-v11", shellKey)).toContain("/assets/index-C.js");
		expect(harness.cachedKeys("assets-v11")).toContain("/assets/index-B.js");
		vendor.resolve(asset("vendor B"));
		await older.settled();
		expect(await harness.cachedText("shell-v11", shellKey)).toContain("/assets/index-C.js");
	});

	it("fetches an asset again after a failed download of it", async () => {
		const harness = createHarness();
		harness.respond("/assets/index-A.js", () => new Response("busy", { status: 503 }));
		const failed = harness.get("/assets/index-A.js");
		await (await failed.response)?.text();
		await failed.settled();
		harness.respond("/assets/index-A.js", () => asset("entry"));
		const retry = harness.get("/assets/index-A.js");
		expect(await (await retry.response)?.text()).toBe("entry");
		expect(harness.requests("/assets/index-A.js")).toBe(2);
	});

	it("keeps the assets of the new and the previous shell after a release switch and drops the rest", async () => {
		const harness = createHarness();
		await harness.seed("shell-v11", shellKey, shell(["/assets/index-A.js"]));
		await harness.seed("assets-v11", "/assets/index-A.js", asset("index A"));
		await harness.seed("assets-v11", "/assets/lazy-A.js", asset("lazy A"));
		await harness.seed("assets-v11", "/assets/index-Z.js", asset("two releases ago"));
		harness.respond("/trade/BTC", () => shell(["/assets/index-B.js"]));
		harness.respond("/assets/index-B.js", () => asset("index B"));
		const navigation = harness.navigate("/trade/BTC");
		await navigation.settled();
		expect(harness.cachedKeys("assets-v11")).toEqual(["/assets/index-A.js", "/assets/index-B.js"]);
	});

	it("keeps lazily loaded chunks while the shell is unchanged", async () => {
		const harness = createHarness();
		await harness.seed("shell-v11", shellKey, shell(["/assets/index-A.js"]));
		await harness.seed("assets-v11", "/assets/index-A.js", asset("index A"));
		await harness.seed("assets-v11", "/assets/lazy-A.js", asset("lazy A"));
		harness.respond("/trade/BTC", () => shell(["/assets/index-A.js"]));
		const navigation = harness.navigate("/trade/BTC");
		await navigation.settled();
		expect(harness.requests("/assets/index-A.js")).toBe(0);
		expect(harness.cachedKeys("assets-v11")).toEqual(["/assets/index-A.js", "/assets/lazy-A.js"]);
	});

	it("answers a language link from the network at once and caches that shell once its assets are stored", async () => {
		const harness = createHarness();
		await harness.seed("shell-v11", shellKey, shell(["/assets/index-A.js"]));
		const entry = deferred<Response>();
		harness.respond("/trade/BTC?lang=ja", () => shell(["/assets/index-B.js"]));
		harness.respond("/assets/index-B.js", () => entry.promise);
		const navigation = harness.navigate("/trade/BTC?lang=ja");
		expect(await (await navigation.response)?.text()).toContain("/assets/index-B.js");
		expect(await harness.cachedText("shell-v11", shellKey)).toContain("/assets/index-A.js");
		entry.resolve(asset("index B"));
		await navigation.settled();
		expect(await harness.cachedText("shell-v11", shellKey)).toContain("/assets/index-B.js");
	});
});

describe("service worker shell asset list", () => {
	const realShell = [
		'<link rel="modulepreload" href="/assets/index-BykY0ZKy.js"/>',
		'<link rel="modulepreload" href="/assets/vendor-tanstack-router-Dxjx6Gvf.js"/>',
		'<link rel="stylesheet" href="/assets/styles-BG9gMMIW.css" data-precedence="default"/>',
		'<link rel="preload" href="/assets/inter-latin-wght-normal-Dx4kXJAl.woff2" as="font" type="font/woff2" crossorigin="anonymous"/>',
		'<link rel="preload" href="/assets/app-toaster-BGuRiK0z.css" as="style"/>',
		'<link rel="preload" href="/charting_library/charting_library.6d17e2dafb1007c4.js" as="script" media="(min-width: 1001px)"/>',
		'<link rel="icon" href="/favicon.svg"/>',
		'<link rel="manifest" href="/manifest.json"/>',
		'<link rel="dns-prefetch" href="https://app.hyperliquid.xyz"/>',
		`<meta name="${SURFACE_PRELOAD_META.desktop}" content="/assets/orders-history-tab-nC3GIRxZ.js /assets/history-tab-CkfmXa_T.js"/>`,
		`<meta name="${SURFACE_PRELOAD_META.mobile}" content=""/>`,
		`<meta name="${SURFACE_PRELOAD_META.chart}" content="/charting_library/bundles/runtime.4d986d07cb97d8edacba.js /tradingview-theme-dark.css"/>`,
		'<script>window.x = \'<link rel="modulepreload" href="/assets/inline-only.js">\';</script>',
		'<script type="module" async="" src="/assets/index-BykY0ZKy.js"></script>',
	].join("");

	it("prefetches the preloads, stylesheets, scripts and surface lists of the shell, and nothing else", async () => {
		const harness = createHarness();
		await harness.seed("shell-v11", shellKey, shell([]));
		harness.respond(
			"/trade/BTC",
			() => new Response(`<html><head>${realShell}</head></html>`, { headers: { "content-type": "text/html" } }),
		);
		const expected = [
			"/assets/app-toaster-BGuRiK0z.css",
			"/assets/history-tab-CkfmXa_T.js",
			"/assets/index-BykY0ZKy.js",
			"/assets/inter-latin-wght-normal-Dx4kXJAl.woff2",
			"/assets/orders-history-tab-nC3GIRxZ.js",
			"/assets/styles-BG9gMMIW.css",
			"/assets/vendor-tanstack-router-Dxjx6Gvf.js",
		];
		const types: Record<string, string> = { css: "text/css", js: "text/javascript", woff2: "font/woff2" };
		for (const path of expected) harness.respond(path, () => asset(path, types[path.split(".").pop() ?? ""]));
		const navigation = harness.navigate("/trade/BTC");
		await navigation.settled();
		expect(harness.cachedKeys("assets-v11")).toEqual(expected);
		expect(harness.fetch.mock.calls.map(([input]) => (typeof input === "string" ? input : input.url)).sort()).toEqual(
			[`${origin}/trade/BTC`, ...expected.map((path) => `${origin}${path}`)].sort(),
		);
		expect(await harness.cachedText("shell-v11", shellKey)).toContain("index-BykY0ZKy.js");
	});

	it("ignores references inside HTML comments and reads attributes that contain a >", async () => {
		const harness = createHarness();
		await harness.seed("shell-v11", shellKey, shell([]));
		harness.respond(
			"/trade/BTC",
			() =>
				new Response(
					'<html><head><!-- <script src="/assets/absent.js"></script> --><link rel="modulepreload" title="a>b" href="/assets/real.js"></head></html>',
					{ headers: { "content-type": "text/html" } },
				),
		);
		harness.respond("/assets/real.js", () => asset("real"));
		await harness.navigate("/trade/BTC").settled();
		expect(harness.requests("/assets/absent.js")).toBe(0);
		expect(harness.cachedKeys("assets-v11")).toEqual(["/assets/real.js"]);
		expect(await harness.cachedText("shell-v11", shellKey)).toContain("/assets/real.js");
	});

	it("reads the same surface preload names that the build writes", () => {
		for (const name of [SURFACE_PRELOAD_META.desktop, SURFACE_PRELOAD_META.mobile]) {
			expect(serviceWorker).toContain(`"${name}"`);
		}
		expect(serviceWorker).not.toContain(`"${SURFACE_PRELOAD_META.chart}"`);
	});
});
