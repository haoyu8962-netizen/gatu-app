import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";

const TEST_DIR = __dirname;
const TERMINAL_ROOT = resolve(TEST_DIR, "../../..");
const REPOSITORY_ROOT = resolve(TERMINAL_ROOT, "../..");

const viteConfig = readFileSync(resolve(TERMINAL_ROOT, "vite.config.ts"), "utf8");
const serviceWorker = readFileSync(resolve(TERMINAL_ROOT, "public/sw.js"), "utf8");
const caddyfile = readFileSync(resolve(REPOSITORY_ROOT, "deploy/Caddyfile"), "utf8");
const deployScript = readFileSync(resolve(REPOSITORY_ROOT, "deploy/deploy.sh"), "utf8");
const rootRoute = readFileSync(resolve(TERMINAL_ROOT, "src/routes/__root.tsx"), "utf8");

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
	it("revalidates the complete chart package at the application server", () => {
		expect(viteConfig).toMatch(/'\/charting_library\/\*\*'[\s\S]*?max-age=0, must-revalidate/);
		expect(viteConfig).toMatch(/'\/tradingview-theme\.css'[\s\S]*?max-age=0, must-revalidate/);
		expect(viteConfig).toMatch(
			/publicAssets:[\s\S]*?baseURL: '\/charting_library'[\s\S]*?maxAge: 0[\s\S]*?fallthrough: false/,
		);
	});

	it("only gives immutable caching to application build assets", () => {
		expect(caddyfile).toContain("@immutable path /assets/*");
		expect(caddyfile).not.toMatch(/@immutable path[^\n]*charting_library/);
	});

	it("leaves TradingView delivery to HTTP caching and immediately updates the service worker", () => {
		expect(serviceWorker).toContain('const CACHE_VERSION = "v8"');
		expect(serviceWorker).not.toContain("CHARTING_CACHE");
		expect(serviceWorker).not.toContain('url.pathname.startsWith("/charting_library/")');
		expect(rootRoute).toContain('scope: "/", updateViaCache: "none"');
		expect(rootRoute).toContain(".catch(() => undefined)");
		expect(viteConfig).toMatch(/'\/sw\.js'[\s\S]*?'cache-control': 'no-store'/);
	});

	it("overrides upstream chart cache headers and rejects missing chart files at the edge", () => {
		expect(caddyfile).toContain("@chart_assets path /charting_library/* /tradingview-theme.css");
		expect(caddyfile).toContain('header @chart_assets >Cache-Control "public, max-age=0, must-revalidate"');
		expect(caddyfile).toMatch(/@missing_chart_asset[\s\S]*?path \/charting_library\/\*[\s\S]*?not file/);
		expect(caddyfile).toMatch(/root \/opt\/gatu\/current[\s\S]*?try_files public\//);
		expect(caddyfile).toContain("respond @missing_chart_asset 404");
		expect(caddyfile).not.toContain("+Cache-Control");
	});

	it("checks the final Caddy responses during deployment", () => {
		expect(deployScript).toContain("verify_caddy_config");
		expect(deployScript).not.toMatch(/^\s*sudo \/usr\/bin\/install/m);
		expect(deployScript).toContain("verify_single_header_value");
		expect(deployScript).toContain("extract_initial_chart_assets");
		expect(deployScript).toContain("verify_missing_chart_asset");
		expect(deployScript).toContain("edge_health_check");
		expect(deployScript).toMatch(/GATU_PUBLIC_BASE_URL="\$\{GATU_PUBLIC_BASE_URL:-https:\/\/app\.gatu\.ai\}"/);
		expect(deployScript).toContain('curl --connect-timeout "$CURL_CONNECT_TIMEOUT_SECONDS"');
		expect(deployScript).toMatch(
			/rollback_to_release[\s\S]*?edge_health_check "\$GATU_PUBLIC_BASE_URL" "\$rollback_expected_commit" "\$rollback_expected_release"/,
		);
	});

	it("deletes only retired managed caches when v8 activates", async () => {
		const deleted: string[] = [];
		const listeners = createServiceWorkerHarness({
			caches: {
				keys: () => Promise.resolve(["charting-v7", "fonts-v7", "fonts-v8", "icons-v8", "unrelated-cache"]),
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

		expect(deleted).toEqual(["charting-v7", "fonts-v7"]);
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

	it("does not intercept TradingView requests", () => {
		let intercepted = false;
		const listeners = createServiceWorkerHarness({
			caches: {},
			fetch: () => Promise.reject(new Error("unexpected fetch")),
		});

		listeners.get("fetch")?.({
			request: {
				method: "GET",
				url: "https://app.gatu.ai/charting_library/charting_library.js",
				destination: "script",
			},
			respondWith: () => {
				intercepted = true;
			},
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
			{ method: "GET", url: "https://app.gatu.ai/font.woff2", destination: "font" },
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
