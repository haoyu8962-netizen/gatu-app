import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";

const TEST_DIR = __dirname;
const TERMINAL_ROOT = resolve(TEST_DIR, "../../..");
const REPOSITORY_ROOT = resolve(TERMINAL_ROOT, "../..");

const viteConfig = readFileSync(resolve(TERMINAL_ROOT, "vite.config.ts"), "utf8");
const serviceWorker = readFileSync(resolve(TERMINAL_ROOT, "public/sw.js"), "utf8");
const referralUriGuard = readFileSync(resolve(REPOSITORY_ROOT, "deploy/referral-uri-guard.cjs"), "utf8");
const rootRoute = readFileSync(resolve(TERMINAL_ROOT, "src/routes/__root.tsx"), "utf8");
const securityHeadersSource = readFileSync(resolve(TERMINAL_ROOT, "src/config/security-headers.ts"), "utf8");

interface ServiceWorkerHarnessOptions {
	caches: Record<string, unknown>;
	fetch: (request: unknown) => Promise<unknown>;
	claimClients?: () => Promise<unknown>;
}

function createServiceWorkerHarness({
	caches,
	fetch,
	claimClients = () => Promise.resolve(),
}: ServiceWorkerHarnessOptions) {
	const listeners = new Map<string, (event: Record<string, unknown>) => void>();
	const self = {
		location: { origin: "https://app.sairn.ai" },
		addEventListener: (type: string, listener: (event: Record<string, unknown>) => void) => {
			listeners.set(type, listener);
		},
		clients: { claim: claimClients },
		skipWaiting: () => undefined,
	};

	runInNewContext(serviceWorker, { self, caches, fetch, URL, setTimeout, clearTimeout });
	return listeners;
}

afterEach(() => {
	vi.useRealTimers();
});

