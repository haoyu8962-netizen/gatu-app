/**
 * Captures one production Slow 4G / cold-cache client-root dependency waterfall.
 *
 * The probe is installed by Playwright and never enters the application bundle. The server must
 * already be serving apps/terminal/.output. Example:
 *
 *   PORT=3017 pnpm serve
 *   node scripts/measure/capture-client-root-waterfall.mjs \
 *     --url=http://127.0.0.1:3017 --tag=phase1-clean
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(HERE, "../..");
const DEFAULT_ASSET_DIR = resolve(REPOSITORY_ROOT, "apps/terminal/.output/public/assets");
const OUT = resolve(HERE, "out");
const VIEWPORT = { width: 1440, height: 900 };
const SLOW_4G = {
	offline: false,
	latency: 150,
	downloadThroughput: 1_600_000 / 8,
	uploadThroughput: 750_000 / 8,
	connectionType: "cellular4g",
};
const TRACE_CATEGORIES = [
	"devtools.timeline",
	"disabled-by-default-devtools.timeline",
	"blink.user_timing",
	"v8",
	"loading",
];
const DEFAULT_ROUTE = "/trade/xyz%3ACXMT";
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_LOCALE = "zh";

const args = parseArgs();
const baseUrl = normalizeBaseUrl(args.url ?? "http://127.0.0.1:3017");
const route = normalizeRoute(args.route ?? DEFAULT_ROUTE);
const expectedMarket = expectedMarketForRoute(route);
const expectedLocale = String(args.locale ?? DEFAULT_LOCALE).trim();
const timeoutMs = parsePositiveInteger(args.timeout ?? DEFAULT_TIMEOUT_MS, "timeout");
const headless = !parseBoolean(args.headed ?? false, "headed");
const tag = sanitizeTag(args.tag ?? "client-root-waterfall");
const assetDir = resolve(String(args.assets ?? DEFAULT_ASSET_DIR));
const requestedUrl = createMeasurementUrl(baseUrl, route);
const outputFile = resolve(OUT, `client-root-waterfall-${tag}.json`);
const traceFile = resolve(OUT, `client-root-waterfall-${tag}.trace.json.gz`);

if (!expectedLocale) throw new Error("locale must not be empty");

const buildMeta = await assertProductionServer(baseUrl);
const staticClosure = buildStaticChunkClosure(assetDir);
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
await context.addInitScript(installWaterfallProbe, {
	expectedOrigin: baseUrl,
	expectedLocale,
	expectedMarket,
});
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
const pageErrors = [];
const consoleMessages = [];
const networkRequests = new Map();
let traceStarted = false;
let traceResult = null;

page.on("pageerror", (error) => pageErrors.push(String(error?.message ?? error).slice(0, 1_000)));
page.on("console", (message) => {
	if (message.type() === "error" || message.type() === "warning") {
		consoleMessages.push({ type: message.type(), text: message.text().slice(0, 1_000) });
	}
});
installNetworkListeners(cdp, networkRequests);

let snapshot = null;
let runError = null;

try {
	await configureColdSlow4g(cdp);
	await startTrace(cdp);
	traceStarted = true;

	await page.goto(requestedUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
	await waitForWaterfallProbe(page, timeoutMs);
	await page.waitForTimeout(1_000);
	snapshot = await collectProbeSnapshot(page);
} catch (error) {
	runError = error instanceof Error ? error.message : String(error);
	snapshot = await collectProbeSnapshot(page).catch(() => null);
} finally {
	if (traceStarted) {
		traceResult = await stopAndReadTrace(cdp).catch((error) => ({
			error: error instanceof Error ? error.message : String(error),
		}));
	}
	await cdp.detach().catch(() => {});
	await context.close();
	await browser.close();
}

mkdirSync(OUT, { recursive: true });
if (traceResult?.buffer) writeFileSync(traceFile, traceResult.buffer);

const normalizedRequests = normalizeNetworkRequests(networkRequests, requestedUrl);
const analysis = analyzeWaterfall({
	requests: normalizedRequests,
	staticClosure,
	snapshot,
	traceBuffer: traceResult?.buffer ?? null,
	traceMeta: traceResult,
});
const assertions = buildAssertions({
	snapshot,
	analysis,
	expectedMarket,
	pageErrors,
	consoleMessages,
	traceResult,
});
const status = runError === null && Object.values(assertions).every(Boolean) ? "ok" : "incomplete";

const payload = {
	schemaVersion: 1,
	kind: "client-root-slow4g-cold-waterfall",
	generatedAt: new Date().toISOString(),
	status,
	error: runError,
	config: {
		baseUrl,
		route,
		requestedUrl,
		expectedMarket,
		expectedLocale,
		cacheMode: "cold",
		networkMode: "slow-4g",
		networkProfile: SLOW_4G,
		viewport: { ...VIEWPORT, deviceScaleFactor: 2 },
		timeoutMs,
		assetDir,
	},
	environment: {
		node: process.version,
		browser: `Chromium ${browserVersion}`,
		buildMeta,
	},
	definitions: {
		clientRootFileFinishMs: "CDP Network.loadingFinished for client-root-*.js, relative to the document request",
		staticClosureLastFinishMs:
			"Latest Network.loadingFinished among the emitted static ESM chunk closure rooted at client-root-*.js",
		downloadTailMs:
			"max(0, staticClosureLastFinishMs - clientRootFileFinishMs); required dependency download after the entry file itself finishes",
		postDownloadModuleGapMs:
			"max(0, clientRootModuleCompleteMs - staticClosureLastFinishMs); upper bound for remaining parse/evaluation/scheduling",
		traceBusyMs:
			"Union of renderer-main RunTask wall time clipped to staticClosureLastFinishMs -> clientRootModuleCompleteMs",
	},
	staticClosure,
	milestones: analysis.milestones,
	intervals: analysis.intervals,
	attribution: analysis.attribution,
	chunksByCompletion: analysis.chunksByCompletion,
	chunksFinishingInEntryToModuleWindow: analysis.chunksFinishingInEntryToModuleWindow,
	nonClosureScriptContenders: analysis.nonClosureScriptContenders,
	trace: {
		file: traceResult?.buffer ? traceFile : null,
		compression: traceResult?.streamCompression ?? null,
		format: traceResult?.traceFormat ?? null,
		dataLossOccurred: traceResult?.dataLossOccurred ?? null,
		error: traceResult?.error ?? null,
		compileModules: analysis.trace.compileModules,
		evaluateModules: analysis.trace.evaluateModules,
	},
	probe: snapshot,
	assertions,
	pageErrors,
	consoleMessages,
	requests: normalizedRequests,
};

writeFileSync(outputFile, `${JSON.stringify(payload, null, 2)}\n`);
printSummary(payload);
process.stderr.write(`wrote ${outputFile}\n`);
if (traceResult?.buffer) process.stderr.write(`wrote ${traceFile}\n`);
if (status !== "ok") process.exitCode = 1;

function buildStaticChunkClosure(directory) {
	const entryFiles = readdirSync(directory).filter((file) => /^client-root-[^/]+\.js$/.test(file));
	if (entryFiles.length !== 1) {
		throw new Error(`expected exactly one client-root chunk in ${directory}; found ${entryFiles.length}`);
	}

	const entry = entryFiles[0];
	const records = new Map();
	const queue = [{ file: entry, depth: 0, parent: null }];
	while (queue.length > 0) {
		const current = queue.shift();
		const existing = records.get(current.file);
		if (existing) {
			if (current.parent) existing.parents.add(current.parent);
			existing.depth = Math.min(existing.depth, current.depth);
			continue;
		}

		const path = resolve(directory, current.file);
		const code = readFileSync(path, "utf8");
		const imports = parseStaticImports(code)
			.filter((specifier) => specifier.startsWith("./"))
			.map((specifier) => basename(specifier));
		const record = {
			file: current.file,
			depth: current.depth,
			parents: new Set(current.parent ? [current.parent] : []),
			staticImports: [...new Set(imports)],
			rawBytes: Buffer.byteLength(code),
			gzipBytes: readOptionalSize(`${path}.gz`),
			brotliBytes: readOptionalSize(`${path}.br`),
		};
		records.set(current.file, record);
		for (const importedFile of record.staticImports) {
			queue.push({ file: importedFile, depth: current.depth + 1, parent: current.file });
		}
	}

	const chunks = [...records.values()]
		.map((record) => ({ ...record, parents: [...record.parents].sort() }))
		.sort((left, right) => left.depth - right.depth || left.file.localeCompare(right.file));
	return {
		entry,
		chunkCount: chunks.length,
		rawBytes: sum(chunks.map((chunk) => chunk.rawBytes)),
		gzipBytes: sumNullable(chunks.map((chunk) => chunk.gzipBytes)),
		brotliBytes: sumNullable(chunks.map((chunk) => chunk.brotliBytes)),
		chunks,
	};
}

function parseStaticImports(code) {
	const imports = [];
	const pattern = /\bimport(?:[^"'()]*?from)?["']([^"']+)["']/g;
	for (const match of code.matchAll(pattern)) imports.push(match[1]);
	return imports;
}

function readOptionalSize(path) {
	try {
		return readFileSync(path).byteLength;
	} catch {
		return null;
	}
}

function installNetworkListeners(session, records) {
	session.on("Network.requestWillBeSent", (event) => {
		const prior = records.get(event.requestId);
		records.set(event.requestId, {
			requestId: event.requestId,
			loaderId: event.loaderId,
			frameId: event.frameId,
			documentUrl: event.documentURL,
			url: event.request.url,
			method: event.request.method,
			type: event.type,
			initialPriority: event.request.initialPriority ?? null,
			isLinkPreload: event.request.isLinkPreload ?? false,
			renderBlockingBehavior: event.renderBlockingBehavior ?? null,
			initiator: sanitizeInitiator(event.initiator),
			requestTimestamp: event.timestamp,
			wallTime: event.wallTime,
			redirectCount: (prior?.redirectCount ?? 0) + (event.redirectResponse ? 1 : 0),
			servedFromCache: false,
			priorityChanges: prior?.priorityChanges ?? [],
		});
	});
	session.on("Network.responseReceived", (event) => {
		const record = records.get(event.requestId);
		if (!record) return;
		record.responseTimestamp = event.timestamp;
		record.status = event.response.status;
		record.mimeType = event.response.mimeType;
		record.protocol = event.response.protocol;
		record.fromDiskCache = event.response.fromDiskCache ?? false;
		record.fromServiceWorker = event.response.fromServiceWorker ?? false;
		record.fromPrefetchCache = event.response.fromPrefetchCache ?? false;
		record.fromEarlyHints = event.response.fromEarlyHints ?? false;
		record.connectionId = event.response.connectionId;
		record.connectionReused = event.response.connectionReused;
		record.responseTiming = event.response.timing ?? null;
	});
	session.on("Network.loadingFinished", (event) => {
		const record = records.get(event.requestId);
		if (!record) return;
		record.finishTimestamp = event.timestamp;
		record.encodedDataLength = event.encodedDataLength;
	});
	session.on("Network.loadingFailed", (event) => {
		const record = records.get(event.requestId);
		if (!record) return;
		record.finishTimestamp = event.timestamp;
		record.failed = true;
		record.errorText = event.errorText;
		record.canceled = event.canceled ?? false;
	});
	session.on("Network.requestServedFromCache", (event) => {
		const record = records.get(event.requestId);
		if (record) record.servedFromCache = true;
	});
	session.on("Network.resourceChangedPriority", (event) => {
		const record = records.get(event.requestId);
		if (record) record.priorityChanges.push({ timestamp: event.timestamp, priority: event.newPriority });
	});
}

function sanitizeInitiator(initiator) {
	if (!initiator) return null;
	return {
		type: initiator.type,
		url: initiator.url ?? null,
		lineNumber: initiator.lineNumber ?? null,
		columnNumber: initiator.columnNumber ?? null,
		requestId: initiator.requestId ?? null,
		stack: (initiator.stack?.callFrames ?? []).slice(0, 8).map((frame) => ({
			functionName: frame.functionName,
			url: frame.url,
			lineNumber: frame.lineNumber,
			columnNumber: frame.columnNumber,
		})),
	};
}

async function configureColdSlow4g(session) {
	await session.send("Network.enable");
	await session.send("Network.clearBrowserCache");
	await session.send("Network.setCacheDisabled", { cacheDisabled: true });
	await session.send("Network.emulateNetworkConditions", SLOW_4G);
}

async function startTrace(session) {
	await session.send("Tracing.start", {
		traceConfig: {
			recordMode: "recordUntilFull",
			includedCategories: TRACE_CATEGORIES,
		},
		transferMode: "ReturnAsStream",
		streamFormat: "json",
		streamCompression: "gzip",
	});
}

async function stopAndReadTrace(session) {
	const completed = new Promise((resolveComplete) => session.once("Tracing.tracingComplete", resolveComplete));
	await session.send("Tracing.end");
	const metadata = await completed;
	if (!metadata.stream) throw new Error("Tracing.tracingComplete did not provide a stream");

	const chunks = [];
	let eof = false;
	try {
		while (!eof) {
			const part = await session.send("IO.read", { handle: metadata.stream, size: 1024 * 1024 });
			chunks.push(Buffer.from(part.data, part.base64Encoded ? "base64" : "utf8"));
			eof = Boolean(part.eof);
		}
	} finally {
		await session.send("IO.close", { handle: metadata.stream }).catch(() => {});
	}
	return { ...metadata, buffer: Buffer.concat(chunks) };
}

async function collectProbeSnapshot(pageInstance) {
	return pageInstance.evaluate(() => {
		const probe = window.__gatuClientRootWaterfall ?? null;
		const navigation = performance.getEntriesByType("navigation")[0];
		return {
			probe,
			navigation: navigation
				? {
						name: navigation.name,
						responseEndMs: navigation.responseEnd,
						domContentLoadedMs: navigation.domContentLoadedEventEnd,
						loadEventEndMs: navigation.loadEventEnd,
					}
				: null,
			resources: performance.getEntriesByType("resource").map((entry) => ({
				name: entry.name,
				initiatorType: entry.initiatorType,
				startTimeMs: entry.startTime,
				responseEndMs: entry.responseEnd,
				transferSize: entry.transferSize,
				encodedBodySize: entry.encodedBodySize,
				decodedBodySize: entry.decodedBodySize,
			})),
		};
	});
}

async function waitForWaterfallProbe(pageInstance, runTimeoutMs) {
	const deadline = Date.now() + runTimeoutMs;
	while (Date.now() < deadline) {
		const complete = await pageInstance
			.evaluate(() => {
				const probe = window.__gatuClientRootWaterfall;
				return Boolean(
					probe?.hydrationCompleteAt !== null &&
						probe?.clientRootModuleCompleteAt !== null &&
						probe?.clientRuntimeReadyAt !== null &&
						probe?.dom?.mainWorkspaceAt !== null &&
						probe?.webSocket?.firstMarketSubscription,
				);
			})
			.catch(() => false);
		if (complete) return;
		await pageInstance.waitForTimeout(50);
	}
	throw new Error(`waterfall probe timed out after ${runTimeoutMs}ms`);
}

function normalizeNetworkRequests(records, measurementUrl) {
	const expected = new URL(measurementUrl);
	const documents = [...records.values()]
		.filter((record) => record.type === "Document" && samePath(record.url, expected))
		.sort((left, right) => left.requestTimestamp - right.requestTimestamp);
	const navigationTimestamp = documents[0]?.requestTimestamp;
	if (!Number.isFinite(navigationTimestamp)) throw new Error("document Network.requestWillBeSent was not captured");

	return [...records.values()]
		.map((record) => {
			const responseHeadersTimestamp = getResponseHeadersTimestamp(record);
			return {
				requestId: record.requestId,
				url: record.url,
				file: safeAssetBasename(record.url),
				type: record.type ?? null,
				status: record.status ?? null,
				mimeType: record.mimeType ?? null,
				protocol: record.protocol ?? null,
				initialPriority: record.initialPriority ?? null,
				priorityChanges: (record.priorityChanges ?? []).map((change) => ({
					atMs: relativeMs(change.timestamp, navigationTimestamp),
					priority: change.priority,
				})),
				isLinkPreload: record.isLinkPreload ?? false,
				renderBlockingBehavior: record.renderBlockingBehavior ?? null,
				initiator: record.initiator,
				requestStartMs: relativeMs(record.requestTimestamp, navigationTimestamp),
				responseStartMs: relativeMs(responseHeadersTimestamp, navigationTimestamp),
				responseEventMs: relativeMs(record.responseTimestamp, navigationTimestamp),
				finishMs: relativeMs(record.finishTimestamp, navigationTimestamp),
				waitForHeadersMs:
					Number.isFinite(responseHeadersTimestamp) && Number.isFinite(record.requestTimestamp)
						? round2((responseHeadersTimestamp - record.requestTimestamp) * 1_000)
						: null,
				downloadAfterHeadersMs:
					Number.isFinite(record.finishTimestamp) && Number.isFinite(responseHeadersTimestamp)
						? round2((record.finishTimestamp - responseHeadersTimestamp) * 1_000)
						: null,
				encodedDataLength: record.encodedDataLength ?? null,
				fromDiskCache: record.fromDiskCache ?? false,
				fromServiceWorker: record.fromServiceWorker ?? false,
				fromPrefetchCache: record.fromPrefetchCache ?? false,
				fromEarlyHints: record.fromEarlyHints ?? false,
				servedFromCache: record.servedFromCache ?? false,
				failed: record.failed ?? false,
				errorText: record.errorText ?? null,
			};
		})
		.sort((left, right) => nullLast(left.finishMs) - nullLast(right.finishMs));
}

function getResponseHeadersTimestamp(record) {
	const timing = record.responseTiming;
	if (
		Number.isFinite(timing?.requestTime) &&
		Number.isFinite(timing?.receiveHeadersEnd) &&
		timing.receiveHeadersEnd >= 0
	) {
		return timing.requestTime + timing.receiveHeadersEnd / 1_000;
	}
	return record.responseTimestamp;
}

function analyzeWaterfall({ requests, staticClosure, snapshot, traceBuffer, traceMeta }) {
	const probe = snapshot?.probe ?? {};
	const closureByFile = new Map(staticClosure.chunks.map((chunk) => [chunk.file, chunk]));
	const scriptRequests = requests.filter((request) => request.type === "Script" && request.file?.endsWith(".js"));
	const closureRequests = scriptRequests
		.filter((request) => closureByFile.has(request.file))
		.map((request) => ({ ...request, ...closureMembership(closureByFile.get(request.file)) }));
	const clientRootRequest = closureRequests.find((request) => request.file === staticClosure.entry);
	const finiteClosureFinishes = closureRequests.map((request) => request.finishMs).filter(Number.isFinite);
	const staticClosureLastFinishMs = finiteClosureFinishes.length > 0 ? Math.max(...finiteClosureFinishes) : null;
	const clientRootFileFinishMs = clientRootRequest?.finishMs ?? null;
	const clientRootModuleCompleteMs = finiteOrNull(probe.clientRootModuleCompleteAt);
	const hydrationCompleteMs = finiteOrNull(probe.hydrationCompleteAt);
	const clientRuntimeReadyMs = finiteOrNull(probe.clientRuntimeReadyAt);

	const trace = analyzeTrace(traceBuffer, {
		staticClosureLastFinishMs,
		clientRootModuleCompleteMs,
		traceMeta,
	});
	const intervals = {
		hydrationToClientRuntimeMs: difference(clientRuntimeReadyMs, hydrationCompleteMs),
		clientRootFileToModuleCompleteMs: difference(clientRootModuleCompleteMs, clientRootFileFinishMs),
		downloadTailMs: positiveDifference(staticClosureLastFinishMs, clientRootFileFinishMs),
		postDownloadModuleGapMs: positiveDifference(clientRootModuleCompleteMs, staticClosureLastFinishMs),
		postDownloadRendererMainBusyMs: trace.postDownloadRendererMainBusyMs,
		postDownloadRendererMainBusyPercent:
			Number.isFinite(trace.postDownloadRendererMainBusyMs) &&
			Number.isFinite(clientRootModuleCompleteMs) &&
			Number.isFinite(staticClosureLastFinishMs) &&
			clientRootModuleCompleteMs > staticClosureLastFinishMs
				? round2(
						(trace.postDownloadRendererMainBusyMs /
							(clientRootModuleCompleteMs - staticClosureLastFinishMs)) *
							100,
					)
				: null,
	};
	const missingClosureChunks = staticClosure.chunks
		.map((chunk) => chunk.file)
		.filter((file) => !closureRequests.some((request) => request.file === file));
	const observedClosureEncodedBytes = sum(
		closureRequests.map((request) =>
			Number.isFinite(request.encodedDataLength) ? request.encodedDataLength : 0,
		),
	);
	const attribution = classifyDominantConstraint(intervals);
	const chunksByCompletion = closureRequests.sort((left, right) => nullLast(left.finishMs) - nullLast(right.finishMs));
	const chunksFinishingInEntryToModuleWindow = scriptRequests
		.filter(
			(request) =>
				Number.isFinite(request.finishMs) &&
				Number.isFinite(clientRootFileFinishMs) &&
				Number.isFinite(clientRootModuleCompleteMs) &&
				request.finishMs >= clientRootFileFinishMs &&
				request.finishMs <= clientRootModuleCompleteMs,
		)
		.map((request) => ({
			...request,
			staticClosure: closureByFile.has(request.file),
			...(closureByFile.has(request.file) ? closureMembership(closureByFile.get(request.file)) : {}),
		}));
	const nonClosureScriptContenders = scriptRequests
		.filter((request) => !closureByFile.has(request.file))
		.filter(
			(request) =>
				Number.isFinite(request.requestStartMs) &&
				Number.isFinite(request.finishMs) &&
				Number.isFinite(clientRootFileFinishMs) &&
				Number.isFinite(clientRootModuleCompleteMs) &&
				request.finishMs >= clientRootFileFinishMs &&
				request.requestStartMs <= clientRootModuleCompleteMs,
		);

	return {
		milestones: {
			hydrationCompleteMs,
			clientRootFileFinishMs,
			staticClosureLastFinishMs,
			clientRootModuleCompleteMs,
			clientRuntimeReadyMs,
			loadingWorkspaceMs: finiteOrNull(probe.dom?.loadingWorkspaceAt),
			loadingWorkspaceRemovedMs: finiteOrNull(probe.dom?.loadingWorkspaceRemovedAt),
			mainWorkspaceMs: finiteOrNull(probe.dom?.mainWorkspaceAt),
			directReady: probe.dom?.loadingWorkspaceAt === null && Number.isFinite(probe.dom?.mainWorkspaceAt),
			firstHyperliquidSocketMs: finiteOrNull(probe.webSocket?.firstHyperliquidConstructAt),
			firstMarketSubscriptionMs: finiteOrNull(probe.webSocket?.firstMarketSubscription?.at),
		},
		intervals,
		attribution: {
			...attribution,
			missingClosureChunks,
			observedClosureEncodedBytes,
		},
		chunksByCompletion,
		chunksFinishingInEntryToModuleWindow,
		nonClosureScriptContenders,
		trace,
	};
}

function closureMembership(chunk) {
	return {
		staticClosure: true,
		closureDepth: chunk.depth,
		closureParents: chunk.parents,
		buildRawBytes: chunk.rawBytes,
		buildGzipBytes: chunk.gzipBytes,
		buildBrotliBytes: chunk.brotliBytes,
	};
}

function analyzeTrace(buffer, { staticClosureLastFinishMs, clientRootModuleCompleteMs, traceMeta }) {
	const empty = {
		compileModules: [],
		evaluateModules: [],
		postDownloadRendererMainBusyMs: null,
		mainRendererThread: null,
	};
	if (!buffer || traceMeta?.error) return empty;

	let parsed;
	try {
		parsed = JSON.parse(gunzipSync(buffer));
	} catch {
		return empty;
	}
	const events = parsed.traceEvents ?? [];
	const threadMetadata = events.find(
		(event) => event.ph === "M" && event.name === "thread_name" && event.args?.name === "CrRendererMain",
	);
	const mainThread = threadMetadata ? { pid: threadMetadata.pid, tid: threadMetadata.tid } : null;
	const navigationMarker = events.find((event) => event.name === "gatu:navigation-probe-installed");
	const markerStartMs = navigationMarker?.args?.data?.startTime;
	const markerTraceMs = Number.isFinite(navigationMarker?.ts) ? navigationMarker.ts / 1_000 : null;
	const traceOriginMs =
		Number.isFinite(markerTraceMs) && Number.isFinite(markerStartMs) ? markerTraceMs - markerStartMs : null;
	const toNavigationMs = (traceTimestamp) =>
		Number.isFinite(traceOriginMs) ? round2(traceTimestamp / 1_000 - traceOriginMs) : null;

	const compileModules = events
		.filter((event) => event.name === "v8.compileModule" && event.ph === "X")
		.map((event) => ({
			url: event.args?.data?.url ?? event.args?.fileName ?? null,
			file: safeAssetBasename(event.args?.data?.url ?? event.args?.fileName),
			startMs: toNavigationMs(event.ts),
			durationMs: round2((event.dur ?? 0) / 1_000),
			streamed: event.args?.data?.streamed ?? null,
			notStreamedReason: event.args?.data?.notStreamedReason ?? null,
		}))
		.filter((event) => event.file?.endsWith(".js"));
	const evaluateModules = events
		.filter((event) => event.name === "v8.evaluateModule" && event.ph === "X")
		.map((event) => ({
			startMs: toNavigationMs(event.ts),
			durationMs: round2((event.dur ?? 0) / 1_000),
		}));

	let postDownloadRendererMainBusyMs = null;
	if (
		mainThread &&
		Number.isFinite(traceOriginMs) &&
		Number.isFinite(staticClosureLastFinishMs) &&
		Number.isFinite(clientRootModuleCompleteMs) &&
		clientRootModuleCompleteMs > staticClosureLastFinishMs
	) {
		const windowStartTraceMs = traceOriginMs + staticClosureLastFinishMs;
		const windowEndTraceMs = traceOriginMs + clientRootModuleCompleteMs;
		const intervals = events
			.filter(
				(event) =>
					event.pid === mainThread.pid &&
					event.tid === mainThread.tid &&
					event.name === "RunTask" &&
					event.ph === "X" &&
					Number.isFinite(event.dur),
			)
			.map((event) => [event.ts / 1_000, (event.ts + event.dur) / 1_000])
			.map(([start, end]) => [Math.max(start, windowStartTraceMs), Math.min(end, windowEndTraceMs)])
			.filter(([start, end]) => end > start);
		postDownloadRendererMainBusyMs = round2(unionDuration(intervals));
	}

	return {
		compileModules,
		evaluateModules,
		postDownloadRendererMainBusyMs,
		mainRendererThread: mainThread,
	};
}

function classifyDominantConstraint(intervals) {
	const download = intervals.downloadTailMs;
	const postDownload = intervals.postDownloadModuleGapMs;
	const busyPercent = intervals.postDownloadRendererMainBusyPercent;
	if (!Number.isFinite(download) || !Number.isFinite(postDownload)) {
		return { dominantConstraint: "unknown", rationale: "required anchors are incomplete" };
	}
	if (download >= postDownload) {
		return {
			dominantConstraint: "download-dominant",
			rationale: `required static-chunk download tail (${download} ms) is at least the post-download module gap (${postDownload} ms)`,
		};
	}
	if (Number.isFinite(busyPercent) && busyPercent >= 50) {
		return {
			dominantConstraint: "post-download-main-thread-dominant",
			rationale: `${busyPercent}% of the post-download module gap is covered by renderer-main RunTask time`,
		};
	}
	return {
		dominantConstraint: "post-download-scheduling-or-idle-dominant",
		rationale: `post-download gap (${postDownload} ms) exceeds download tail (${download} ms) without majority renderer-main busy time`,
	};
}

function buildAssertions({ snapshot, analysis, expectedMarket, pageErrors, consoleMessages, traceResult }) {
	const probe = snapshot?.probe ?? {};
	const loadingAt = probe.dom?.loadingWorkspaceAt;
	const loadingRemovedAt = probe.dom?.loadingWorkspaceRemovedAt;
	const mainWorkspaceAt = probe.dom?.mainWorkspaceAt;
	const directReady = loadingAt === null && Number.isFinite(mainWorkspaceAt);
	const validLoadingTransition =
		probe.dom?.readyWorkspaceWhileLoadingAt === null &&
		Number.isFinite(mainWorkspaceAt) &&
		(directReady ||
			(Number.isFinite(loadingAt) &&
				Number.isFinite(loadingRemovedAt) &&
				mainWorkspaceAt >= loadingRemovedAt));
	return {
		traceCaptured: Boolean(traceResult?.buffer) && traceResult?.dataLossOccurred === false,
		allStaticClosureChunksObserved: analysis.attribution.missingClosureChunks.length === 0,
		exactlyOneHyperliquidWebSocket: probe.webSocket?.hyperliquidCount === 1,
		firstMarketSubscriptionMatches:
			probe.webSocket?.firstMarketSubscription?.payload?.subscription?.coin === expectedMarket,
		mainWorkspaceObserved: Number.isFinite(mainWorkspaceAt),
		loadingTransitionOrDirectReadyValid: validLoadingTransition,
		noPageErrors: pageErrors.length === 0,
		noConsoleErrorsOrWarnings: consoleMessages.length === 0,
		coldCacheNotServedFromCache: !analysis.chunksByCompletion.some(
			(chunk) =>
				chunk.fromDiskCache || chunk.fromServiceWorker || chunk.fromPrefetchCache || chunk.servedFromCache,
		),
	};
}

function printSummary(payload) {
	console.log(`status: ${payload.status}`);
	console.log(`client-root file finish: ${payload.milestones.clientRootFileFinishMs} ms`);
	console.log(`static closure last finish: ${payload.milestones.staticClosureLastFinishMs} ms`);
	console.log(`client-root module complete: ${payload.milestones.clientRootModuleCompleteMs} ms`);
	console.log(`download tail: ${payload.intervals.downloadTailMs} ms`);
	console.log(`post-download module gap: ${payload.intervals.postDownloadModuleGapMs} ms`);
	console.log(`observed closure transfer: ${payload.attribution.observedClosureEncodedBytes} bytes`);
	console.log(`dominant constraint: ${payload.attribution.dominantConstraint}`);
	console.log(`HL WebSockets: ${payload.probe?.probe?.webSocket?.hyperliquidCount ?? "missing"}`);
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

function expectedMarketForRoute(value) {
	const pathname = new URL(value, "http://measurement.invalid").pathname;
	const encodedMarket = pathname.match(/^\/trade\/([^/]+)$/)?.[1];
	if (!encodedMarket) throw new Error(`route must be /trade/:market; received ${value}`);
	return decodeURIComponent(encodedMarket);
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
			.replace(/^-+|-+$/g, "") || "client-root-waterfall"
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
		const name = basename(new URL(String(value)).pathname);
		return name || null;
	} catch {
		return null;
	}
}

function samePath(value, expected) {
	try {
		return new URL(value).origin === expected.origin && new URL(value).pathname === expected.pathname;
	} catch {
		return false;
	}
}

function relativeMs(value, origin) {
	return Number.isFinite(value) ? round2((value - origin) * 1_000) : null;
}

function difference(end, start) {
	return Number.isFinite(end) && Number.isFinite(start) ? round2(end - start) : null;
}

function positiveDifference(end, start) {
	const value = difference(end, start);
	return Number.isFinite(value) ? Math.max(0, value) : null;
}

function finiteOrNull(value) {
	return Number.isFinite(value) ? round2(value) : null;
}

function round2(value) {
	return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

function nullLast(value) {
	return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

function sum(values) {
	return values.reduce((total, value) => total + value, 0);
}

function sumNullable(values) {
	return values.every(Number.isFinite) ? sum(values) : null;
}

function unionDuration(intervals) {
	if (intervals.length === 0) return 0;
	const sorted = [...intervals].sort((left, right) => left[0] - right[0]);
	let [currentStart, currentEnd] = sorted[0];
	let total = 0;
	for (const [start, end] of sorted.slice(1)) {
		if (start <= currentEnd) {
			currentEnd = Math.max(currentEnd, end);
		} else {
			total += currentEnd - currentStart;
			currentStart = start;
			currentEnd = end;
		}
	}
	return total + currentEnd - currentStart;
}

/** Runs in the main frame before application code. */
function installWaterfallProbe({ expectedOrigin, expectedLocale, expectedMarket }) {
	if (window.top !== window || location.origin !== expectedOrigin) return;
	performance.setResourceTimingBufferSize?.(4_000);
	performance.mark("gatu:navigation-probe-installed");
	const now = () => performance.now();
	const mark = (name) => {
		try {
			performance.mark(name);
		} catch {}
	};
	const state = {
		version: 1,
		expectedLocale,
		expectedMarket,
		hydrationCompleteAt: null,
		clientRootModuleCompleteAt: null,
		clientRuntimeRenderSignalAt: null,
		clientRuntimeReadyAt: null,
		originalSkeletonSeenAt: null,
		dom: {
			loadingWorkspaceAt: null,
			loadingWorkspaceRemovedAt: null,
			mainWorkspaceAt: null,
			readyWorkspaceWhileLoadingAt: null,
		},
		webSocket: {
			totalCount: 0,
			hyperliquidCount: 0,
			urls: [],
			firstHyperliquidConstructAt: null,
			firstMarketSubscription: null,
		},
	};
	window.__gatuClientRootWaterfall = state;
	try {
		localStorage.setItem("terminal-perf-enabled", "1");
		localStorage.setItem("locale-v1", expectedLocale);
	} catch {}

	installReactProbe();
	installStorageProbe();
	installWebSocketProbe();
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
					mark("gatu:hydration-complete");
				}
				if (
					state.clientRuntimeReadyAt === null &&
					state.clientRuntimeRenderSignalAt !== null &&
					at >= state.clientRuntimeRenderSignalAt
				) {
					state.clientRuntimeReadyAt = at;
					mark("gatu:client-runtime-ready");
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
			const value = nativeGetItem.call(this, key);
			if (
				key === "locale-v1" &&
				state.clientRootModuleCompleteAt !== null &&
				state.clientRuntimeRenderSignalAt === null
			) {
				state.clientRuntimeRenderSignalAt = now();
				mark("gatu:client-runtime-render-signal");
			}
			return value;
		};
		Storage.prototype.removeItem = function removeItem(key) {
			try {
				return nativeRemoveItem.call(this, key);
			} finally {
				if (key === "hl-markets-meta-v1" && state.clientRootModuleCompleteAt === null) {
					state.clientRootModuleCompleteAt = now();
					mark("gatu:client-root-module-complete");
				}
			}
		};
	}

	function installWebSocketProbe() {
		const NativeWebSocket = window.WebSocket;
		const hyperliquidSockets = new WeakSet();
		const isHyperliquid = (value) => {
			try {
				const url = new URL(String(value));
				return url.protocol === "wss:" && /hyperliquid[^.]*\.xyz$/i.test(url.hostname) && url.pathname === "/ws";
			} catch {
				return false;
			}
		};
		window.WebSocket = class InstrumentedWebSocket extends NativeWebSocket {
			constructor(...constructorArgs) {
				super(...constructorArgs);
				state.webSocket.totalCount += 1;
				const url = String(constructorArgs[0]);
				state.webSocket.urls.push(url);
				if (isHyperliquid(url)) {
					hyperliquidSockets.add(this);
					state.webSocket.hyperliquidCount += 1;
					state.webSocket.firstHyperliquidConstructAt ??= now();
				}
			}

			send(data) {
				try {
					const payload = typeof data === "string" ? JSON.parse(data) : null;
					if (
						hyperliquidSockets.has(this) &&
						state.webSocket.firstMarketSubscription === null &&
						payload?.method === "subscribe" &&
						typeof payload?.subscription?.coin === "string"
					) {
						state.webSocket.firstMarketSubscription = {
							at: now(),
							payload: {
								method: payload.method,
								subscription: {
									type: payload.subscription.type ?? null,
									coin: payload.subscription.coin,
								},
							},
						};
					}
				} catch {}
				return super.send(data);
			}
		};
	}

	function installDomProbe() {
		let skeleton = null;
		let loadingWorkspace = null;
		const inspect = () => {
			const at = now();
			const currentSkeleton = document.querySelector('[data-testid="app-shell-fallback"]');
			if (!skeleton && currentSkeleton) {
				skeleton = currentSkeleton;
				state.originalSkeletonSeenAt = at;
			}
			const currentLoading = document.querySelector("[data-terminal-loading-workspace]");
			if (!loadingWorkspace && currentLoading) {
				loadingWorkspace = currentLoading;
				state.dom.loadingWorkspaceAt = at;
				mark("gatu:loading-workspace");
			}
			if (loadingWorkspace && !loadingWorkspace.isConnected && state.dom.loadingWorkspaceRemovedAt === null) {
				state.dom.loadingWorkspaceRemovedAt = at;
				mark("gatu:loading-workspace-removed");
			}
			const mainWorkspace = document.querySelector("[data-main-workspace]");
			if (mainWorkspace && currentLoading && state.dom.readyWorkspaceWhileLoadingAt === null) {
				state.dom.readyWorkspaceWhileLoadingAt = at;
			}
			if (mainWorkspace && state.dom.mainWorkspaceAt === null) {
				state.dom.mainWorkspaceAt = at;
				mark("gatu:main-workspace");
			}
		};
		new MutationObserver(inspect).observe(document, { subtree: true, childList: true });
		inspect();
	}
}
