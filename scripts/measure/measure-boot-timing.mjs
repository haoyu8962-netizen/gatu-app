/**
 * Measures the production terminal boot sequence without adding boot marks to the application.
 *
 * The server must already be running from a single production build. Example:
 *   pnpm build
 *   PORT=3016 pnpm serve
 *   node scripts/measure/measure-boot-timing.mjs --url=http://127.0.0.1:3016 --tag=baseline
 *
 * Defaults to 3 samples for every route/cache/network combination (36 measured navigations,
 * plus one warm-up navigation per hot-cache sample). Results are written to ./out.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const { TARGET_URLS, loadPlaywright, newDesktopContext, parseArgs } = await loadRunnerCommon();

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "out");
const DEFAULT_ROUTES = ["/", "/trade/BTC", "/trade/xyz%3ACXMT"];
const DEFAULT_CACHE_MODES = ["cold", "hot"];
const DEFAULT_NETWORK_MODES = ["normal", "slow-4g"];
const DEFAULT_LOCALE = "zh";
const DEFAULT_SAMPLES = 3;
const DEFAULT_TIMEOUT_MS = 120_000;
const VIEWPORT = { width: 1440, height: 900 };
const SLOW_4G = {
	offline: false,
	latency: 150,
	downloadThroughput: 1_600_000 / 8,
	uploadThroughput: 750_000 / 8,
	connectionType: "cellular4g",
};

const args = parseArgs();
const baseUrl = normalizeBaseUrl(args.url ?? args.localUrl ?? new URL(TARGET_URLS.local).origin);
const routes = parseList(args.routes, DEFAULT_ROUTES);
const cacheModes = parseEnumList(args.cache ?? args.caches, DEFAULT_CACHE_MODES, new Set(DEFAULT_CACHE_MODES), "cache");
const networkModes = parseEnumList(
	args.network ?? args.networks,
	DEFAULT_NETWORK_MODES,
	new Set(DEFAULT_NETWORK_MODES),
	"network",
);
const samples = parsePositiveInteger(args.samples ?? DEFAULT_SAMPLES, "samples");
const timeoutMs = parsePositiveInteger(args.timeout ?? DEFAULT_TIMEOUT_MS, "timeout");
const expectedLocale = String(args.locale ?? DEFAULT_LOCALE).trim();
const headless = !parseBoolean(args.headed ?? false, "headed");
const tag = sanitizeTag(args.tag ?? "baseline");

if (samples < DEFAULT_SAMPLES) {
	throw new Error(`samples must be at least ${DEFAULT_SAMPLES}; received ${samples}`);
}
if (!expectedLocale) throw new Error("locale must not be empty");

const buildMeta = await assertProductionServer(baseUrl);

const { chromium } = loadPlaywright();
const browser = await chromium.launch({ headless });
const browserVersion = browser.version();
const runs = [];

try {
	for (const networkMode of networkModes) {
		for (const cacheMode of cacheModes) {
			for (const route of routes) {
				for (let sample = 1; sample <= samples; sample++) {
					const label = `${networkMode}/${cacheMode} ${route} #${sample}`;
					process.stderr.write(`measuring ${label}\n`);
					runs.push(
						await measureRun(browser, {
							baseUrl,
							route,
							cacheMode,
							networkMode,
							sample,
							expectedLocale,
							timeoutMs,
						}),
					);
				}
			}
		}
	}
} finally {
	await browser.close();
}

const payload = {
	schemaVersion: 2,
	generatedAt: new Date().toISOString(),
	config: {
		baseUrl,
		routes,
		cacheModes,
		networkModes,
		samplesPerScenario: samples,
		expectedLocale,
		viewport: { ...VIEWPORT, deviceScaleFactor: 2 },
		networkProfiles: { normal: null, "slow-4g": SLOW_4G },
		timeoutMs,
	},
	environment: {
		node: process.version,
		browser: `Chromium ${browserVersion}`,
		buildMeta,
	},
	definitions: {
		cacheModes:
			"cold clears the browser cache and disables HTTP cache; hot warms the same route in the same isolated context before a fresh document navigation",
		htmlResponseEndMs: "PerformanceNavigationTiming.responseEnd, including same-origin redirect time",
		firstPaintMs: "PerformancePaintTiming first-paint",
		firstContentfulPaintMs: "PerformancePaintTiming first-contentful-paint",
		hydrationCompleteMs:
			"First main React root commit observed by the Playwright-only DevTools hook; original SSR skeleton detach is retained as an upper-bound cross-check",
		clientRootModuleCompleteMs:
			"Playwright Storage probe observes client-root's unique top-level removal of hl-markets-meta-v1 after its static dependency graph has evaluated",
		clientRuntimeReadyMs:
			"First React root commit after AppRuntime's post-client-root locale-v1 read; render signal and commit are both retained",
		persistedLocaleReadyMs: "First time <html lang> equals the seeded persisted locale",
		marketCatalogRouteResolvableMs:
			"Upper bound: MainWorkspace's first ready-only commit, intentionally equal to mainWorkspaceCommitMs in schema v2. Exact route resolution remains internal to the market gate",
		topNavCommitMs: "First top-nav useRenderCommitTrack sample",
		mainWorkspaceCommitMs: "First main-workspace useRenderCommitTrack sample, before its measured-grid follow-up commit",
		webSocket:
			"Main-frame Hyperliquid WebSocket constructor count and first sent subscribe payload whose subscription has a coin",
	},
	summary: buildSummary(runs),
	runs,
};

mkdirSync(OUT, { recursive: true });
const outputFile = resolve(OUT, `boot-timing-${tag}.json`);
writeFileSync(outputFile, `${JSON.stringify(payload, null, 2)}\n`);
printSummary(payload.summary);
process.stderr.write(`\nwrote ${outputFile}\n`);

const failedRuns = runs.filter((run) => run.status !== "ok");
if (failedRuns.length > 0) {
	process.stderr.write(`${failedRuns.length}/${runs.length} measured runs were incomplete\n`);
	process.exitCode = 1;
}

async function measureRun(
	browserInstance,
	{ baseUrl: origin, route, cacheMode, networkMode, sample, expectedLocale: locale, timeoutMs: runTimeout },
) {
	const startedAt = new Date().toISOString();
	const result = {
		id: `${networkMode}:${cacheMode}:${route}:${sample}`,
		startedAt,
		route,
		cacheMode,
		networkMode,
		sample,
		requestedUrl: createMeasurementUrl(origin, route),
		status: "incomplete",
	};
	const context = await newDesktopContext(browserInstance, VIEWPORT.width, VIEWPORT.height);
	await context.addInitScript(installBootProbe, {
		expectedOrigin: origin,
		expectedLocale: locale,
		expectedMarket: expectedMarketForRoute(route),
	});
	const page = await context.newPage();
	const cdp = await context.newCDPSession(page);
	const pageErrors = [];
	const consoleMessages = [];
	page.on("pageerror", (error) => pageErrors.push(String(error?.message ?? error).slice(0, 500)));
	page.on("console", (message) => {
		if (message.type() === "error" || message.type() === "warning") {
			consoleMessages.push({ type: message.type(), text: message.text().slice(0, 1_000) });
		}
	});

	try {
		await configureNetwork(cdp, networkMode, cacheMode);
		if (cacheMode === "hot") {
			await navigateAndWait(page, result.requestedUrl, runTimeout);
			await page.waitForTimeout(2_000);
			result.warmupDiagnostics = {
				pageErrors: [...pageErrors],
				consoleMessages: [...consoleMessages],
			};
			pageErrors.length = 0;
			consoleMessages.length = 0;
		}

		await page.goto(result.requestedUrl, { waitUntil: "domcontentloaded", timeout: runTimeout });
		await waitForBootProbe(page, runTimeout);
		await page.waitForTimeout(1_000);

		const snapshot = await collectSnapshot(page);
		result.finalUrl = page.url();
		result.status = validateSnapshot(snapshot, expectedMarketForRoute(route));
		result.milestones = snapshot.milestones;
		result.webSocket = snapshot.webSocket;
		result.crossChecks = snapshot.crossChecks;
		result.navigation = snapshot.navigation;
		result.paint = snapshot.paint;
		result.resources = snapshot.resources;
		result.profiling = snapshot.profiling;
		result.probe = snapshot.probe;
		result.pageErrors = pageErrors;
		result.consoleMessages = consoleMessages;
		if (result.status !== "ok") result.error = describeMissing(snapshot);
	} catch (error) {
		result.finalUrl = page.url();
		result.error = error instanceof Error ? error.message : String(error);
		result.pageErrors = pageErrors;
		result.consoleMessages = consoleMessages;
		result.partial = await collectSnapshot(page).catch(() => null);
	} finally {
		await cdp.detach().catch(() => {});
		await context.close();
	}

	return result;
}

async function configureNetwork(cdp, networkMode, cacheMode) {
	await cdp.send("Network.enable");
	if (cacheMode === "cold") {
		await cdp.send("Network.clearBrowserCache");
		await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
	} else {
		await cdp.send("Network.setCacheDisabled", { cacheDisabled: false });
	}
	if (networkMode === "slow-4g") {
		await cdp.send("Network.emulateNetworkConditions", SLOW_4G);
	} else {
		await cdp.send("Network.emulateNetworkConditions", {
			offline: false,
			latency: 0,
			downloadThroughput: -1,
			uploadThroughput: -1,
			connectionType: "none",
		});
	}
}

async function navigateAndWait(page, url, runTimeout) {
	await page.goto(url, { waitUntil: "domcontentloaded", timeout: runTimeout });
	await waitForBootProbe(page, runTimeout);
}

async function waitForBootProbe(page, runTimeout) {
	const deadline = Date.now() + runTimeout;
	while (Date.now() < deadline) {
		const ready = await page
			.evaluate(() => {
				const probe = window.__gatuBootTiming;
				return Boolean(
					probe?.hydrationCompleteAt &&
						probe?.clientRootModuleCompleteAt &&
						probe?.clientRuntimeReadyCommitAt &&
						probe?.persistedLocaleReadyAt !== null &&
						probe?.profileCommits?.["top-nav"] &&
						probe?.profileCommits?.["main-workspace"] &&
						probe?.webSocket?.firstMarketSubscription,
				);
			})
			.catch(() => false);
		if (ready) return;
		await page.waitForTimeout(50);
	}
	throw new Error(`boot probe timed out after ${runTimeout}ms`);
}

async function collectSnapshot(page) {
	return page.evaluate(() => {
		const round = (value) => (Number.isFinite(value) ? Math.round(value * 100) / 100 : null);
		const navigationEntry = performance.getEntriesByType("navigation")[0];
		const paints = Object.fromEntries(performance.getEntriesByType("paint").map((entry) => [entry.name, entry.startTime]));
		const resources = performance.getEntriesByType("resource");
		const clientRootResource = resources.find((entry) => /\/client-root-[^/]+\.js(?:$|\?)/.test(entry.name));
		const probe = window.__gatuBootTiming ?? {};
		const topNavCommit = probe.profileCommits?.["top-nav"]?.commitTime ?? null;
		const mainWorkspaceCommit = probe.profileCommits?.["main-workspace"]?.commitTime ?? null;
		const renderSnapshot = window.__terminal_render_profile?.() ?? null;

		return {
			milestones: {
				htmlResponseEndMs: round(navigationEntry?.responseEnd),
				firstPaintMs: round(paints["first-paint"]),
				firstContentfulPaintMs: round(paints["first-contentful-paint"]),
				hydrationCompleteMs: round(probe.hydrationCompleteAt),
				clientRootModuleCompleteMs: round(probe.clientRootModuleCompleteAt),
				clientRuntimeReadyMs: round(probe.clientRuntimeReadyCommitAt),
				persistedLocaleReadyMs: round(probe.persistedLocaleReadyAt),
				marketCatalogRouteResolvableMs: round(mainWorkspaceCommit),
				topNavCommitMs: round(topNavCommit),
				mainWorkspaceCommitMs: round(mainWorkspaceCommit),
			},
			webSocket: {
				totalCount: probe.webSocket?.totalCount ?? 0,
				hyperliquidCount: probe.webSocket?.hyperliquidCount ?? 0,
				hyperliquidPeakConcurrentOpen: probe.webSocket?.hyperliquidPeakConcurrentOpen ?? 0,
				urls: [...new Set(probe.webSocket?.urls ?? [])],
				firstConstructMs: round(probe.webSocket?.firstHyperliquidConstructAt),
				firstMarketSubscriptionMs: round(probe.webSocket?.firstMarketSubscription?.at),
				firstMarketSubscription: probe.webSocket?.firstMarketSubscription?.payload ?? null,
			},
			crossChecks: {
				originalSkeletonSeenMs: round(probe.originalSkeletonSeenAt),
				originalSkeletonDetachedMs: round(probe.originalSkeletonDetachedAt),
				clientRuntimeRenderSignalMs: round(probe.clientRuntimeRenderSignalAt),
				topNavDomMs: round(probe.dom?.topNavAt),
				mainWorkspaceDomMs: round(probe.dom?.mainWorkspaceAt),
				measuredGridDomMs: round(probe.dom?.measuredGridAt),
				loadingWorkspaceDomMs: round(probe.dom?.loadingWorkspaceAt),
				loadingWorkspaceRemovedMs: round(probe.dom?.loadingWorkspaceRemovedAt),
				readyWorkspaceWhileLoadingMs: round(probe.dom?.readyWorkspaceWhileLoadingAt),
				clientRootResourceEndMs: round(probe.clientRootResourceEndAt ?? clientRootResource?.responseEnd),
				catalogCacheReadMs: round(probe.catalogCacheReadAt),
			},
			navigation: navigationEntry
				? {
						name: navigationEntry.name,
						type: navigationEntry.type,
						redirectCount: navigationEntry.redirectCount,
						redirectStartMs: round(navigationEntry.redirectStart),
						redirectEndMs: round(navigationEntry.redirectEnd),
						requestStartMs: round(navigationEntry.requestStart),
						responseStartMs: round(navigationEntry.responseStart),
						responseEndMs: round(navigationEntry.responseEnd),
						domInteractiveMs: round(navigationEntry.domInteractive),
						domContentLoadedMs: round(navigationEntry.domContentLoadedEventEnd),
						loadEventEndMs: round(navigationEntry.loadEventEnd),
						transferSize: navigationEntry.transferSize,
						encodedBodySize: navigationEntry.encodedBodySize,
					}
				: null,
			paint: {
				firstPaintMs: round(paints["first-paint"]),
				firstContentfulPaintMs: round(paints["first-contentful-paint"]),
			},
			resources: {
				count: resources.length,
				transferSize: resources.reduce((sum, entry) => sum + (entry.transferSize || 0), 0),
				clientRoot: clientRootResource
					? {
							name: clientRootResource.name,
							startTimeMs: round(clientRootResource.startTime),
							responseEndMs: round(clientRootResource.responseEnd),
							transferSize: clientRootResource.transferSize,
							encodedBodySize: clientRootResource.encodedBodySize,
						}
					: null,
			},
			profiling: {
				enabled: renderSnapshot?.enabled ?? probe.profileEnabled ?? false,
				queryPresentAtInit: probe.profilingQueryPresentAtInit ?? false,
				storageFallbackInstalled: probe.profilingStorageFallbackInstalled ?? false,
				commits: probe.profileCommits ?? {},
			},
			probe: {
				expectedLocale: probe.expectedLocale ?? null,
				expectedMarket: probe.expectedMarket ?? null,
				localeReads: probe.localeReads ?? [],
				reactCommits: probe.reactCommits ?? [],
				skeletonTransitions: probe.skeletonTransitions ?? [],
			},
			diagnostics: {
				htmlLang: document.documentElement.lang,
				bodyText: document.body?.innerText.slice(0, 2_000) ?? "",
				testIds: [...document.querySelectorAll("[data-testid]")]
					.map((element) => element.getAttribute("data-testid"))
					.filter(Boolean)
					.slice(0, 100),
			},
		};
	});
}

function validateSnapshot(snapshot, expectedMarket) {
	const milestones = snapshot.milestones;
	const required = [
		"htmlResponseEndMs",
		"firstPaintMs",
		"firstContentfulPaintMs",
		"hydrationCompleteMs",
		"clientRootModuleCompleteMs",
		"clientRuntimeReadyMs",
		"persistedLocaleReadyMs",
		"marketCatalogRouteResolvableMs",
		"topNavCommitMs",
		"mainWorkspaceCommitMs",
	];
	if (!snapshot.profiling.enabled) return "incomplete";
	if (required.some((key) => !Number.isFinite(milestones[key]))) return "incomplete";
	if (
		snapshot.webSocket.hyperliquidCount !== 1 ||
		snapshot.webSocket.hyperliquidPeakConcurrentOpen !== 1 ||
		!snapshot.webSocket.firstMarketSubscription
	) {
		return "incomplete";
	}
	if (snapshot.webSocket.firstMarketSubscription.subscription?.coin !== expectedMarket) return "incomplete";
	if (
		Number.isFinite(snapshot.crossChecks.loadingWorkspaceDomMs) &&
		!Number.isFinite(snapshot.crossChecks.loadingWorkspaceRemovedMs)
	) {
		return "incomplete";
	}
	if (Number.isFinite(snapshot.crossChecks.readyWorkspaceWhileLoadingMs)) return "incomplete";
	if (snapshot.crossChecks.mainWorkspaceDomMs < snapshot.crossChecks.loadingWorkspaceRemovedMs) return "incomplete";
	return "ok";
}

function describeMissing(snapshot) {
	const missing = Object.entries(snapshot.milestones)
		.filter(([, value]) => !Number.isFinite(value))
		.map(([key]) => key);
	if (!snapshot.profiling.enabled) missing.push("profiling.enabled");
	if (snapshot.webSocket.hyperliquidCount !== 1) {
		missing.push(`webSocket.hyperliquidCount=${snapshot.webSocket.hyperliquidCount} (expected 1)`);
	}
	if (snapshot.webSocket.hyperliquidPeakConcurrentOpen !== 1) {
		missing.push(
			`webSocket.hyperliquidPeakConcurrentOpen=${snapshot.webSocket.hyperliquidPeakConcurrentOpen} (expected 1)`,
		);
	}
	if (!snapshot.webSocket.firstMarketSubscription) missing.push("webSocket.firstMarketSubscription");
	if (
		snapshot.webSocket.firstMarketSubscription &&
		snapshot.webSocket.firstMarketSubscription.subscription?.coin !== snapshot.probe.expectedMarket
	) {
		missing.push(
			`webSocket.firstMarketSubscription.coin=${snapshot.webSocket.firstMarketSubscription.subscription?.coin ?? "null"} (expected ${snapshot.probe.expectedMarket})`,
		);
	}
	if (
		Number.isFinite(snapshot.crossChecks.loadingWorkspaceDomMs) &&
		!Number.isFinite(snapshot.crossChecks.loadingWorkspaceRemovedMs)
	) {
		missing.push("loadingWorkspaceRemovedMs");
	}
	if (Number.isFinite(snapshot.crossChecks.readyWorkspaceWhileLoadingMs)) {
		missing.push(`readyWorkspaceWhileLoadingMs=${snapshot.crossChecks.readyWorkspaceWhileLoadingMs}`);
	}
	if (snapshot.crossChecks.mainWorkspaceDomMs < snapshot.crossChecks.loadingWorkspaceRemovedMs) {
		missing.push("mainWorkspaceDomMs precedes loadingWorkspaceRemovedMs");
	}
	return `missing required measurements: ${missing.join(", ")}`;
}

function buildSummary(allRuns) {
	const groups = new Map();
	for (const run of allRuns) {
		const key = `${run.networkMode}:${run.cacheMode}:${run.route}`;
		const group = groups.get(key) ?? {
			networkMode: run.networkMode,
			cacheMode: run.cacheMode,
			route: run.route,
			runs: [],
		};
		group.runs.push(run);
		groups.set(key, group);
	}

	const metricKeys = [
		"htmlResponseEndMs",
		"firstPaintMs",
		"firstContentfulPaintMs",
		"hydrationCompleteMs",
		"clientRootModuleCompleteMs",
		"clientRuntimeReadyMs",
		"persistedLocaleReadyMs",
		"marketCatalogRouteResolvableMs",
		"topNavCommitMs",
		"mainWorkspaceCommitMs",
	];

	return [...groups.values()].map((group) => {
		const successful = group.runs.filter((run) => run.status === "ok");
		const metrics = Object.fromEntries(
			metricKeys.map((key) => [key, summarizeValues(successful.map((run) => run.milestones?.[key]))]),
		);
		return {
			networkMode: group.networkMode,
			cacheMode: group.cacheMode,
			route: group.route,
			sampleCount: group.runs.length,
			successCount: successful.length,
			metrics,
			webSocket: {
				hyperliquidCount: summarizeValues(successful.map((run) => run.webSocket?.hyperliquidCount)),
				firstMarketSubscriptionMs: summarizeValues(
					successful.map((run) => run.webSocket?.firstMarketSubscriptionMs),
				),
				firstMarketSubscriptionTypes: [
					...new Set(successful.map((run) => run.webSocket?.firstMarketSubscription?.subscription?.type).filter(Boolean)),
				],
			},
			finalUrls: [...new Set(successful.map((run) => run.finalUrl))],
			errors: group.runs.filter((run) => run.status !== "ok").map((run) => run.error),
		};
	});
}

function summarizeValues(values) {
	const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
	if (!sorted.length) return { count: 0, min: null, median: null, max: null };
	return {
		count: sorted.length,
		min: round2(sorted[0]),
		median: round2(percentile(sorted, 0.5)),
		max: round2(sorted[sorted.length - 1]),
	};
}

function percentile(sorted, quantile) {
	if (sorted.length === 1) return sorted[0];
	const index = (sorted.length - 1) * quantile;
	const lower = Math.floor(index);
	const upper = Math.ceil(index);
	if (lower === upper) return sorted[lower];
	return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function printSummary(summary) {
	for (const group of summary) {
		console.log(`\n${group.networkMode} / ${group.cacheMode} / ${group.route} (${group.successCount}/${group.sampleCount})`);
		for (const [key, values] of Object.entries(group.metrics)) {
			console.log(
				`  ${key.padEnd(39)} median=${String(values.median).padStart(8)} ms  min=${values.min}  max=${values.max}`,
			);
		}
		console.log(
			`  ${"hyperliquidWebSockets".padEnd(39)} median=${group.webSocket.hyperliquidCount.median}  first-sub=${group.webSocket.firstMarketSubscriptionMs.median} ms`,
		);
	}
}

async function assertProductionServer(origin) {
	const url = createMeasurementUrl(origin, "/trade/BTC");
	let response;
	try {
		response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(10_000) });
	} catch (error) {
		throw new Error(`production server is not reachable at ${origin}: ${error instanceof Error ? error.message : error}`);
	}
	if (!response.ok) throw new Error(`production preflight ${url} returned HTTP ${response.status}`);
	const html = await response.text();
	if (/\/(?:@vite|@id|src)\//.test(html) || html.includes("/@tanstack-start")) {
		throw new Error(`${origin} is a Vite development server; start the built Nitro output and pass its URL with --url`);
	}
	if (!/\/assets\/[^"']+\.js/.test(html)) {
		throw new Error(`${origin} did not return a recognizable production asset entry`);
	}
	const buildMetaResponse = await fetch(new URL("/build-meta.json", origin), {
		signal: AbortSignal.timeout(10_000),
	});
	if (!buildMetaResponse.ok) {
		throw new Error(`production build metadata returned HTTP ${buildMetaResponse.status}`);
	}
	return buildMetaResponse.json();
}

function createMeasurementUrl(origin, route) {
	const url = new URL(route, `${origin}/`);
	url.searchParams.set("terminal_perf", "1");
	return url.href;
}

function normalizeBaseUrl(value) {
	const url = new URL(String(value));
	if (!/^https?:$/.test(url.protocol)) throw new Error(`url must use http or https: ${value}`);
	return url.origin;
}

function parseList(value, defaults) {
	if (value === undefined) return [...defaults];
	const parsed = String(value)
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);
	if (!parsed.length) throw new Error("list argument must not be empty");
	return parsed;
}

function parseEnumList(value, defaults, allowed, label) {
	const parsed = parseList(value, defaults);
	for (const item of parsed) {
		if (!allowed.has(item)) throw new Error(`${label} must be one of ${[...allowed].join(", ")}; received ${item}`);
	}
	return parsed;
}

function parsePositiveInteger(value, label) {
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${label} must be a positive integer; received ${value}`);
	return parsed;
}

function parseBoolean(value, label) {
	if (typeof value === "boolean") return value;
	const normalized = String(value).trim().toLowerCase();
	if (["1", "true", "yes"].includes(normalized)) return true;
	if (["0", "false", "no"].includes(normalized)) return false;
	throw new Error(`${label} must be true or false; received ${value}`);
}

async function loadRunnerCommon() {
	try {
		return await import("./lib/runner-common.mjs");
	} catch (error) {
		const missingSharedRunner =
			error?.code === "ERR_MODULE_NOT_FOUND" && String(error?.message).includes("runner-common.mjs");
		if (!missingSharedRunner) throw error;

		process.stderr.write(
			"scripts/measure/lib/runner-common.mjs is unavailable; using the boot runner's compatible local fallback\n",
		);
		const require = createRequire(import.meta.url);
		return {
			TARGET_URLS: {
				official: "https://app.hyperliquid.xyz/trade/HYPE",
				local: "http://127.0.0.1:3006/trade/HYPE",
			},
			loadPlaywright() {
				const candidates = [
					"playwright",
					process.env.PLAYWRIGHT_PATH,
				].filter(Boolean);
				for (const id of candidates) {
					try {
						return require(id);
					} catch {}
				}
				throw new Error("playwright not resolvable — set PLAYWRIGHT_PATH to a playwright install");
			},
			parseArgs() {
				return Object.fromEntries(
					process.argv.slice(2).map((argument) => {
						const [key, value] = argument.replace(/^--/, "").split("=");
						return [key, value ?? true];
					}),
				);
			},
			async newDesktopContext(browser, width, height) {
				return browser.newContext({
					viewport: { width, height },
					deviceScaleFactor: 2,
					isMobile: false,
					hasTouch: false,
					locale: "en-US",
				});
			},
		};
	}
}

function sanitizeTag(value) {
	const normalized = String(value)
		.trim()
		.replace(/[^a-zA-Z0-9_-]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return normalized || "baseline";
}

function expectedMarketForRoute(route) {
	if (route === "/") return "BTC";
	const pathname = new URL(route, "http://measurement.invalid").pathname;
	const encodedMarket = pathname.match(/^\/trade\/([^/]+)$/)?.[1];
	if (!encodedMarket) throw new Error(`route must be / or /trade/:market; received ${route}`);
	return decodeURIComponent(encodedMarket);
}

function round2(value) {
	return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

/** Runs in the main page before any application script. */
function installBootProbe({ expectedOrigin, expectedLocale, expectedMarket }) {
	if (window.top !== window || location.origin !== expectedOrigin) return;
	performance.setResourceTimingBufferSize?.(2_000);

	const now = () => performance.now();
	const state = {
		version: 1,
		expectedLocale,
		expectedMarket,
		profilingQueryPresentAtInit: new URLSearchParams(location.search).get("terminal_perf") === "1",
		profilingStorageFallbackInstalled: false,
		profileEnabled: null,
		profileCommits: {},
		hydrationCompleteAt: null,
		clientRootModuleCompleteAt: null,
		clientRootResourceEndAt: null,
		clientRuntimeRenderSignalAt: null,
		clientRuntimeReadyCommitAt: null,
		persistedLocaleReadyAt: null,
		catalogCacheReadAt: null,
		originalSkeletonSeenAt: null,
		originalSkeletonDetachedAt: null,
		localeReads: [],
		reactCommits: [],
		skeletonTransitions: [],
		dom: {
			topNavAt: null,
			mainWorkspaceAt: null,
			measuredGridAt: null,
			loadingWorkspaceAt: null,
			loadingWorkspaceRemovedAt: null,
			readyWorkspaceWhileLoadingAt: null,
		},
		webSocket: {
			totalCount: 0,
			hyperliquidCount: 0,
			hyperliquidOpenCount: 0,
			hyperliquidPeakConcurrentOpen: 0,
			urls: [],
			firstHyperliquidConstructAt: null,
			firstMarketSubscription: null,
		},
	};
	window.__gatuBootTiming = state;

	try {
		localStorage.setItem("terminal-perf-enabled", "1");
		localStorage.setItem("locale-v1", expectedLocale);
		state.profilingStorageFallbackInstalled = true;
	} catch {}

	installReactCommitProbe(state, now);
	installResourceProbe(state);
	installStorageProbe(state, now);
	installWebSocketProbe(state, now);
	installDomProbe(state, now);
	pollRenderProfile(state);

	function installResourceProbe(target) {
		const inspect = (entries) => {
			for (const entry of entries) {
				if (
					target.clientRootResourceEndAt === null &&
					entry.entryType === "resource" &&
					/\/client-root-[^/]+\.js(?:$|\?)/.test(entry.name)
				) {
					target.clientRootResourceEndAt = entry.responseEnd;
				}
			}
		};
		inspect(performance.getEntriesByType("resource"));
		try {
			new PerformanceObserver((list) => inspect(list.getEntries())).observe({ type: "resource", buffered: true });
		} catch {}
	}

	function installReactCommitProbe(target, clock) {
		if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) return;
		let rendererId = 0;
		const renderers = new Map();
		window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
			supportsFiber: true,
			renderers,
			inject(renderer) {
				const id = ++rendererId;
				renderers.set(id, renderer);
				return id;
			},
			onCommitFiberRoot(id, root, priorityLevel, didError) {
				const at = clock();
				target.reactCommits.push({ at, rendererId: id, didError: Boolean(didError), priorityLevel });
				if (target.reactCommits.length > 50) target.reactCommits.shift();
				if (target.hydrationCompleteAt === null && target.originalSkeletonSeenAt !== null) {
					target.hydrationCompleteAt = at;
				}
				if (
					target.clientRuntimeReadyCommitAt === null &&
					target.clientRuntimeRenderSignalAt !== null &&
					at >= target.clientRuntimeRenderSignalAt
				) {
					target.clientRuntimeReadyCommitAt = at;
				}
			},
			onCommitFiberUnmount() {},
			onPostCommitFiberRoot() {},
			checkDCE() {},
		};
	}

	function installStorageProbe(target, clock) {
		const nativeGetItem = Storage.prototype.getItem;
		const nativeRemoveItem = Storage.prototype.removeItem;

		Storage.prototype.getItem = function getItem(key) {
			const value = nativeGetItem.call(this, key);
			const at = clock();
			if (key === "locale-v1") {
				target.localeReads.push({ at, value });
				if (target.localeReads.length > 20) target.localeReads.shift();
				if (target.clientRootModuleCompleteAt !== null && target.clientRuntimeRenderSignalAt === null) {
					target.clientRuntimeRenderSignalAt = at;
				}
			}
			if (key === "hl-rq-cache-v1" && target.catalogCacheReadAt === null) target.catalogCacheReadAt = at;
			return value;
		};

		Storage.prototype.removeItem = function removeItem(key) {
			try {
				return nativeRemoveItem.call(this, key);
			} finally {
				if (key === "hl-markets-meta-v1" && target.clientRootModuleCompleteAt === null) {
					target.clientRootModuleCompleteAt = clock();
				}
			}
		};
	}

	function installWebSocketProbe(target, clock) {
		const NativeWebSocket = window.WebSocket;
		const hyperliquidSockets = new WeakSet();
		const isHyperliquidSocket = (value) => {
			try {
				const url = new URL(String(value));
				return url.protocol === "wss:" && /hyperliquid[^.]*\.xyz$/i.test(url.hostname) && url.pathname === "/ws";
			} catch {
				return false;
			}
		};
		const sanitizeUrl = (value) => {
			try {
				const url = new URL(String(value));
				return `${url.protocol}//${url.host}${url.pathname}`;
			} catch {
				return String(value);
			}
		};

		window.WebSocket = class InstrumentedWebSocket extends NativeWebSocket {
			constructor(...constructorArgs) {
				super(...constructorArgs);
				const at = clock();
				const url = sanitizeUrl(constructorArgs[0]);
				const isHyperliquid = isHyperliquidSocket(constructorArgs[0]);
				target.webSocket.totalCount += 1;
				target.webSocket.urls.push(url);
				if (isHyperliquid) {
					hyperliquidSockets.add(this);
					target.webSocket.hyperliquidCount += 1;
					if (target.webSocket.firstHyperliquidConstructAt === null) {
						target.webSocket.firstHyperliquidConstructAt = at;
					}
					this.addEventListener("open", () => {
						target.webSocket.hyperliquidOpenCount += 1;
						target.webSocket.hyperliquidPeakConcurrentOpen = Math.max(
							target.webSocket.hyperliquidPeakConcurrentOpen,
							target.webSocket.hyperliquidOpenCount,
						);
					});
					this.addEventListener("close", () => {
						target.webSocket.hyperliquidOpenCount = Math.max(0, target.webSocket.hyperliquidOpenCount - 1);
					});
				}
			}

			send(data) {
				try {
					const payload = typeof data === "string" ? JSON.parse(data) : null;
					const subscription = payload?.subscription;
					if (
						hyperliquidSockets.has(this) &&
						target.webSocket.firstMarketSubscription === null &&
						payload?.method === "subscribe" &&
						typeof subscription?.coin === "string"
					) {
						target.webSocket.firstMarketSubscription = {
							at: clock(),
							payload: {
								method: "subscribe",
								subscription: {
									type: subscription.type ?? null,
									coin: subscription.coin,
									...(subscription.interval ? { interval: subscription.interval } : {}),
								},
							},
						};
					}
				} catch {}
				return super.send(data);
			}
		};
	}

	function installDomProbe(target, clock) {
		let originalSkeleton = null;
		let previousSkeleton = null;
		let loadingWorkspace = null;

		const inspect = () => {
			const at = clock();
			const skeleton = document.querySelector('[data-testid="startup-fallback"]');
			if (!originalSkeleton && skeleton) {
				originalSkeleton = skeleton;
				previousSkeleton = skeleton;
				target.originalSkeletonSeenAt = at;
			}
			if (originalSkeleton && !originalSkeleton.isConnected && target.originalSkeletonDetachedAt === null) {
				target.originalSkeletonDetachedAt = at;
			}
			if (skeleton !== previousSkeleton) {
				target.skeletonTransitions.push({ at, kind: skeleton ? "replaced" : "removed" });
				previousSkeleton = skeleton;
			}
			if (target.persistedLocaleReadyAt === null && document.documentElement?.lang === expectedLocale) {
				target.persistedLocaleReadyAt = at;
			}
			if (target.dom.topNavAt === null && document.querySelector("header a[data-brand-home-link]")) {
				target.dom.topNavAt = at;
			}
			const currentLoadingWorkspace = document.querySelector('main[aria-busy="true"]');
			if (!loadingWorkspace && currentLoadingWorkspace) {
				loadingWorkspace = currentLoadingWorkspace;
				target.dom.loadingWorkspaceAt = at;
			}
			if (
				loadingWorkspace &&
				!loadingWorkspace.isConnected &&
				target.dom.loadingWorkspaceRemovedAt === null
			) {
				target.dom.loadingWorkspaceRemovedAt = at;
			}
			const mainWorkspace = document.querySelector("[data-main-workspace]");
			if (
				mainWorkspace &&
				currentLoadingWorkspace &&
				target.dom.readyWorkspaceWhileLoadingAt === null
			) {
				target.dom.readyWorkspaceWhileLoadingAt = at;
			}
			if (target.dom.mainWorkspaceAt === null && mainWorkspace) {
				target.dom.mainWorkspaceAt = at;
			}
			if (target.dom.measuredGridAt === null && document.querySelector(".desktop-terminal-grid")) {
				target.dom.measuredGridAt = at;
			}
		};

		new MutationObserver(inspect).observe(document, {
			subtree: true,
			childList: true,
			attributes: true,
			attributeFilter: ["lang", "dir"],
		});
		inspect();
	}

	function pollRenderProfile(target) {
		const poll = () => {
			try {
				const snapshot = window.__terminal_render_profile?.();
				if (snapshot) {
					target.profileEnabled = snapshot.enabled;
					for (const id of ["top-nav", "main-workspace"]) {
						if (target.profileCommits[id]) continue;
						const first = snapshot.tracks?.[id]?.recent?.[0];
						if (first) {
							target.profileCommits[id] = {
								commitTime: first.commitTime,
								phase: first.phase,
								source: first.source,
							};
						}
					}
				}
			} catch {}
			if (target.profileCommits["top-nav"] && target.profileCommits["main-workspace"]) return;
			requestAnimationFrame(poll);
		};
		requestAnimationFrame(poll);
	}
}
