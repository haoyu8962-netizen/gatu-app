/**
 * Records a diagnostic CPU profile for hydration -> ClientRuntime ready on a production normal /
 * cold-cache navigation. Profiling is started and stopped by a Playwright-only React commit hook,
 * so no probe enters the application bundle.
 *
 * Run an analyze build first if source-level attribution is required; when adjacent .map files are
 * absent, the report explicitly falls back to chunk-level categories.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(HERE, "../..");
const DEFAULT_ASSET_DIR = resolve(REPOSITORY_ROOT, "apps/terminal/.output/public/assets");
const OUT = resolve(HERE, "out");
const VIEWPORT = { width: 1440, height: 900 };
const DEFAULT_ROUTE = "/trade/xyz%3ACXMT";
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_SAMPLING_INTERVAL_US = 500;
const DEFAULT_LOCALE = "zh";

const args = parseArgs();
const baseUrl = normalizeBaseUrl(args.url ?? "http://127.0.0.1:3017");
const route = normalizeRoute(args.route ?? DEFAULT_ROUTE);
const expectedLocale = String(args.locale ?? DEFAULT_LOCALE).trim();
const timeoutMs = parsePositiveInteger(args.timeout ?? DEFAULT_TIMEOUT_MS, "timeout");
const samplingIntervalUs = parsePositiveInteger(
	args.samplingInterval ?? DEFAULT_SAMPLING_INTERVAL_US,
	"samplingInterval",
);
const headless = !parseBoolean(args.headed ?? false, "headed");
const tag = sanitizeTag(args.tag ?? "client-root-activation");
const assetDir = resolve(String(args.assets ?? DEFAULT_ASSET_DIR));
const requestedUrl = createMeasurementUrl(baseUrl, route);
const profileTitle = `gatu-client-root-activation-${tag}`;
const outputFile = resolve(OUT, `client-root-activation-${tag}.json`);
const profileFile = resolve(OUT, `client-root-activation-${tag}.cpuprofile`);

if (!expectedLocale) throw new Error("locale must not be empty");

const buildMeta = await assertProductionServer(baseUrl);
const sourceMapResolver = createSourceMapResolver(assetDir);
const { chromium } = loadPlaywright();
const browser = await chromium.launch({ headless });
const browserVersion = browser.version();
const context = await browser.newContext({
	viewport: VIEWPORT,
	deviceScaleFactor: 2,
	isMobile: false,
	hasTouch: false,
	locale: "en-US",
});
await context.addInitScript(installActivationProbe, {
	expectedOrigin: baseUrl,
	expectedLocale,
	profileTitle,
});
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
const pageErrors = [];
const consoleMessages = [];
let completedProfileEvent = null;
let profileEventResolve;
const profileEventPromise = new Promise((resolveProfile) => {
	profileEventResolve = resolveProfile;
});

page.on("pageerror", (error) => pageErrors.push(String(error?.message ?? error).slice(0, 1_000)));
page.on("console", (message) => {
	if (message.type() === "error" || message.type() === "warning") {
		consoleMessages.push({ type: message.type(), text: message.text().slice(0, 1_000) });
	}
});
cdp.on("Profiler.consoleProfileFinished", (event) => {
	if (event.title !== profileTitle || completedProfileEvent) return;
	completedProfileEvent = event;
	profileEventResolve(event);
});

let snapshot = null;
let runError = null;

try {
	await configureNormalCold(cdp);
	await cdp.send("Profiler.enable");
	await cdp.send("Profiler.setSamplingInterval", { interval: samplingIntervalUs });
	await page.goto(requestedUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
	await waitForActivationProbe(page, timeoutMs);
	await withTimeout(profileEventPromise, timeoutMs, "CPU profile event");
	snapshot = await collectProbeSnapshot(page);
} catch (error) {
	runError = error instanceof Error ? error.message : String(error);
	snapshot = await collectProbeSnapshot(page).catch(() => null);
	if (snapshot?.probe?.cpuProfileOpen) {
		await page.evaluate((title) => console.profileEnd(title), profileTitle).catch(() => {});
		await Promise.race([
			profileEventPromise,
			new Promise((resolveTimeout) => setTimeout(resolveTimeout, 1_000)),
		]).catch(() => {});
	}
} finally {
	await cdp.send("Profiler.disable").catch(() => {});
	await cdp.detach().catch(() => {});
	await context.close();
	await browser.close();
}

mkdirSync(OUT, { recursive: true });
const cpuProfile = completedProfileEvent?.profile ?? null;
if (cpuProfile) writeFileSync(profileFile, `${JSON.stringify(cpuProfile)}\n`);
const analysis = analyzeCpuProfile(cpuProfile, sourceMapResolver);
const probe = snapshot?.probe ?? null;
const milestones = {
	hydrationCompleteMs: finiteOrNull(probe?.hydrationCompleteAt),
	clientRootModuleCompleteMs: finiteOrNull(probe?.clientRootModuleCompleteAt),
	clientRuntimeRenderSignalMs: finiteOrNull(probe?.clientRuntimeRenderSignalAt),
	clientRuntimeReadyMs: finiteOrNull(probe?.clientRuntimeReadyAt),
};
const windowMs = difference(milestones.clientRuntimeReadyMs, milestones.hydrationCompleteMs);
const profileWallMs = cpuProfile ? round2((cpuProfile.endTime - cpuProfile.startTime) / 1_000) : null;
const assertions = {
	profileCaptured: Boolean(cpuProfile),
	hydrationObserved: Number.isFinite(milestones.hydrationCompleteMs),
	clientRuntimeReadyObserved: Number.isFinite(milestones.clientRuntimeReadyMs),
	profileWindowMatchesCommits:
		Number.isFinite(windowMs) && Number.isFinite(profileWallMs) && Math.abs(windowMs - profileWallMs) <= 50,
	profileStartedAndClosedByProbe: probe?.cpuProfileStarted === true && probe?.cpuProfileOpen === false,
	noPageErrors: pageErrors.length === 0,
	noConsoleErrorsOrWarnings: consoleMessages.length === 0,
};
const status = runError === null && Object.values(assertions).every(Boolean) ? "ok" : "incomplete";
const payload = {
	schemaVersion: 1,
	kind: "client-root-normal-cold-activation-cpu-profile",
	generatedAt: new Date().toISOString(),
	status,
	error: runError,
	config: {
		baseUrl,
		route,
		requestedUrl,
		cacheMode: "cold",
		networkMode: "normal",
		expectedLocale,
		viewport: { ...VIEWPORT, deviceScaleFactor: 2 },
		timeoutMs,
		samplingIntervalUs,
		assetDir,
	},
	environment: {
		node: process.version,
		browser: `Chromium ${browserVersion}`,
		buildMeta,
	},
	definitions: {
		profileWindow:
			"console.profile starts in the first hydration commit callback and ends in the first commit after ClientRuntime's locale-read render signal",
		selfTime:
			"Each V8 sample timeDelta is attributed to its leaf ProfileNode; categories are mutually exclusive",
		mappedSource:
			"Original source resolved from an adjacent production source map; missing maps use an explicit chunk-level fallback",
	},
	milestones,
	intervals: {
		hydrationToClientRuntimeMs: windowMs,
		clientRootModuleRelativeToHydrationMs: difference(
			milestones.clientRootModuleCompleteMs,
			milestones.hydrationCompleteMs,
		),
		clientRootModuleToClientRuntimeMs: difference(
			milestones.clientRuntimeReadyMs,
			milestones.clientRootModuleCompleteMs,
		),
		profileWallMs,
		profileSampledMs: analysis.sampledMs,
	},
	attribution: analysis,
	profile: {
		file: cpuProfile ? profileFile : null,
		title: completedProfileEvent?.title ?? null,
		startTimeUs: cpuProfile?.startTime ?? null,
		endTimeUs: cpuProfile?.endTime ?? null,
		nodeCount: cpuProfile?.nodes?.length ?? 0,
		sampleCount: cpuProfile?.samples?.length ?? 0,
	},
	probe,
	assertions,
	pageErrors,
	consoleMessages,
};

writeFileSync(outputFile, `${JSON.stringify(payload, null, 2)}\n`);
printSummary(payload);
process.stderr.write(`wrote ${outputFile}\n`);
if (cpuProfile) process.stderr.write(`wrote ${profileFile}\n`);
if (status !== "ok") process.exitCode = 1;

async function configureNormalCold(session) {
	await session.send("Network.enable");
	await session.send("Network.clearBrowserCache");
	await session.send("Network.setCacheDisabled", { cacheDisabled: true });
	await session.send("Network.emulateNetworkConditions", {
		offline: false,
		latency: 0,
		downloadThroughput: -1,
		uploadThroughput: -1,
		connectionType: "none",
	});
}

async function waitForActivationProbe(pageInstance, runTimeoutMs) {
	const deadline = Date.now() + runTimeoutMs;
	while (Date.now() < deadline) {
		const complete = await pageInstance
			.evaluate(() => {
				const probe = window.__gatuClientRootActivation;
				return Boolean(
					probe?.hydrationCompleteAt !== null &&
						probe?.clientRuntimeReadyAt !== null &&
						probe?.cpuProfileStarted === true &&
						probe?.cpuProfileOpen === false,
				);
			})
			.catch(() => false);
		if (complete) return;
		await pageInstance.waitForTimeout(25);
	}
	throw new Error(`activation probe timed out after ${runTimeoutMs}ms`);
}

async function collectProbeSnapshot(pageInstance) {
	return pageInstance.evaluate(() => ({
		probe: window.__gatuClientRootActivation ?? null,
		navigation: (() => {
			const entry = performance.getEntriesByType("navigation")[0];
			return entry
				? {
						name: entry.name,
						responseEndMs: entry.responseEnd,
						domContentLoadedMs: entry.domContentLoadedEventEnd,
					}
				: null;
		})(),
	}));
}

function analyzeCpuProfile(profile, sourceMapResolver) {
	const empty = {
		sampledMs: null,
		probeAdjustedSampledMs: null,
		activeSampledMs: null,
		applicationActiveSampledMs: null,
		idleMs: null,
		idlePercent: null,
		idlePercentExcludingProbe: null,
		probeOverheadMs: null,
		mappedActiveMs: null,
		mappedActivePercent: null,
		dominantCategory: "unknown",
		dominantRationale: "profile was not captured",
		categories: [],
		topFunctions: [],
	};
	if (!profile?.nodes?.length || !profile?.samples?.length || !profile?.timeDeltas?.length) return empty;

	const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
	const categoryTotals = new Map();
	const functionTotals = new Map();
	let sampledMs = 0;
	let idleMs = 0;
	let probeOverheadMs = 0;
	let mappedActiveMs = 0;
	const count = Math.min(profile.samples.length, profile.timeDeltas.length);

	for (let index = 0; index < count; index++) {
		const deltaMs = profile.timeDeltas[index] / 1_000;
		if (!Number.isFinite(deltaMs) || deltaMs < 0) continue;
		const node = nodes.get(profile.samples[index]);
		if (!node) continue;
		const frame = node.callFrame ?? {};
		const mapped = sourceMapResolver(frame);
		const classification = classifyFrame(frame, mapped);
		sampledMs += deltaMs;
		if (classification.category === "idle") idleMs += deltaMs;
		if (classification.category === "measurement-probe-overhead") probeOverheadMs += deltaMs;
		if (classification.applicationActive && mapped?.source) mappedActiveMs += deltaMs;
		categoryTotals.set(classification.category, (categoryTotals.get(classification.category) ?? 0) + deltaMs);
		const functionKey = JSON.stringify({
			category: classification.category,
			functionName: mapped?.name || frame.functionName || "(anonymous)",
			source: mapped?.source ?? frame.url ?? null,
			line: mapped?.line ?? (Number.isFinite(frame.lineNumber) ? frame.lineNumber + 1 : null),
		});
		functionTotals.set(functionKey, (functionTotals.get(functionKey) ?? 0) + deltaMs);
	}

	const activeSampledMs = Math.max(0, sampledMs - idleMs);
	const applicationActiveSampledMs = Math.max(0, activeSampledMs - probeOverheadMs);
	const probeAdjustedSampledMs = Math.max(0, sampledMs - probeOverheadMs);
	const categories = [...categoryTotals.entries()]
		.map(([category, milliseconds]) => ({
			category,
			selfTimeMs: round2(milliseconds),
			profilePercent: percent(milliseconds, sampledMs),
			activePercent:
				category === "idle" || category === "measurement-probe-overhead"
					? null
					: percent(milliseconds, applicationActiveSampledMs),
		}))
		.sort((left, right) => right.selfTimeMs - left.selfTimeMs);
	const topFunctions = [...functionTotals.entries()]
		.map(([key, milliseconds]) => ({ ...JSON.parse(key), selfTimeMs: round2(milliseconds) }))
		.sort((left, right) => right.selfTimeMs - left.selfTimeMs)
		.slice(0, 30);
	const idlePercent = percent(idleMs, sampledMs);
	const idlePercentExcludingProbe = percent(idleMs, probeAdjustedSampledMs);
	const dominantActive = categories.find(
		(entry) => entry.category !== "idle" && entry.category !== "measurement-probe-overhead",
	);
	const dominant =
		Number.isFinite(idlePercentExcludingProbe) && idlePercentExcludingProbe >= 50
			? {
					dominantCategory: "scheduler-or-async-wait",
					dominantRationale: `${idlePercentExcludingProbe}% of probe-adjusted hydration-to-runtime samples are V8 idle`,
				}
			: {
					dominantCategory: dominantActive?.category ?? "unknown",
					dominantRationale: dominantActive
						? `${dominantActive.category} has the largest non-idle self-time sample (${dominantActive.selfTimeMs} ms)`
						: "no active samples were attributed",
				};

	return {
		sampledMs: round2(sampledMs),
		probeAdjustedSampledMs: round2(probeAdjustedSampledMs),
		activeSampledMs: round2(activeSampledMs),
		applicationActiveSampledMs: round2(applicationActiveSampledMs),
		idleMs: round2(idleMs),
		idlePercent,
		idlePercentExcludingProbe,
		probeOverheadMs: round2(probeOverheadMs),
		mappedActiveMs: round2(mappedActiveMs),
		mappedActivePercent: percent(mappedActiveMs, applicationActiveSampledMs),
		...dominant,
		categories,
		topFunctions,
	};
}

function createSourceMapResolver(directory) {
	let traceMapping = null;
	try {
		const require = createRequire(import.meta.url);
		const vitePackage = require.resolve("vite/package.json", {
			paths: [resolve(REPOSITORY_ROOT, "apps/terminal")],
		});
		const traceMappingPath = require.resolve("@jridgewell/trace-mapping", {
			paths: [dirname(vitePackage)],
		});
		traceMapping = require(traceMappingPath);
	} catch {}

	const maps = new Map();
	return (frame) => {
		if (
			!traceMapping ||
			!frame?.url ||
			!Number.isFinite(frame.lineNumber) ||
			frame.lineNumber < 0
		) {
			return null;
		}
		const file = safeAssetBasename(frame.url);
		if (!file) return null;
		let map = maps.get(file);
		if (map === undefined) {
			try {
				map = new traceMapping.TraceMap(JSON.parse(readFileSync(resolve(directory, `${file}.map`), "utf8")));
			} catch {
				map = null;
			}
			maps.set(file, map);
		}
		if (!map) return null;
		const position = traceMapping.originalPositionFor(map, {
			line: frame.lineNumber + 1,
			column: Math.max(0, frame.columnNumber ?? 0),
		});
		if (!position?.source) return null;
		return {
			source: normalizeSource(position.source),
			line: position.line,
			column: position.column,
			name: position.name,
		};
	};
}

function classifyFrame(frame, mapped) {
	const functionName = String(mapped?.name || frame.functionName || "");
	const source = String(mapped?.source || "").toLowerCase();
	const file = String(safeAssetBasename(frame.url) ?? "").toLowerCase();
	if (functionName === "(idle)") return { category: "idle", applicationActive: false };
	if (!mapped?.source && functionName === "onCommitFiberRoot") {
		return { category: "measurement-probe-overhead", applicationActive: false };
	}
	if (functionName === "(garbage collector)") {
		return { category: "garbage-collector", applicationActive: true };
	}
	if (functionName === "(program)" || functionName === "(root)") {
		return { category: "v8-program-or-root", applicationActive: true };
	}

	if (source) {
		if (source.includes("@privy-io/react-auth") && source.includes("smart-wallet")) {
			return { category: "privy-smart-wallets", applicationActive: true };
		}
		if (source.includes("@privy-io/react-auth") || source.includes("@privy-io/js-sdk-core")) {
			return { category: "privy-react-auth", applicationActive: true };
		}
		if (source.includes("@privy-io/wagmi") || source.includes("@wagmi/") || packagePathMatches(source, "wagmi")) {
			return { category: "wagmi", applicationActive: true };
		}
		if (
			source.includes("query-persist-client") ||
			source.includes("query-sync-storage-persister") ||
			source.includes("query-persistence")
		) {
			return { category: "persist-query", applicationActive: true };
		}
		if (source.includes("@walletconnect/")) return { category: "walletconnect", applicationActive: true };
		if (isCryptoSource(source)) return { category: "crypto", applicationActive: true };
		if (
			source.includes("packages/hl-react/") ||
			source.includes("@nktkas/hyperliquid") ||
			source.includes("lib/hyperliquid/markets")
		) {
			return { category: "hyperliquid-and-markets", applicationActive: true };
		}
		if (packagePathMatches(source, "react-dom") || packagePathMatches(source, "react")) {
			return { category: "react-reconciliation", applicationActive: true };
		}
		if (source.includes("src/providers/client-root")) {
			return { category: "client-root-provider-orchestration", applicationActive: true };
		}
		if (source.includes("node_modules/@tanstack/")) {
			return { category: "tanstack-other", applicationActive: true };
		}
		if (source.includes("apps/terminal/src/")) {
			return { category: "terminal-application", applicationActive: true };
		}
		return { category: "mapped-other", applicationActive: true };
	}

	if (file.startsWith("client-root-")) {
		return { category: "client-root-provider-orchestration-unmapped", applicationActive: true };
	}
	if (file.startsWith("wagmi-")) return { category: "wagmi-unmapped", applicationActive: true };
	if (file.startsWith("vendor-tanstack-query-")) {
		return { category: "tanstack-query-or-persist-unmapped", applicationActive: true };
	}
	if (
		file.startsWith("pwa-install-") ||
		file.startsWith("use-email-embedded-wallet-") ||
		file.startsWith("bundler-")
	) {
		return { category: "shared-wallet-runtime-unmapped", applicationActive: true };
	}
	if (file.startsWith("vendor-base-ui-")) {
		return { category: "react-ui-runtime-unmapped", applicationActive: true };
	}
	if (file) return { category: `unmapped-chunk:${file}`, applicationActive: true };
	return { category: "unmapped-anonymous", applicationActive: true };
}

function packagePathMatches(source, packageName) {
	return source.includes(`/node_modules/${packageName}/`) || source.includes(`/node_modules/.pnpm/${packageName}@`);
}

function isCryptoSource(source) {
	return [
		"@noble/",
		"@scure/",
		"ethereum-cryptography",
		"@ecies/ciphers",
		"@privy-io/encoding",
		"/ox/crypto",
		"/viem/utils/hash",
	].some((pattern) => source.includes(pattern));
}

function normalizeSource(value) {
	return String(value).replaceAll("\\", "/").replace(/^\u0000/, "");
}

function printSummary(payload) {
	console.log(`status: ${payload.status}`);
	console.log(`hydration -> ClientRuntime: ${payload.intervals.hydrationToClientRuntimeMs} ms`);
	console.log(`profile wall: ${payload.intervals.profileWallMs} ms`);
	console.log(`sampled: ${payload.attribution.sampledMs} ms`);
	console.log(`probe overhead: ${payload.attribution.probeOverheadMs} ms`);
	console.log(`probe-adjusted sampled: ${payload.attribution.probeAdjustedSampledMs} ms`);
	console.log(`idle excluding probe: ${payload.attribution.idlePercentExcludingProbe}%`);
	console.log(`application active: ${payload.attribution.applicationActiveSampledMs} ms`);
	console.log(`mapped active samples: ${payload.attribution.mappedActivePercent}%`);
	console.log(`dominant category: ${payload.attribution.dominantCategory}`);
}

async function assertProductionServer(origin) {
	const url = createMeasurementUrl(origin, DEFAULT_ROUTE);
	const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(10_000) });
	if (!response.ok) throw new Error(`production preflight ${url} returned HTTP ${response.status}`);
	const html = await response.text();
	if (/\/(?:@vite|@id|src)\//.test(html) || html.includes("/@tanstack-start")) {
		throw new Error(`${origin} is a Vite development server; run the built Nitro output`);
	}
	if (!/\/assets\/[^"']+\.js/.test(html)) throw new Error(`${origin} is not a recognizable production build`);
	const metaResponse = await fetch(new URL("/build-meta.json", origin), {
		signal: AbortSignal.timeout(10_000),
	});
	if (!metaResponse.ok) throw new Error(`build metadata returned HTTP ${metaResponse.status}`);
	return metaResponse.json();
}

function createMeasurementUrl(origin, pathname) {
	const url = new URL(pathname, `${origin}/`);
	url.searchParams.set("terminal_perf", "1");
	return url.href;
}

function normalizeBaseUrl(value) {
	const url = new URL(String(value));
	if (!/^https?:$/.test(url.protocol)) throw new Error("url must use http or https");
	return url.origin;
}

function normalizeRoute(value) {
	const routeUrl = new URL(String(value), "http://measurement.invalid");
	return `${routeUrl.pathname}${routeUrl.search}`;
}

function parseArgs() {
	return Object.fromEntries(
		process.argv.slice(2).map((argument) => {
			const [key, value] = argument.replace(/^--/, "").split("=");
			return [key, value ?? true];
		}),
	);
}

function parsePositiveInteger(value, label) {
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${label} must be a positive integer`);
	return parsed;
}

function parseBoolean(value, label) {
	if (typeof value === "boolean") return value;
	const normalized = String(value).trim().toLowerCase();
	if (["1", "true", "yes"].includes(normalized)) return true;
	if (["0", "false", "no"].includes(normalized)) return false;
	throw new Error(`${label} must be true or false`);
}

function sanitizeTag(value) {
	return (
		String(value)
			.trim()
			.replace(/[^a-zA-Z0-9_-]+/g, "-")
			.replace(/^-+|-+$/g, "") || "client-root-activation"
	);
}

function loadPlaywright() {
	const require = createRequire(import.meta.url);
	const candidates = [
		"playwright",
		process.env.PLAYWRIGHT_PATH,
		"/Users/zhixing/.nvm/versions/node/v22.18.0/lib/node_modules/playwright",
		"/Users/zhixing/.nvm/versions/node/v24.15.0/lib/node_modules/playwright",
	].filter(Boolean);
	for (const candidate of candidates) {
		try {
			return require(candidate);
		} catch {}
	}
	throw new Error("playwright not resolvable; set PLAYWRIGHT_PATH");
}

function safeAssetBasename(value) {
	if (!value) return null;
	try {
		return basename(new URL(String(value)).pathname) || null;
	} catch {
		return null;
	}
}

function difference(end, start) {
	return Number.isFinite(end) && Number.isFinite(start) ? round2(end - start) : null;
}

function finiteOrNull(value) {
	return Number.isFinite(value) ? round2(value) : null;
}

function percent(value, total) {
	return Number.isFinite(value) && Number.isFinite(total) && total > 0 ? round2((value / total) * 100) : null;
}

function round2(value) {
	return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

async function withTimeout(promise, timeout, label) {
	let timeoutId;
	try {
		return await Promise.race([
			promise,
			new Promise((_, reject) => {
				timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${timeout}ms`)), timeout);
			}),
		]);
	} finally {
		clearTimeout(timeoutId);
	}
}

/** Runs in the main frame before application code. */
function installActivationProbe({ expectedOrigin, expectedLocale, profileTitle }) {
	if (window.top !== window || location.origin !== expectedOrigin) return;
	const now = () => performance.now();
	const mark = (name) => {
		try {
			performance.mark(name);
		} catch {}
	};
	const state = {
		version: 1,
		hydrationCompleteAt: null,
		clientRootModuleCompleteAt: null,
		clientRuntimeRenderSignalAt: null,
		clientRuntimeReadyAt: null,
		originalSkeletonSeenAt: null,
		cpuProfileStarted: false,
		cpuProfileOpen: false,
		persistedQueryReads: [],
	};
	window.__gatuClientRootActivation = state;
	try {
		localStorage.setItem("terminal-perf-enabled", "1");
		localStorage.setItem("locale-v1", expectedLocale);
	} catch {}

	installReactProbe();
	installStorageProbe();
	installDomProbe();

	function installReactProbe() {
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
			onCommitFiberRoot() {
				const at = now();
				if (state.hydrationCompleteAt === null && state.originalSkeletonSeenAt !== null) {
					state.hydrationCompleteAt = at;
					state.cpuProfileStarted = true;
					state.cpuProfileOpen = true;
					mark("gatu:activation-profile-start");
					console.profile(profileTitle);
				}
				if (
					state.clientRuntimeReadyAt === null &&
					state.clientRuntimeRenderSignalAt !== null &&
					at >= state.clientRuntimeRenderSignalAt
				) {
					state.clientRuntimeReadyAt = at;
					mark("gatu:activation-profile-end");
					if (state.cpuProfileOpen) {
						state.cpuProfileOpen = false;
						console.profileEnd(profileTitle);
					}
				}
			},
			onCommitFiberUnmount() {},
			onPostCommitFiberRoot() {},
			checkDCE() {},
		};
	}

	function installStorageProbe() {
		const nativeGetItem = Storage.prototype.getItem;
		const nativeRemoveItem = Storage.prototype.removeItem;
		Storage.prototype.getItem = function getItem(key) {
			const startedAt = now();
			const value = nativeGetItem.call(this, key);
			const finishedAt = now();
			if (key === "hl-rq-cache-v1") {
				state.persistedQueryReads.push({ at: startedAt, durationMs: finishedAt - startedAt, length: value?.length ?? 0 });
			}
			if (
				key === "locale-v1" &&
				state.clientRootModuleCompleteAt !== null &&
				state.clientRuntimeRenderSignalAt === null
			) {
				state.clientRuntimeRenderSignalAt = finishedAt;
			}
			return value;
		};
		Storage.prototype.removeItem = function removeItem(key) {
			try {
				return nativeRemoveItem.call(this, key);
			} finally {
				if (key === "hl-markets-meta-v1" && state.clientRootModuleCompleteAt === null) {
					state.clientRootModuleCompleteAt = now();
				}
			}
		};
	}

	function installDomProbe() {
		const inspect = () => {
			if (state.originalSkeletonSeenAt !== null) return;
			if (document.querySelector('[data-testid="app-shell-fallback"]')) {
				state.originalSkeletonSeenAt = now();
			}
		};
		new MutationObserver(inspect).observe(document, { subtree: true, childList: true });
		inspect();
	}
}
