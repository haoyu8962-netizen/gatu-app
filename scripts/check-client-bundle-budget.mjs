import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import {
	collectChunkGraphStaticClosure,
	collectRuntimeStartupFiles,
	findPublicClientChunkGraphArtifacts,
	findUniqueJavaScriptChunk,
	readClientChunkGraphFile,
	resolveClientChunkGraphCacheFile,
	validateClientChunkGraphAgainstAssets,
} from "./client-chunk-graph.mjs";

export const TRADE_DESKTOP_RUNTIME_MODULE_IDS = [
	"apps/terminal/src/components/trade/chart/chart-panel.tsx",
	"apps/terminal/src/components/trade/orderbook/orderbook-panel.tsx",
	"apps/terminal/src/components/trade/tradebox/trade-panel.tsx",
	"apps/terminal/src/components/trade/tradebox/account-panel.tsx",
	"apps/terminal/src/components/trade/positions/positions-panel.tsx",
	"apps/terminal/src/components/trade/chart/tradingview-chart.tsx",
	"apps/terminal/src/components/trade/footer/footer-bar.tsx",
	"apps/terminal/src/components/trade/positions/positions-tab.tsx",
	"apps/terminal/src/components/trade/positions/funding-tab.tsx",
	"apps/terminal/src/components/trade/positions/history-tab.tsx",
	"apps/terminal/src/components/trade/positions/orders-history-tab.tsx",
];

const budgets = {
	largestChunkRawBytes: 4_050_000,
	largestChunkGzipBytes: 1_200_000,
	totalGzipBaselineBytes: 3_154_707,
	totalGzipAllowedIncreaseBytes: 10_000,
	tradeStartup: {
		requiredRouteIds: ["__root__", "/trade/$symbol"],
		optionalRouteIds: ["/trade"],
		staticClosureChunkPrefixes: ["client-root", "trade-terminal-page", "early-prefetch"],
		baselineGzipBytes: 1_570_221,
		allowedIncreaseBytes: 10_000,
	},
	tradeRuntimeStartup: {
		entryRouteId: "__root__",
		commonModuleIds: [
			"apps/terminal/src/lib/hyperliquid/markets/market-catalog-info-client.ts",
			"apps/terminal/src/components/funds-action/funds-action-recovery-host.tsx",
			"apps/terminal/src/components/ui/sonner.tsx",
			"apps/terminal/src/components/trade/components/global-modals.tsx",
			"apps/terminal/src/components/trade/chart/token-selector-popup.tsx",
		],
		profiles: [
			{ name: "mobile", moduleIds: [], baselineGzipBytes: 110_580, allowedIncreaseBytes: 10_000 },
			{
				name: "desktop",
				moduleIds: TRADE_DESKTOP_RUNTIME_MODULE_IDS,
				baselineGzipBytes: 191_988,
				allowedIncreaseBytes: 10_000,
			},
		],
	},
	surfaces: [
		{ name: "trade-terminal-page", baselineGzipBytes: 119_207, allowedIncreaseBytes: 4_000 },
		{ name: "token-selector-popup", baselineGzipBytes: 14_355, allowedIncreaseBytes: 1_500 },
		{ name: "api-wallet", baselineGzipBytes: 17_967, allowedIncreaseBytes: 2_000 },
		{ name: "fundingHistory._address", baselineGzipBytes: 6_820, allowedIncreaseBytes: 1_500 },
		{ name: "tradeHistory._address", baselineGzipBytes: 8_373, allowedIncreaseBytes: 1_500 },
		{ name: "historicalOrders._address", baselineGzipBytes: 8_163, allowedIncreaseBytes: 1_500 },
		{ name: "leaderboard", baselineGzipBytes: 12_083, allowedIncreaseBytes: 1_500 },
		{ name: "staking", baselineGzipBytes: 23_131, allowedIncreaseBytes: 2_500 },
		{ name: "vaults-page", baselineGzipBytes: 27_075, allowedIncreaseBytes: 3_000 },
	],
};

