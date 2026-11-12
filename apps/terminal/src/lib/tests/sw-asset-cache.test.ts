import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IMMUTABLE_CACHE_CONTROL, objectCacheControl } from "../../../../../deploy/cloudfront/deploy.mjs";
import {
	renderShellPreloadLinks,
	renderSurfacePreloadMeta,
	SURFACE_PRELOAD_META,
} from "../../../../../scripts/inject-shell-preloads.mjs";

const terminalRoot = resolve(__dirname, "../../..");
const serviceWorker = readFileSync(resolve(terminalRoot, "public/sw.js"), "utf8");
const origin = "https://app.sairn.ai";
const shellKey = `${origin}/shell-v11`;
const manifestKey = `${origin}/shell-assets-v11`;
const IMMUTABLE = "public, max-age=31536000, immutable";
const CONTENT_TYPES: Record<string, string> = { css: "text/css", js: "text/javascript", woff2: "font/woff2" };

type Handler = () => Response | Promise<Response>;

function abortError() {
	return new DOMException("aborted", "AbortError");
}

function asset(body: string, contentType = "text/javascript", cacheControl = IMMUTABLE) {
	return new Response(body, { headers: { "content-type": contentType, "cache-control": cacheControl } });
}

function typedAsset(path: string) {
	return asset(path, CONTENT_TYPES[path.split(".").pop() ?? ""]);
}

function html(markup: string) {
	return new Response(markup, { headers: { "content-type": "text/html; charset=utf-8" } });
}

function shell(assets: string[], extra = "") {
	const links = assets.map((href) => `<link rel="modulepreload" href="${href}"/>`).join("");
	return html(`<!doctype html><html><head>${links}${extra}</head><body></body></html>`);
}

