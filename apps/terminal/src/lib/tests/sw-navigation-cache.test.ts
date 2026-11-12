import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { classifyStaticPageRequest } from "@/lib/static-pages/static-pages";

const terminalRoot = resolve(__dirname, "../../..");
const serviceWorker = readFileSync(resolve(terminalRoot, "public/sw.js"), "utf8");
const origin = "https://app.sairn.ai";

function html(body: string) {
	return new Response(body, {
		headers: {
			"content-type": "text/html; charset=utf-8",
			"content-security-policy": "script-src 'sha256-old'",
			"x-test-header": "preserved",
		},
	});
}

function opaqueRedirect() {
	const response = new Response(null, { status: 302, headers: { location: `${origin}/trade/BTC` } });
	Object.defineProperty(response, "type", { value: "opaqueredirect" });
	Object.defineProperty(response, "status", { value: 0 });
	return response;
}

function createHarness() {
	const stores = new Map<string, Map<string, Response>>();
	const listeners = new Map<string, (event: Record<string, unknown>) => void>();
	const fetch = vi.fn<(request: Request) => Promise<Response>>().mockResolvedValue(html("new"));
	function keyOf(request: Request | string) {
		return typeof request === "string" ? request : request.url;
	}
	const open = vi.fn(async (name: string) => {
		let store = stores.get(name);
		if (!store) {
			store = new Map();
			stores.set(name, store);
		}
		const entries = store;
		return {
			match: async (request: Request | string) => entries.get(keyOf(request))?.clone(),
			put: async (request: Request | string, response: Response) => {
				entries.set(keyOf(request), response);
			},
		};
	});
	const self = {
		location: { origin },
		addEventListener: (name: string, callback: (event: Record<string, unknown>) => void) => {
			listeners.set(name, callback);
		},
	};
	const context = { self, caches: { open }, fetch, Request, Response, URL, AbortController, setTimeout, clearTimeout };
	runInNewContext(serviceWorker, context);
	function navigate(path: string) {
		const request = new Request(new URL(path, origin), { redirect: "manual" });
		Object.defineProperty(request, "mode", { value: "navigate" });
		let response: Promise<Response> | undefined;
		const background: Promise<unknown>[] = [];
		listeners.get("fetch")?.({
			request,
			respondWith: (value: Promise<Response>) => {
				response = value;
			},
			waitUntil: (value: Promise<unknown>) => {
				background.push(value);
			},
		});
		return { response, background, request };
	}
	return { stores, open, fetch, navigate, context };
}