describe("TradingView asset cache policy", () => {
	it("revalidates the chart package except its content-hashed bundles and emits a content-hashed loader copy", () => {
		expect(viteConfig).toMatch(/'\/charting_library\/\*\*'[\s\S]*?max-age=0, must-revalidate/);
		expect(viteConfig).toMatch(/'\/charting_library\/bundles\/\*\*'[\s\S]*?max-age=31536000, immutable/);
		expect(viteConfig).not.toMatch(/'\/charting_library\/charting_library\.js'/);
		expect(viteConfig).toMatch(
			/fileName: createHashedChartLibraryEntryPath\(chartLibraryHash\), source: chartLibraryEntry/,
		);
		expect(viteConfig).toMatch(/'\/tradingview-theme-\*\.css'[\s\S]*?max-age=0, must-revalidate/);
		expect(viteConfig).toMatch(
			/publicAssets:[\s\S]*?baseURL: '\/charting_library'[\s\S]*?maxAge: 0[\s\S]*?fallthrough: false/,
		);
	});

	it("leaves TradingView delivery to HTTP caching and immediately updates the service worker", () => {
		expect(serviceWorker).toContain('const CACHE_VERSION = "v11"');
		expect(serviceWorker).not.toContain("CHARTING_CACHE");
		expect(serviceWorker.split('url.pathname.startsWith("/charting_library/")')).toHaveLength(2);
		expect(serviceWorker).toContain(
			'if (request.destination === "font" && !url.pathname.startsWith("/charting_library/")) {',
		);
		expect(rootRoute).toContain('scope: "/", updateViaCache: "none"');
		expect(rootRoute).toContain(".catch(() => undefined)");
		expect(viteConfig).toMatch(/'\/sw\.js'[\s\S]*?'cache-control': 'no-store'/);
	});

	it("protects referral deep links", () => {
		expect(referralUriGuard).toContain('pathname !== "/join" && !pathname.startsWith("/join/")');
		expect(referralUriGuard).toContain("decodeURI(pathname)");
		expect(securityHeadersSource).toMatch(
			/export const referralJoinHeaders[\s\S]*?"cache-control": "no-store"[\s\S]*?"referrer-policy": "no-referrer"[\s\S]*?"x-robots-tag": "noindex, nofollow"/,
		);
		expect(viteConfig).toContain("referralJoinHeaders, securityHeaders } from './src/config/security-headers'");
		expect(viteConfig).toMatch(/'\/join': \{[\s\S]*?headers: referralJoinHeaders/);
		expect(viteConfig).toMatch(/'\/join\/\*\*': \{[\s\S]*?headers: referralJoinHeaders/);
	});

	it("deletes only retired managed caches, the v10 caches included, when v11 activates", async () => {
		const deleted: string[] = [];
		const listeners = createServiceWorkerHarness({
			caches: {
				keys: () =>
					Promise.resolve([
						"charting-v7",
						"fonts-v7",
						"shell-v9",
						"documents-v9",
						"fonts-v10",
						"icons-v10",
						"shell-v10",
						"assets-v10",
						"assets-v11",
						"fonts-v11",
						"icons-v11",
						"shell-v11",
						"unrelated-cache",
					]),
				delete: (key: string) => {
					deleted.push(key);
					return Promise.resolve(true);
				},
			},
			fetch: () => Promise.reject(new Error("unexpected fetch")),
		});
		let activation: Promise<unknown> | undefined;

		listeners.get("activate")?.({
			waitUntil: (promise: Promise<unknown>) => {
				activation = promise;
			},
		});
		await activation;

		expect(deleted).toEqual([
			"charting-v7",
			"fonts-v7",
			"shell-v9",
			"documents-v9",
			"fonts-v10",
			"icons-v10",
			"shell-v10",
			"assets-v10",
		]);
	});

	it("claims clients and finishes activation when CacheStorage stalls", async () => {
		vi.useFakeTimers();
		const claimClients = vi.fn(() => new Promise<never>(() => {}));
		const listeners = createServiceWorkerHarness({
			caches: {
				keys: () => new Promise<never>(() => {}),
			},
			fetch: () => Promise.reject(new Error("unexpected fetch")),
			claimClients,
		});
		let activation: Promise<unknown> | undefined;

		listeners.get("activate")?.({
			waitUntil: (promise: Promise<unknown>) => {
				activation = promise;
			},
		});
		await Promise.resolve();
		expect(claimClients).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(1_500);
		await expect(activation).resolves.toBeUndefined();
	});

	it.each([
		["the loader", "/charting_library/charting_library.js", "script"],
		["a content-hashed bundle", "/charting_library/bundles/library.f5eaeb6901219f861981.js", "script"],
		["a content-hashed stylesheet", "/charting_library/bundles/9662.03109f673cda5962c847.css", "style"],
		["a content-hashed font", "/charting_library/bundles/EuclidCircular.be8f862db48c2976009f.woff2", "font"],
	])("does not intercept a TradingView request for %s", (_, path, destination) => {
		let intercepted = false;
		const listeners = createServiceWorkerHarness({
			caches: {},
			fetch: () => Promise.reject(new Error("unexpected fetch")),
		});

		listeners.get("fetch")?.({
			request: {
				method: "GET",
				url: `https://app.sairn.ai${path}`,
				destination,
				headers: { has: () => false },
			},
			respondWith: (response: Promise<unknown>) => {
				intercepted = true;
				Promise.resolve(response).catch(() => undefined);
			},
			waitUntil: () => undefined,
		});

		expect(intercepted).toBe(false);
	});

	it("returns successful font and icon responses before a failed CacheStorage write settles", async () => {
		const networkResponse = {
			ok: true,
			type: "basic",
			headers: { get: () => "image/svg+xml" },
			clone: () => networkResponse,
		};
		let pendingWrite: Promise<never>;
		const cache = {
			match: () => Promise.resolve(undefined),
			put: () => pendingWrite,
			keys: () => Promise.resolve([]),
		};
		const listeners = createServiceWorkerHarness({
			caches: {
				match: () => Promise.resolve(undefined),
				open: () => Promise.resolve(cache),
			},
			fetch: () => Promise.resolve(networkResponse),
		});

		for (const request of [
			{ method: "GET", url: "https://app.sairn.ai/font.woff2", destination: "font" },
			{ method: "GET", url: "https://app.hyperliquid.xyz/coins/AAVE.svg", destination: "image" },
		]) {
			let rejectWrite: ((error: Error) => void) | undefined;
			pendingWrite = new Promise<never>((_resolve, reject) => {
				rejectWrite = reject;
			});
			let response: Promise<unknown> | undefined;
			const background: Promise<unknown>[] = [];
			listeners.get("fetch")?.({
				request,
				respondWith: (promise: Promise<unknown>) => {
					response = Promise.resolve(promise);
				},
				waitUntil: (promise: Promise<unknown>) => background.push(promise),
			});

			expect(await response).toBe(networkResponse);
			rejectWrite?.(new Error("quota exceeded"));
			await Promise.all(background);
		}
	});
});