function busy() {
	return new Response("busy", { status: 503 });
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

async function ticks(count: number) {
	for (let index = 0; index < count; index += 1) await tick();
}

interface HarnessOptions {
	quotaBytes?: number;
}

function createHarness({ quotaBytes }: HarnessOptions = {}) {
	const stores = new Map<string, Map<string, { response: Response; bytes: number }>>();
	const listeners = new Map<string, (event: Record<string, unknown>) => void>();
	const handlers = new Map<string, Handler>();
	const requested: string[] = [];
	const failingPuts = new Set<string>();
	const hangingMatches = new Set<string>();
	const keysGates = new Map<string, Promise<unknown>>();
	const keysCalls = new Map<string, number>();
	const deleted: string[] = [];
	const aborted: string[] = [];
	const flight = { current: 0, peak: 0 };
	const fetch = vi.fn(async (input: Request | string, init?: RequestInit) => {
		const url = typeof input === "string" ? input : input.url;
		requested.push(url);
		const signal = init?.signal;
		if (signal?.aborted) throw abortError();
		const handler = handlers.get(url);
		if (!handler) throw new TypeError(`no network answer for ${url}`);
		const counted = url.startsWith(`${origin}/assets/`) ? 1 : 0;
		flight.current += counted;
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
			flight.current -= counted;
		}
	});
	function keyOf(request: Request | string) {
		return typeof request === "string" ? new URL(request).href : request.url;
	}
	function usedBytes() {
		let total = 0;
		for (const entries of stores.values()) for (const entry of entries.values()) total += entry.bytes;
		return total;
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
				if (hangingMatches.has(name)) await new Promise(() => {});
				const found = entries.get(keyOf(request))?.response;
				if (found?.headers.has("vary") && !options?.ignoreVary) return undefined;
				return found?.clone();
			},
			put: async (request: Request | string, response: Response) => {
				if (response.bodyUsed) throw new TypeError("body already used");
				const body = await response.arrayBuffer();
				if (failingPuts.has(name)) throw new DOMException("quota exceeded", "QuotaExceededError");
				const key = keyOf(request);
				const replaced = entries.get(key)?.bytes ?? 0;
				if (quotaBytes !== undefined && usedBytes() - replaced + body.byteLength > quotaBytes) {
					throw new DOMException("quota exceeded", "QuotaExceededError");
				}
				entries.set(key, { response: new Response(body, response), bytes: body.byteLength });
			},
			keys: async () => {
				keysCalls.set(name, (keysCalls.get(name) ?? 0) + 1);
				const snapshot = [...entries.keys()];
				await keysGates.get(name);
				return snapshot.map((url) => new Request(url));
			},
			delete: async (request: Request | string) => {
				deleted.push(keyOf(request));
				return entries.delete(keyOf(request));
			},
		};
	});
	const deleteCache = vi.fn(async (name: string) => stores.delete(name));
	const self = {
		location: { origin },
		addEventListener: (name: string, callback: (event: Record<string, unknown>) => void) => {
			listeners.set(name, callback);
		},
	};
	async function match(request: Request | string) {
		for (const entries of stores.values()) {
			const found = entries.get(keyOf(request));
			if (found) return found.response.clone();
		}
		return undefined;
	}
	runInNewContext(serviceWorker, {
		self,
		caches: { open, match, delete: deleteCache },
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
		return { request, response, background, settled: () => Promise.all(background) };
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
	async function load(path: string) {
		const request = get(path);
		const text = await (await request.response)?.text();
		await request.settled();
		return text;
	}
	function respond(path: string, handler: Handler) {
		handlers.set(new URL(path, origin).href, handler);
	}
	function requests(path: string) {
		const url = new URL(path, origin).href;
		return requested.filter((value) => value === url).length;
	}
	function requestedAssets() {
		return [
			...new Set(requested.map((url) => url.replace(origin, "")).filter((path) => path.startsWith("/assets/"))),
		].sort();
	}
	async function cachedText(cacheName: string, key: string) {
		return stores.get(cacheName)?.get(new URL(key, origin).href)?.response.clone().text();
	}
	function cachedKeys(cacheName: string) {
		return [...(stores.get(cacheName)?.keys() ?? [])].map((url) => url.replace(origin, "")).sort();
	}
	async function manifest() {
		const text = await cachedText("shell-v11", manifestKey);
		return text === undefined ? undefined : (JSON.parse(text) as string[]).map((url) => url.replace(origin, ""));
	}
	async function seed(cacheName: string, key: string, response: Response) {
		const cache = await open(cacheName);
		await cache.put(new URL(key, origin).href, response);
	}
	function opened(name: string) {
		return open.mock.calls.filter(([value]) => value === name).length;
	}
	return {
		fetch,
		open,
		opened,
		deleteCache,
		navigate,
		get,
		load,
		respond,
		requests,
		requestedAssets,
		cachedText,
		cachedKeys,
		manifest,
		seed,
		failingPuts,
		hangingMatches,
		keysGates,
		keysCalls,
		deleted,
		aborted,
		flight,
	};
}

type Harness = ReturnType<typeof createHarness>;

async function seedRelease(harness: Harness, assets: string[], extra = "") {
	await harness.seed("shell-v11", shellKey, shell(assets, extra));
	await harness.seed(
		"shell-v11",
		manifestKey,
		new Response(JSON.stringify(assets.map((path) => `${origin}${path}`).sort())),
	);
	for (const path of assets) await harness.seed("assets-v11", path, typedAsset(path));
}

async function seedWithFakeTimers(harness: Harness, assets: string[]) {
	const seeding = seedRelease(harness, assets);
	for (let index = 0; index < assets.length + 4; index += 1) await vi.advanceTimersByTimeAsync(1);
	await seeding;
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
		expect(await harness.load("/assets/index-A.js")).toBe("entry");
		expect(await harness.load("/assets/index-A.js")).toBe("entry");
		expect(harness.fetch).toHaveBeenCalledTimes(1);
	});

	it("passes the page's own request to the network", async () => {
		const harness = createHarness();
		harness.respond("/assets/index-A.js", () => asset("entry"));
		const miss = harness.get("/assets/index-A.js");
		await (await miss.response)?.text();
		await miss.settled();
		expect(harness.fetch.mock.calls[0]?.[0]).toBe(miss.request);
	});

	it.each([
		[
			"a 404",
			() =>
				new Response("missing", { status: 404, headers: { "content-type": "text/plain", "cache-control": IMMUTABLE } }),
		],
		[
			"a 201",
			() =>
				new Response("entry", {
					status: 201,
					headers: { "content-type": "text/javascript", "cache-control": IMMUTABLE },
				}),
		],
		["an HTML fallback", () => asset("<html>", "text/html")],
		["a redirected response", () => Object.defineProperty(asset("entry"), "redirected", { value: true })],
		["JavaScript served as text/plain", () => asset("Service Unavailable", "text/plain")],
		["a response marked no-store", () => asset("entry", "text/javascript", "public, immutable, no-store")],
		["a response marked no-cache", () => asset("Service Unavailable", "text/javascript", "no-cache")],
		[
			"a response without Cache-Control",
			() => new Response("entry", { headers: { "content-type": "text/javascript" } }),
		],
		["a response that is only long-lived", () => asset("entry", "text/javascript", "public, max-age=31536000")],
	])("passes %s to the page without storing it", async (_, answer) => {
		const harness = createHarness();
		harness.respond("/assets/index-A.js", answer);
		await harness.load("/assets/index-A.js");
		expect(harness.cachedKeys("assets-v11")).toEqual([]);
	});

	it.each([
		["/assets/styles-B.css", "text/plain"],
		["/assets/entry-B.mjs", "application/octet-stream"],
	])("does not store %s served as %s", async (path, contentType) => {
		const harness = createHarness();
		harness.respond(path, () => asset("body", contentType));
		await harness.load(path);
		expect(harness.cachedKeys("assets-v11")).toEqual([]);
	});

	it.each([
		...[
			"application/ecmascript",
			"application/javascript",
			"application/x-ecmascript",
			"application/x-javascript",
			"text/ecmascript",
			"text/javascript",
			"text/javascript1.0",
			"text/javascript1.1",
			"text/javascript1.2",
			"text/javascript1.3",
			"text/javascript1.4",
			"text/javascript1.5",
			"text/jscript",
			"text/livescript",
			"text/x-ecmascript",
			"text/x-javascript",
			"Text/JavaScript; charset=utf-8",
		].map((type) => ["/assets/entry-B.js", type]),
		["/assets/entry-B.mjs", "text/javascript"],
		["/assets/styles-B.css", "text/css"],
		["/assets/inter-B.woff2", "binary/octet-stream"],
		["/assets/inter-B.woff2", "font/woff2"],
	])("stores %s served as %s", async (path, contentType) => {
		const harness = createHarness();
		harness.respond(path, () => asset("body", contentType));
		expect(await harness.load(path)).toBe("body");
		expect(harness.cachedKeys("assets-v11")).toEqual([path]);
	});

	it.each(["reload", "no-cache", "no-store"] as const)(
		"goes to the network for a request with cache mode %s and replaces the entry",
		async (mode) => {
			const harness = createHarness();
			await harness.seed("assets-v11", "/assets/index-A.js", asset("stale body"));
			harness.respond("/assets/index-A.js", () => asset("fresh body"));
			const request = harness.get("/assets/index-A.js", { cache: mode });
			expect(await (await request.response)?.text()).toBe("fresh body");
			await request.settled();
			expect(await harness.cachedText("assets-v11", "/assets/index-A.js")).toBe("fresh body");
		},
	);

	it("still answers the page when the cache write fails", async () => {
		const harness = createHarness();
		harness.failingPuts.add("assets-v11");
		harness.respond("/assets/index-A.js", () => asset("entry"));
		expect(await harness.load("/assets/index-A.js")).toBe("entry");
		expect(harness.cachedKeys("assets-v11")).toEqual([]);
	});

	it("answers from an entry stored with a Vary header", async () => {
		const harness = createHarness();
		harness.respond(
			"/assets/index-A.js",
			() =>
				new Response("entry", {
					headers: { "content-type": "text/javascript", "cache-control": IMMUTABLE, vary: "Accept-Encoding" },
				}),
		);
		await harness.load("/assets/index-A.js");
		expect(await harness.load("/assets/index-A.js")).toBe("entry");
		expect(harness.requests("/assets/index-A.js")).toBe(1);
	});

	it("fetches an asset again after a failed download of it", async () => {
		const harness = createHarness();
		harness.respond("/assets/index-A.js", busy);
		await harness.load("/assets/index-A.js");
		harness.respond("/assets/index-A.js", () => asset("entry"));
		expect(await harness.load("/assets/index-A.js")).toBe("entry");
		expect(harness.requests("/assets/index-A.js")).toBe(2);
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

describe("service worker shell writes keep the v10 path", () => {
	it.each([
		["one of its assets cannot be fetched", (harness: Harness) => harness.respond("/assets/vendor-B.js", busy)],
		["the asset cache refuses every write", (harness: Harness) => harness.failingPuts.add("assets-v11")],
	])("stores the new shell on the navigation that fetched it when %s", async (_, breakIt) => {
		const harness = createHarness();
		await seedRelease(harness, ["/assets/index-A.js"]);
		harness.respond("/trade/BTC", () => shell(["/assets/index-B.js", "/assets/vendor-B.js"]));
		harness.respond("/assets/index-B.js", () => asset("index B"));
		harness.respond("/assets/vendor-B.js", () => asset("vendor B"));
		breakIt(harness);
		await harness.navigate("/trade/BTC").settled();
		expect(await harness.cachedText("shell-v11", shellKey)).toContain("/assets/index-B.js");
		expect(await (await harness.navigate("/portfolio").response)?.text()).toContain("/assets/index-B.js");
	});

	it.each(["/trade/BTC", "/trade/BTC?lang=ja"])(
		"writes the shell fetched for %s without waiting for any read of the shell cache",
		async (path) => {
			vi.useFakeTimers();
			const harness = createHarness();
			await seedWithFakeTimers(harness, ["/assets/index-A.js"]);
			harness.hangingMatches.add("shell-v11");
			harness.respond(path, () => shell(["/assets/index-B.js"]));
			harness.navigate(path);
			await vi.advanceTimersByTimeAsync(10);
			expect(await harness.cachedText("shell-v11", shellKey)).toContain("/assets/index-B.js");
			await vi.advanceTimersByTimeAsync(61_000);
		},
	);

	it("stores the new shell before the asset sync, even when the sync never finishes", async () => {
		vi.useFakeTimers();
		const harness = createHarness();
		await seedWithFakeTimers(harness, ["/assets/index-A.js"]);
		harness.respond("/trade/BTC", () => shell(["/assets/index-B.js"]));
		harness.respond("/assets/index-B.js", () => new Promise<Response>(() => {}));
		harness.navigate("/trade/BTC");
		await vi.advanceTimersByTimeAsync(50);
		expect(harness.requests("/assets/index-B.js")).toBe(1);
		expect(await harness.cachedText("shell-v11", shellKey)).toContain("/assets/index-B.js");
		await vi.advanceTimersByTimeAsync(61_000);
	});

	it("empties the asset cache and stores the shell when the origin's quota is full", async () => {
		const harness = createHarness({ quotaBytes: 1_000 });
		await seedRelease(harness, ["/assets/index-A.js"]);
		await harness.seed("assets-v11", "/assets/lazy-A.js", asset("x".repeat(700)));
		const bigger = `<!doctype html><html><head><link rel="modulepreload" href="/assets/index-B.js"/><meta name="filler" content="${"y".repeat(300)}"/></head></html>`;
		harness.respond("/trade/BTC", () => html(bigger));
		harness.respond("/assets/index-B.js", () => asset("index B"));
		await harness.navigate("/trade/BTC").settled();
		expect(await harness.cachedText("shell-v11", shellKey)).toBe(bigger);
		expect(harness.deleteCache).toHaveBeenCalledWith("assets-v11");
		expect(await harness.manifest()).toEqual(["/assets/index-B.js"]);
		expect(await (await harness.navigate("/portfolio").response)?.text()).toBe(bigger);
	});

	it("stores the shell on the retry with its full body after a failed write", async () => {
		const harness = createHarness();
		await seedRelease(harness, ["/assets/index-A.js"]);
		let failures = 1;
		const open = harness.open.getMockImplementation();
		if (!open) throw new Error("the harness has no open implementation");
		harness.open.mockImplementation(async (name: string) => {
			const cache = await open(name);
			if (name !== "shell-v11") return cache;
			return {
				...cache,
				put: async (request: Request | string, response: Response) => {
					if (failures > 0 && (typeof request === "string" ? request : request.url) === shellKey) {
						failures -= 1;
						await response.arrayBuffer();
						throw new DOMException("quota exceeded", "QuotaExceededError");
					}
					return cache.put(request, response);
				},
			};
		});
		harness.respond("/trade/BTC", () => shell(["/assets/index-B.js"], "<title>B</title>"));
		harness.respond("/assets/index-B.js", () => asset("index B"));
		await harness.navigate("/trade/BTC").settled();
		expect(await harness.cachedText("shell-v11", shellKey)).toContain("<title>B</title>");
	});
});

describe("service worker asset sync", () => {
	it("leaves every asset of the latest shell in the cache after a complete sync, and no later sync removes them", async () => {
		const harness = createHarness();
		await seedRelease(harness, ["/assets/index-A.js"]);
		harness.respond("/trade/BTC", () => shell(["/assets/index-B.js", "/assets/vendor-B.js"]));
		harness.respond("/assets/index-B.js", () => asset("index B"));
		harness.respond("/assets/vendor-B.js", () => asset("vendor B"));
		await harness.navigate("/trade/BTC").settled();
		expect(harness.cachedKeys("assets-v11")).toEqual([
			"/assets/index-A.js",
			"/assets/index-B.js",
			"/assets/vendor-B.js",
		]);
		expect(await harness.manifest()).toEqual(["/assets/index-B.js", "/assets/vendor-B.js"]);

		harness.respond("/trade/BTC", () => shell(["/assets/index-C.js"]));
		harness.respond("/assets/index-C.js", busy);
		await harness.navigate("/trade/BTC").settled();
		expect(harness.cachedKeys("assets-v11")).toEqual(["/assets/index-B.js", "/assets/vendor-B.js"]);
		expect(await harness.manifest()).toEqual(["/assets/index-B.js", "/assets/vendor-B.js"]);
	});

	it("keeps only the assets of the new and the previous shell, then what the page loads later", async () => {
		const harness = createHarness();
		await seedRelease(harness, ["/assets/index-A.js"]);
		await harness.seed("assets-v11", "/assets/lazy-A.js", asset("lazy A"));
		await harness.seed("assets-v11", "/assets/index-Z.js", asset("two releases ago"));
		harness.respond("/trade/BTC", () => shell(["/assets/index-B.js"]));
		harness.respond("/assets/index-B.js", () => asset("index B"));
		await harness.navigate("/trade/BTC").settled();
		expect(harness.cachedKeys("assets-v11")).toEqual(["/assets/index-A.js", "/assets/index-B.js"]);

		harness.respond("/assets/lazy-B.js", () => asset("lazy B"));
		await harness.load("/assets/lazy-B.js");
		expect(harness.cachedKeys("assets-v11")).toContain("/assets/lazy-B.js");

		harness.respond("/trade/BTC", () => shell(["/assets/index-C.js"]));
		harness.respond("/assets/index-C.js", () => asset("index C"));
		await harness.navigate("/trade/BTC").settled();
		expect(harness.cachedKeys("assets-v11")).toEqual(["/assets/index-B.js", "/assets/index-C.js"]);
	});

	it("continues an incomplete sync on the next navigation", async () => {
		const harness = createHarness();
		await seedRelease(harness, ["/assets/index-A.js"]);
		harness.respond("/trade/BTC", () => shell(["/assets/index-B.js", "/assets/vendor-B.js"]));
		harness.respond("/assets/index-B.js", () => asset("index B"));
		harness.respond("/assets/vendor-B.js", busy);
		await harness.navigate("/trade/BTC").settled();
		expect(await harness.manifest()).toEqual(["/assets/index-A.js"]);

		harness.respond("/assets/vendor-B.js", () => asset("vendor B"));
		await harness.navigate("/trade/BTC").settled();
		expect(harness.requests("/assets/index-B.js")).toBe(1);
		expect(harness.requests("/assets/vendor-B.js")).toBe(2);
		expect(await harness.manifest()).toEqual(["/assets/index-B.js", "/assets/vendor-B.js"]);
	});

	it("removes what incomplete syncs left behind at the next shell change", async () => {
		const harness = createHarness();
		await seedRelease(harness, ["/assets/index-A.js"]);
		for (const name of ["B", "C", "D"]) {
			harness.respond("/trade/BTC", () => shell([`/assets/index-${name}.js`, `/assets/vendor-${name}.js`]));
			harness.respond(`/assets/index-${name}.js`, () => asset(`index ${name}`));
			harness.respond(`/assets/vendor-${name}.js`, busy);
			await harness.navigate("/trade/BTC").settled();
		}
		expect(harness.cachedKeys("assets-v11")).toEqual(["/assets/index-A.js", "/assets/index-D.js"]);
	});

	it("reconciles with the shell in the cache when a newer shell arrives while a sync waits for the cache keys", async () => {
		const harness = createHarness();
		await seedRelease(harness, ["/assets/index-A.js"]);
		const gate = deferred<void>();
		harness.keysGates.set("assets-v11", gate.promise);
		harness.respond("/trade/BTC", () => shell(["/assets/index-B.js"]));
		harness.respond("/assets/index-B.js", () => asset("index B"));
		const older = harness.navigate("/trade/BTC");
		await ticks(30);
		expect(harness.keysCalls.get("assets-v11")).toBe(1);

		harness.respond("/trade/BTC?lang=ja", () => shell(["/assets/index-C.js"]));
		harness.respond("/assets/index-C.js", () => asset("index C"));
		const newer = harness.navigate("/trade/BTC?lang=ja");
		await (await newer.response)?.text();
		await harness.load("/assets/index-C.js");
		await ticks(30);
		expect(harness.keysCalls.get("assets-v11")).toBe(1);

		harness.keysGates.delete("assets-v11");
		gate.resolve();
		await Promise.all([older.settled(), newer.settled()]);
		expect(await harness.cachedText("shell-v11", shellKey)).toContain("/assets/index-C.js");
		expect(harness.deleted).not.toContain(`${origin}/assets/index-C.js`);
		expect(harness.requests("/assets/index-C.js")).toBe(1);
		expect(harness.requests("/assets/index-B.js")).toBe(0);
		expect(await harness.manifest()).toEqual(["/assets/index-C.js"]);
	});

	it("records the assets on first takeover without fetching them", async () => {
		const harness = createHarness();
		harness.respond("/trade/ETH", () => shell(["/assets/index-B.js"]));
		harness.respond("/assets/index-B.js", () => asset("index B"));
		const navigation = harness.navigate("/trade/ETH");
		expect(await (await navigation.response)?.text()).toContain("/assets/index-B.js");
		await navigation.settled();
		expect(await harness.manifest()).toEqual(["/assets/index-B.js"]);
		expect(harness.requests("/assets/index-B.js")).toBe(0);
		expect(harness.opened("assets-v11")).toBe(0);
	});

	it("does not open the asset cache when the recorded assets match the shell", async () => {
		const harness = createHarness();
		await seedRelease(harness, ["/assets/index-A.js"]);
		await harness.seed("assets-v11", "/assets/lazy-A.js", asset("lazy A"));
		const opened = harness.opened("assets-v11");
		harness.respond("/trade/BTC", () => shell(["/assets/index-A.js"]));
		await harness.navigate("/trade/BTC").settled();
		expect(harness.opened("assets-v11")).toBe(opened);
		expect(harness.cachedKeys("assets-v11")).toEqual(["/assets/index-A.js", "/assets/lazy-A.js"]);
	});

	it("also prefetches after a language link", async () => {
		const harness = createHarness();
		await seedRelease(harness, ["/assets/index-A.js"]);
		harness.respond("/trade/BTC?lang=ja", () => shell(["/assets/index-B.js"]));
		harness.respond("/assets/index-B.js", () => asset("index B"));
		const navigation = harness.navigate("/trade/BTC?lang=ja");
		await (await navigation.response)?.text();
		await navigation.settled();
		expect(harness.cachedKeys("assets-v11")).toEqual(["/assets/index-A.js", "/assets/index-B.js"]);
		expect(await harness.manifest()).toEqual(["/assets/index-B.js"]);
	});

	it("prefetches six assets at a time", async () => {
		const harness = createHarness();
		await seedRelease(harness, ["/assets/index-A.js"]);
		const names = Array.from({ length: 10 }, (_, index) => `/assets/chunk-${index}.js`);
		harness.respond("/trade/BTC", () => shell(names));
		for (const name of names) {
			harness.respond(name, () => new Promise((done) => setTimeout(() => done(asset(name)), 5)));
		}
		await harness.navigate("/trade/BTC").settled();
		expect(harness.flight.peak).toBe(6);
		expect(harness.cachedKeys("assets-v11")).toHaveLength(11);
	});

	it("runs one sync at a time", async () => {
		const harness = createHarness();
		await seedRelease(harness, ["/assets/index-A.js"]);
		const pending = deferred<void>();
		const slow = Array.from({ length: 6 }, (_, index) => `/assets/slow-B${index}.js`);
		harness.respond("/trade/BTC", () => shell(slow));
		for (const path of slow) harness.respond(path, () => pending.promise.then(() => asset(path)));
		const first = harness.navigate("/trade/BTC");
		await ticks(30);
		harness.respond("/trade/BTC", () => shell(["/assets/index-C.js"]));
		harness.respond("/assets/index-C.js", () => asset("index C"));
		const second = harness.navigate("/trade/BTC");
		await ticks(30);
		expect(harness.requests("/assets/index-C.js")).toBe(0);
		pending.resolve();
		await Promise.all([first.settled(), second.settled()]);
		expect(harness.requests("/assets/index-C.js")).toBe(1);
		expect(await harness.manifest()).toEqual(["/assets/index-C.js"]);
	});

	it("stops after the time limit without leaving a timer, a request or a later request behind", async () => {
		vi.useFakeTimers();
		const harness = createHarness();
		await seedWithFakeTimers(harness, ["/assets/index-A.js"]);
		const hanging = Array.from({ length: 8 }, (_, index) => `/assets/hang-B${index}.js`);
		harness.respond("/trade/BTC", () => shell(hanging));
		for (const path of hanging) harness.respond(path, () => new Promise<Response>(() => {}));
		const navigation = harness.navigate("/trade/BTC");
		let settled = false;
		void navigation.settled().then(() => {
			settled = true;
		});
		await vi.advanceTimersByTimeAsync(59_000);
		expect(settled).toBe(false);
		await vi.advanceTimersByTimeAsync(1_100);
		expect(settled).toBe(true);
		expect(harness.aborted).toHaveLength(6);
		await vi.advanceTimersByTimeAsync(1_000);
		expect(harness.requestedAssets()).toHaveLength(6);
		expect(vi.getTimerCount()).toBe(0);
		expect(await harness.manifest()).toEqual(["/assets/index-A.js"]);

		for (const path of hanging) harness.respond(path, () => typedAsset(path));
		const next = harness.navigate("/trade/BTC");
		await vi.advanceTimersByTimeAsync(200);
		await next.settled();
		expect(harness.cachedKeys("assets-v11")).toHaveLength(9);
		expect(await harness.manifest()).toHaveLength(8);
	});

	it("clears its timer when it finishes in time", async () => {
		vi.useFakeTimers();
		const harness = createHarness();
		await seedWithFakeTimers(harness, ["/assets/index-A.js"]);
		harness.respond("/trade/BTC", () => shell(["/assets/index-B.js"]));
		harness.respond("/assets/index-B.js", () => asset("index B"));
		const navigation = harness.navigate("/trade/BTC");
		await vi.advanceTimersByTimeAsync(100);
		await navigation.settled();
		expect(harness.cachedKeys("assets-v11")).toContain("/assets/index-B.js");
		expect(vi.getTimerCount()).toBe(0);
	});
});

describe("service worker shell asset list", () => {
	const realShell = [
		'<link rel="modulepreload" href="/assets/index-BykY0ZKy.js"/>',
		'<link rel="modulepreload" href="/assets/vendor-tanstack-router-Dxjx6Gvf.js"/>',
		'<link rel="stylesheet" href="/assets/styles-BG9gMMIW.css" data-precedence="default"/>',
		'<link rel="preload" href="/assets/inter-latin-wght-normal-Dx4kXJAl.woff2" as="font" type="font/woff2" crossorigin="anonymous"/>',
		'<link rel="preload" href="/charting_library/charting_library.6d17e2dafb1007c4.js" as="script" media="(min-width: 1001px)"/>',
		'<link rel="icon" href="/favicon.svg"/>',
		'<link rel="manifest" href="/manifest.json"/>',
		'<link rel="dns-prefetch" href="https://app.hyperliquid.xyz"/>',
		...renderShellPreloadLinks({ files: ["app-toaster-BGuRiK0z.css", "chunk-Q1.js"], existingHrefs: new Set() }),
		...renderSurfacePreloadMeta({
			desktopOnly: ["orders-history-tab-nC3GIRxZ.js", "history-tab-CkfmXa_T.js"],
			mobileOnly: ["mobile-sheet-M1.js"],
			chartPrefetches: ["/charting_library/bundles/runtime.4d986d07cb97d8edacba.js", "/tradingview-theme-dark.css"],
		}),
		'<script>window.x = \'<link rel="modulepreload" href="/assets/inline-only.js">\';</script>',
		'<script type="module" async="" src="/assets/index-BykY0ZKy.js"></script>',
	].join("");

	async function prefetchedFrom(markup: string, available: string[]) {
		const harness = createHarness();
		await seedRelease(harness, []);
		harness.respond("/trade/BTC", () => html(`<html><head>${markup}</head></html>`));
		for (const path of available) harness.respond(path, () => typedAsset(path));
		await harness.navigate("/trade/BTC").settled();
		return { requested: harness.requestedAssets(), cached: harness.cachedKeys("assets-v11") };
	}

	it("prefetches the preloads, stylesheets, scripts and both surface lists of the shell, and nothing else", async () => {
		const expected = [
			"/assets/app-toaster-BGuRiK0z.css",
			"/assets/chunk-Q1.js",
			"/assets/history-tab-CkfmXa_T.js",
			"/assets/index-BykY0ZKy.js",
			"/assets/inter-latin-wght-normal-Dx4kXJAl.woff2",
			"/assets/mobile-sheet-M1.js",
			"/assets/orders-history-tab-nC3GIRxZ.js",
			"/assets/styles-BG9gMMIW.css",
			"/assets/vendor-tanstack-router-Dxjx6Gvf.js",
		];
		const result = await prefetchedFrom(realShell, expected);
		expect(result.requested).toEqual(expected);
		expect(result.cached).toEqual(expected);
	});

	it.each([
		[
			"a script in a comment",
			'<!-- <script src="/assets/absent.js"></script> --><script src="/assets/real.js"></script>',
		],
		["an empty comment <!-->", '<!--><script src="/assets/real.js"></script>'],
		["an empty comment <!--->", '<!---><script src="/assets/real.js"></script>'],
		["a > inside a quoted attribute", '<link rel="modulepreload" title="a>b" href="/assets/real.js">'],
		[
			"script markup inside another tag's attribute",
			'<div title=\'<script src="/assets/absent.js"></script>\'></div><script src="/assets/real.js"></script>',
		],
		[
			"a comment opener inside an inline script",
			'<script>const s="<!--";</script><script src="/assets/real.js"></script>',
		],
		[
			"link markup inside an inline script",
			'<script>document.write(\'<link rel="modulepreload" href="/assets/absent.js">\')</script><script src="/assets/real.js"></script>',
		],
		[
			"</scriptx inside an inline script",
			'<script>a="</scriptx>"; b=\'<script src="/assets/absent.js"></script>\';</script><script src="/assets/real.js"></script>',
		],
		[
			"a tag whose name only starts with script",
			'<scriptx src="/assets/absent.js"></scriptx><script src="/assets/real.js"></script>',
		],
		["upper-case tags and single quotes", "<LINK REL='modulepreload' HREF='/assets/real.js'>"],
		["unquoted attributes", "<link rel=modulepreload href=/assets/real.js>"],
		["a closing script tag in upper case", '<SCRIPT>var a = "x";</SCRIPT ><script src="/assets/real.js"></script>'],
	])("reads the shell correctly with %s", async (_, markup) => {
		const result = await prefetchedFrom(markup, ["/assets/real.js", "/assets/absent.js"]);
		expect(result.requested).toEqual(["/assets/real.js"]);
	});

	it("reads the same surface preload names that the build writes", () => {
		for (const name of [SURFACE_PRELOAD_META.desktop, SURFACE_PRELOAD_META.mobile]) {
			expect(serviceWorker).toContain(`"${name}"`);
		}
		expect(serviceWorker).not.toContain(`"${SURFACE_PRELOAD_META.chart}"`);
	});
});