describe("service worker navigation caching", () => {
	it("stores the shell when the page consumes a network miss before the background refresh settles", async () => {
		const harness = createHarness();
		const network = html("first shell");
		let finishFetch: ((response: Response) => void) | undefined;
		harness.fetch.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					finishFetch = resolve;
				}),
		);
		const miss = harness.navigate("/trade/ETH");
		let refreshed = false;
		const refresh = Promise.all(miss.background).then(() => {
			refreshed = true;
		});
		await new Promise((resolve) => setTimeout(resolve, 0));
		finishFetch?.(network);
		const response = await miss.response;
		expect(response).toBe(network);
		if (!response) throw new Error("Navigation did not return a response");
		const body = response.text();
		expect(refreshed).toBe(false);
		expect(network.bodyUsed).toBe(true);
		expect(() => network.clone()).toThrow();
		expect(await body).toBe("first shell");
		await refresh;
		expect(await harness.stores.get("shell-v11")?.get(`${origin}/shell-v11`)?.clone().text()).toBe("first shell");
	});

	it("serves one shared application shell immediately with intact headers and refreshes in the background", async () => {
		const harness = createHarness();
		const cache = await harness.open("shell-v11");
		await cache.put(`${origin}/shell-v11`, html("old"));
		let finishFetch: ((response: Response) => void) | undefined;
		harness.fetch.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					finishFetch = resolve;
				}),
		);
		const navigation = harness.navigate("/trade/SOL");
		const response = await navigation.response;
		expect(await response?.text()).toBe("old");
		expect(response?.headers.get("content-security-policy")).toBe("script-src 'sha256-old'");
		expect(response?.headers.get("x-test-header")).toBe("preserved");
		expect(navigation.background).toHaveLength(1);
		expect(harness.fetch).toHaveBeenCalledWith(navigation.request);
		finishFetch?.(html("new"));
		await Promise.all(navigation.background);
		const next = harness.navigate("/portfolio?tab=history");
		expect(await (await next.response)?.text()).toBe("new");
		await Promise.all(next.background);
		expect([...(harness.stores.get("shell-v11")?.keys() ?? [])]).toEqual([`${origin}/shell-v11`]);
	});

	it("answers legal pages from the same shell entry as every other application route", async () => {
		const harness = createHarness();
		harness.fetch.mockImplementation(() => Promise.resolve(html("shell")));
		const miss = harness.navigate("/terms");
		expect(await (await miss.response)?.text()).toBe("shell");
		await Promise.all(miss.background);
		for (const path of ["/docs", "/privacy/", "/risk?lang=en", "/support", "/cookies", "/trade/ETH"]) {
			const hit = harness.navigate(path);
			expect(await (await hit.response)?.text(), path).toBe("shell");
			await Promise.all(hit.background);
		}
		expect([...harness.stores.keys()]).toEqual(["shell-v11"]);
		expect([...(harness.stores.get("shell-v11")?.keys() ?? [])]).toEqual([`${origin}/shell-v11`]);
	});

	it.each([
		"/join",
		"/join/",
		"/join/abc",
		"/join/abc/",
		"/assets/app.js",
		"/missing.webmanifest",
		"/.env",
		"/docs/index.html",
		"/font.woff2/",
		"/api",
		"/api/geo",
		"/client-error-report",
		"/mobile-agent-sync-ticket",
		"/mobile-agent-sync-ticket/abc",
		"/mobile-agent-sync",
		"/mobile-agent-sync/",
		"/Mobile-Agent-Sync",
		"/mobile-agent-sync/nested",
		"/_serverFn/id",
		"https://other.example/trade/SOL",
	])("bypasses %s", (path) => {
		const harness = createHarness();
		const navigation = harness.navigate(path);
		expect(navigation.response).toBeUndefined();
		expect(navigation.background).toHaveLength(0);
		expect(harness.fetch).not.toHaveBeenCalled();
		expect(harness.open).not.toHaveBeenCalled();
	});

	it.each([
		[404, "text/html"],
		[500, "text/html"],
		[302, "text/html"],
		[200, "application/json"],
		[200, "text/html-malformed"],
	])("does not store status %s with content-type %s", async (status, contentType) => {
		const harness = createHarness();
		const network = new Response("bad", { status, headers: { "content-type": contentType } });
		harness.fetch.mockResolvedValue(network);
		const navigation = harness.navigate("/trade/ETH");
		expect(await navigation.response).toBe(network);
		await Promise.all(navigation.background);
		expect(harness.stores.get("shell-v11")?.size).toBe(0);
	});

	it("does not store redirected HTML or replace a good cached shell with an error", async () => {
		const harness = createHarness();
		const cache = await harness.open("shell-v11");
		await cache.put(`${origin}/shell-v11`, html("old"));
		const redirected = html("redirect destination");
		Object.defineProperty(redirected, "redirected", { value: true });
		for (const response of [redirected, new Response("missing", { status: 404 })]) {
			harness.fetch.mockResolvedValueOnce(response);
			const navigation = harness.navigate("/trade/ETH");
			expect(await (await navigation.response)?.text()).toBe("old");
			await Promise.all(navigation.background);
			expect(await harness.stores.get("shell-v11")?.get(`${origin}/shell-v11`)?.clone().text()).toBe("old");
		}
	});

	it("keeps cached HTML on a network failure and serves network HTML when CacheStorage fails", async () => {
		const harness = createHarness();
		const cache = await harness.open("shell-v11");
		await cache.put(`${origin}/shell-v11`, html("old"));
		harness.fetch.mockRejectedValueOnce(new Error("offline"));
		const cached = harness.navigate("/trade/ETH");
		expect(await (await cached.response)?.text()).toBe("old");
		await Promise.all(cached.background);
		harness.open.mockRejectedValueOnce(new Error("storage unavailable"));
		const uncached = harness.navigate("/docs");
		expect(await (await uncached.response)?.text()).toBe("new");
		await Promise.all(uncached.background);
	});

	it("keeps no route-specific page list in the worker, the edge function or the static-page runtime", () => {
		const edge = readFileSync(resolve(terminalRoot, "../../deploy/cloudfront/functions/terminal-request.js"), "utf8");
		expect(serviceWorker).not.toContain("DOCUMENT_ROUTES");
		expect(edge).not.toContain("DOCUMENT_ROUTES");
		for (const route of ["/cookies", "/docs", "/privacy", "/risk", "/support", "/terms"]) {
			expect(classifyStaticPageRequest("GET", route)).toMatchObject({ kind: "page", candidates: ["_shell.html"] });
		}
		expect(serviceWorker).not.toContain("navigationPreload");
	});

	it("uses one file-extension bound in the worker, the edge function and the static-page runtime", () => {
		const edge = readFileSync(resolve(terminalRoot, "../../deploy/cloudfront/functions/terminal-request.js"), "utf8");
		const staticPages = readFileSync(resolve(terminalRoot, "src/lib/static-pages/static-pages.ts"), "utf8");
		for (const source of [serviceWorker, edge, staticPages]) {
			expect(source.match(/\[A-Za-z0-9\]\{1,(\d+)\}/)?.[1]).toBe("16");
		}
	});
});