export function collectTradeStartupFiles({
	graph,
	assetFiles,
	routePreloadFiles,
	runtimeEntryFiles,
	semanticEntryFiles,
}) {
	return collectChunkGraphStaticClosure({
		graph,
		assetFiles,
		entryFiles: [...routePreloadFiles, ...runtimeEntryFiles, ...semanticEntryFiles],
	});
}

export function getBudgetIncreaseViolation({ label, actualBytes, baselineBytes, allowedIncreaseBytes }) {
	const increase = actualBytes - baselineBytes;
	if (increase <= allowedIncreaseBytes) return undefined;
	return `${label} increased by ${increase} bytes from baseline ${baselineBytes}; allowed increase is ${allowedIncreaseBytes} bytes`;
}

function normalizeManifestAsset(assetPath) {
	const pathname = assetPath.replace(/[?#].*$/, "");
	if (!pathname.startsWith("/assets/")) throw new Error(`expected client asset path under /assets/: ${assetPath}`);
	return pathname.replace(/^\/assets\//, "");
}

function resolveRouteAssets({ startManifest, routeIds, optionalRouteIds, field, violations }) {
	const optionalRoutes = new Set(optionalRouteIds);
	return new Set(
		routeIds.flatMap((routeId) => {
			const route = startManifest.routes?.[routeId];
			if (!route && optionalRoutes.has(routeId)) return [];
			if (!route || !Array.isArray(route[field])) {
				violations.push(`expected TanStack route ${routeId} with ${field} metadata was not found`);
				return [];
			}
			return route[field].map(normalizeManifestAsset);
		}),
	);
}

/** Reads the built client, the chunk graph and the TanStack manifest; no logging, no budget verdict. */
export async function analyzeClientBundle(assetsDirectoryArgument) {
	const assetsDirectory = resolve(assetsDirectoryArgument ?? "apps/terminal/.output/public/assets");
	const publicGraphArtifacts = findPublicClientChunkGraphArtifacts(resolve(assetsDirectory, ".."));
	if (publicGraphArtifacts.length > 0) {
		throw new Error(
			`client chunk graph diagnostics must not be published under public output: ${publicGraphArtifacts.join(", ")}`,
		);
	}

	const assetFiles = readdirSync(assetsDirectory)
		.filter((file) => file.endsWith(".js") || file.endsWith(".css"))
		.sort();
	const terminalDirectory = resolve(assetsDirectory, "../../..");
	const clientChunkGraph = readClientChunkGraphFile(resolveClientChunkGraphCacheFile(terminalDirectory));
	validateClientChunkGraphAgainstAssets(clientChunkGraph, assetFiles);

	const sizes = assetFiles.map((file) => {
		const content = readFileSync(resolve(assetsDirectory, file));
		return { file, raw: content.length, gzip: gzipSync(content).length };
	});
	const sizesByFile = new Map(sizes.map((asset) => [asset.file, asset]));
	const largestChunk = sizes.filter(({ file }) => file.endsWith(".js")).sort((left, right) => right.raw - left.raw)[0];
	if (!largestChunk) throw new Error("No client JavaScript chunks were found.");

	const totalGzip = sizes.reduce((total, asset) => total + asset.gzip, 0);
	const violations = [];
	const serverDirectory = resolve(assetsDirectory, "../../server");
	const startManifestFile = readdirSync(serverDirectory).find(
		(file) => file.startsWith("_tanstack-start-manifest_") && file.endsWith(".mjs"),
	);
	if (!startManifestFile) throw new Error("TanStack Start manifest was not found.");
	const startManifestModule = await import(pathToFileURL(resolve(serverDirectory, startManifestFile)).href);
	if (typeof startManifestModule.tsrStartManifest !== "function") {
		throw new Error("TanStack Start manifest does not export tsrStartManifest().");
	}
	const startManifest = startManifestModule.tsrStartManifest();

	const tradeRoutePreloadFiles = resolveRouteAssets({
		startManifest,
		routeIds: [...budgets.tradeStartup.requiredRouteIds, ...budgets.tradeStartup.optionalRouteIds],
		optionalRouteIds: budgets.tradeStartup.optionalRouteIds,
		field: "preloads",
		violations,
	});
	const runtimeEntryRoute = startManifest.routes?.[budgets.tradeRuntimeStartup.entryRouteId];
	if (!runtimeEntryRoute || !Array.isArray(runtimeEntryRoute.scripts) || runtimeEntryRoute.scripts.length === 0) {
		throw new Error(
			`expected TanStack route ${budgets.tradeRuntimeStartup.entryRouteId} with script metadata was not found`,
		);
	}
	const runtimeEntryFiles = runtimeEntryRoute.scripts.map((script) => {
		const source = script?.attrs?.src;
		if (typeof source !== "string") throw new Error("expected TanStack runtime entry script with a src attribute");
		return normalizeManifestAsset(source);
	});
	const tradeStaticEntryFiles = budgets.tradeStartup.staticClosureChunkPrefixes.map((prefix) =>
		findUniqueJavaScriptChunk(assetFiles, prefix),
	);
	const tradeStartupFiles = collectTradeStartupFiles({
		graph: clientChunkGraph,
		assetFiles,
		routePreloadFiles: tradeRoutePreloadFiles,
		runtimeEntryFiles,
		semanticEntryFiles: tradeStaticEntryFiles,
	});
	const tradeStartupAssets = [...tradeStartupFiles].map((file) => {
		const asset = sizesByFile.get(file);
		if (!asset) violations.push(`expected trade startup asset ${file} was not found`);
		return asset;
	});
	const tradeStartupGzip = tradeStartupAssets.reduce((total, asset) => total + (asset?.gzip ?? 0), 0);

	const runtimeProfileSizes = budgets.tradeRuntimeStartup.profiles.map((profile) => {
		const files = collectRuntimeStartupFiles({
			graph: clientChunkGraph,
			assetFiles,
			startupFiles: tradeStartupFiles,
			entryFiles: runtimeEntryFiles,
			moduleIds: [...budgets.tradeRuntimeStartup.commonModuleIds, ...profile.moduleIds],
		});
		const assets = [...files].map((file) => {
			const asset = sizesByFile.get(file);
			if (!asset) throw new Error(`expected trade runtime startup asset ${file} was not found`);
			return asset;
		});
		return { ...profile, files, gzip: assets.reduce((total, asset) => total + asset.gzip, 0) };
	});

	const surfaceSizes = budgets.surfaces.map((surface) => {
		const assets = sizes.filter(({ file }) => file.startsWith(`${surface.name}-`) && file.endsWith(".js"));
		return { ...surface, assets };
	});

	return {
		assetsDirectory,
		assetFiles,
		sizes,
		sizesByFile,
		largestChunk,
		totalGzip,
		violations,
		tradeRoutePreloadFiles,
		runtimeEntryFiles,
		tradeStaticEntryFiles,
		tradeStartupFiles,
		tradeStartupGzip,
		runtimeProfileSizes,
		surfaceSizes,
	};
}

export async function checkClientBundleBudget(assetsDirectoryArgument) {
	const {
		largestChunk,
		totalGzip,
		violations,
		tradeRoutePreloadFiles,
		runtimeEntryFiles,
		tradeStaticEntryFiles,
		tradeStartupFiles,
		tradeStartupGzip,
		runtimeProfileSizes,
		surfaceSizes,
	} = await analyzeClientBundle(assetsDirectoryArgument);

	if (largestChunk.raw > budgets.largestChunkRawBytes) {
		violations.push(`${largestChunk.file} raw ${largestChunk.raw} > ${budgets.largestChunkRawBytes} bytes`);
	}
	if (largestChunk.gzip > budgets.largestChunkGzipBytes) {
		violations.push(`${largestChunk.file} gzip ${largestChunk.gzip} > ${budgets.largestChunkGzipBytes} bytes`);
	}
	const totalGzipIncrease = totalGzip - budgets.totalGzipBaselineBytes;
	if (totalGzipIncrease > budgets.totalGzipAllowedIncreaseBytes) {
		violations.push(
			`total client gzip increased by ${totalGzipIncrease} bytes from baseline ${budgets.totalGzipBaselineBytes}; allowed increase is ${budgets.totalGzipAllowedIncreaseBytes} bytes`,
		);
	}
	const tradeStartupGzipIncrease = tradeStartupGzip - budgets.tradeStartup.baselineGzipBytes;
	if (tradeStartupGzipIncrease > budgets.tradeStartup.allowedIncreaseBytes) {
		violations.push(
			`trade startup gzip increased by ${tradeStartupGzipIncrease} bytes from baseline ${budgets.tradeStartup.baselineGzipBytes}; allowed increase is ${budgets.tradeStartup.allowedIncreaseBytes} bytes`,
		);
	}
	for (const profile of runtimeProfileSizes) {
		const violation = getBudgetIncreaseViolation({
			label: `trade ${profile.name} runtime startup gzip`,
			actualBytes: profile.gzip,
			baselineBytes: profile.baselineGzipBytes,
			allowedIncreaseBytes: profile.allowedIncreaseBytes,
		});
		if (violation) violations.push(violation);
	}

	for (const surface of surfaceSizes) {
		if (surface.assets.length === 0) {
			violations.push(`expected client chunk ${surface.name}-*.js was not found`);
			continue;
		}
		if (surface.assets.length > 1) {
			violations.push(`expected one client chunk ${surface.name}-*.js but found ${surface.assets.length}`);
			continue;
		}
		const asset = surface.assets[0];
		if (!asset) continue;
		const increase = asset.gzip - surface.baselineGzipBytes;
		if (increase > surface.allowedIncreaseBytes) {
			violations.push(
				`${asset.file} gzip increased by ${increase} bytes from baseline ${surface.baselineGzipBytes}; allowed increase is ${surface.allowedIncreaseBytes} bytes`,
			);
		}
	}

	console.log(
		`Client bundle budget: ${largestChunk.file} ${largestChunk.raw} raw / ${largestChunk.gzip} gzip; total ${totalGzip} gzip bytes (${totalGzipIncrease >= 0 ? "+" : ""}${totalGzipIncrease} from baseline).`,
	);
	console.log(
		`- trade startup: ${tradeStartupFiles.size} static-closure assets from ${tradeRoutePreloadFiles.size} route preloads, ${runtimeEntryFiles.length} runtime scripts, and ${tradeStaticEntryFiles.length} semantic entries / ${tradeStartupGzip} gzip bytes (${tradeStartupGzipIncrease >= 0 ? "+" : ""}${tradeStartupGzipIncrease} from baseline)`,
	);
	for (const profile of runtimeProfileSizes) {
		const increase = profile.gzip - profile.baselineGzipBytes;
		console.log(
			`- trade ${profile.name} runtime startup: ${profile.files.size} incremental assets / ${profile.gzip} gzip bytes (${increase >= 0 ? "+" : ""}${increase} from baseline); ${tradeStartupFiles.size + profile.files.size} startup assets / ${tradeStartupGzip + profile.gzip} gzip including static startup`,
		);
	}
	for (const surface of surfaceSizes) {
		const asset = surface.assets.length === 1 ? surface.assets[0] : undefined;
		if (asset) console.log(`- ${asset.file}: ${asset.gzip} gzip bytes`);
	}

	if (violations.length > 0) {
		console.error("Client bundle budget exceeded:");
		for (const violation of violations) console.error(`- ${violation}`);
		process.exitCode = 1;
	}

	return {
		totalGzip,
		tradeStartupGzip,
		tradeStartupFiles,
		runtimeProfileSizes,
		violations,
	};
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMainModule) await checkClientBundleBudget(process.argv[2]);