// 2026-10-28 review: a language link (`?lang=`) is often a returning visitor's first visit after a release; a
// cached shell from the previous release would boot an entry that ignores the parameter, so it goes to the network.
describe("service worker navigation for a language link", () => {
	it("serves the current shell from the network instead of an older cached one, and caches it", async () => {
		const harness = createHarness();
		const cache = await harness.open("shell-v11");
		await cache.put(`${origin}/shell-v11`, html("previous release"));
		harness.fetch.mockResolvedValueOnce(html("current release"));
		const navigation = harness.navigate("/trade/xyz:ANT?lang=ja&utm_source=newsletter");
		expect(await (await navigation.response)?.text()).toBe("current release");
		await Promise.all(navigation.background);
		expect(await harness.stores.get("shell-v11")?.get(`${origin}/shell-v11`)?.clone().text()).toBe("current release");
	});

	it("falls back to the cached shell when the network fails", async () => {
		const harness = createHarness();
		const cache = await harness.open("shell-v11");
		await cache.put(`${origin}/shell-v11`, html("cached"));
		harness.fetch.mockRejectedValueOnce(new TypeError("offline"));
		const navigation = harness.navigate("/trade/BTC?lang=ja");
		expect(await (await navigation.response)?.text()).toBe("cached");
	});

	it.each([500, 503, 599])(
		"serves the cached shell instead of a %s server error, like any other navigation, and keeps it",
		async (status) => {
			const harness = createHarness();
			const cache = await harness.open("shell-v11");
			await cache.put(`${origin}/shell-v11`, html("cached"));
			harness.fetch.mockResolvedValueOnce(new Response("busy", { status, headers: { "content-type": "text/html" } }));
			const navigation = harness.navigate("/trade/BTC?lang=ja");
			expect(await (await navigation.response)?.text()).toBe("cached");
			await Promise.all(navigation.background);
			expect(await harness.stores.get("shell-v11")?.get(`${origin}/shell-v11`)?.clone().text()).toBe("cached");
		},
	);

	it.each([
		["a 404", () => new Response("missing", { status: 404, headers: { "content-type": "text/html" } })],
		["a redirect", opaqueRedirect],
	])("passes %s to the browser even when a shell is cached, and keeps the cache", async (_, answer) => {
		const harness = createHarness();
		const cache = await harness.open("shell-v11");
		await cache.put(`${origin}/shell-v11`, html("cached"));
		const network = answer();
		harness.fetch.mockResolvedValueOnce(network);
		const navigation = harness.navigate("/trade/BTC?lang=ja");
		expect(await navigation.response).toBe(network);
		await Promise.all(navigation.background);
		expect(await harness.stores.get("shell-v11")?.get(`${origin}/shell-v11`)?.clone().text()).toBe("cached");
	});

	it("does not cache an error page and fails like the network when nothing is cached", async () => {
		const harness = createHarness();
		harness.fetch.mockResolvedValueOnce(
			new Response("busy", { status: 503, headers: { "content-type": "text/html" } }),
		);
		const failed = harness.navigate("/trade/BTC?lang=ja");
		expect((await failed.response)?.status).toBe(503);
		await Promise.all(failed.background);
		expect(harness.stores.get("shell-v11")?.get(`${origin}/shell-v11`)).toBeUndefined();
		harness.fetch.mockRejectedValueOnce(new TypeError("offline"));
		await expect(harness.navigate("/trade/BTC?lang=ja").response).rejects.toThrow("offline");
	});

	it("keeps serving other navigations from the cache first", async () => {
		const harness = createHarness();
		const cache = await harness.open("shell-v11");
		await cache.put(`${origin}/shell-v11`, html("cached"));
		harness.fetch.mockReturnValueOnce(new Promise(() => {}));
		expect(await (await harness.navigate("/trade/BTC?utm_source=newsletter").response)?.text()).toBe("cached");
	});
});
