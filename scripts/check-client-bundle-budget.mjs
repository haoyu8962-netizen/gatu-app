import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

const assetsDirectory = resolve(process.argv[2] ?? "apps/terminal/.output/public/assets");
const budgets = {
	largestChunkRawBytes: 4_050_000,
	largestChunkGzipBytes: 1_200_000,
	totalGzipBaselineBytes: 3_087_847,
	totalGzipAllowedIncreaseBytes: 10_000,
	tradeStartup: {
		requiredRouteIds: ["__root__", "/trade/$symbol"],
		optionalRouteIds: ["/trade"],
		baselineGzipBytes: 530_503,
		allowedIncreaseBytes: 10_000,
	},
	surfaces: [
		{ name: "trade-terminal-page", baselineGzipBytes: 114_338, allowedIncreaseBytes: 4_000 },
		{ name: "token-selector-popup", baselineGzipBytes: 14_355, allowedIncreaseBytes: 1_500 },
		{ name: "api-wallet", baselineGzipBytes: 17_967, allowedIncreaseBytes: 2_000 },
		{ name: "leaderboard", baselineGzipBytes: 12_083, allowedIncreaseBytes: 1_500 },
		{ name: "staking", baselineGzipBytes: 23_131, allowedIncreaseBytes: 2_500 },
		{ name: "vaults-page", baselineGzipBytes: 27_075, allowedIncreaseBytes: 3_000 },
	],
};

const assetFiles = readdirSync(assetsDirectory).filter((file) => file.endsWith(".js") || file.endsWith(".css"));

const sizes = assetFiles.map((file) => {
	const content = readFileSync(resolve(assetsDirectory, file));
	return { file, raw: content.length, gzip: gzipSync(content).length };
});
const largestChunk = sizes.filter(({ file }) => file.endsWith(".js")).sort((left, right) => right.raw - left.raw)[0];

if (!largestChunk) throw new Error("No client JavaScript chunks were found.");

const totalGzip = sizes.reduce((total, asset) => total + asset.gzip, 0);
const violations = [];

const serverDirectory = resolve(assetsDirectory, "../../server");
const startManifestFile = readdirSync(serverDirectory).find((file) => file.startsWith("_tanstack-start-manifest_") && file.endsWith(".mjs"));
if (!startManifestFile) throw new Error("TanStack Start manifest was not found.");
const startManifestModule = await import(pathToFileURL(resolve(serverDirectory, startManifestFile)).href);
if (typeof startManifestModule.tsrStartManifest !== "function") {
	throw new Error("TanStack Start manifest does not export tsrStartManifest().");
}
const startManifest = startManifestModule.tsrStartManifest();
const tradeStartupRoutes = [
	...budgets.tradeStartup.requiredRouteIds.map((routeId) => ({ routeId, required: true })),
	...budgets.tradeStartup.optionalRouteIds.map((routeId) => ({ routeId, required: false })),
];
const tradeStartupFiles = new Set(
	tradeStartupRoutes.flatMap(({ routeId, required }) => {
		const route = startManifest.routes?.[routeId];
		if (!route && !required) return [];
		if (!route || !Array.isArray(route.preloads)) {
			violations.push(`expected TanStack route ${routeId} with preload metadata was not found`);
			return [];
		}
		return route.preloads.map((preload) => preload.replace(/^\/assets\//, ""));
	}),
);
const tradeStartupAssets = [...tradeStartupFiles].map((file) => {
	const asset = sizes.find((candidate) => candidate.file === file);
	if (!asset) violations.push(`expected trade startup asset ${file} was not found`);
	return asset;
});
const tradeStartupGzip = tradeStartupAssets.reduce((total, asset) => total + (asset?.gzip ?? 0), 0);

const surfaceSizes = budgets.surfaces.map((surface) => {
	const assets = sizes.filter(({ file }) => file.startsWith(`${surface.name}-`) && file.endsWith(".js"));
	return { ...surface, assets };
});

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
	`- trade startup: ${tradeStartupFiles.size} preload assets / ${tradeStartupGzip} gzip bytes (${tradeStartupGzipIncrease >= 0 ? "+" : ""}${tradeStartupGzipIncrease} from baseline)`,
);
for (const surface of surfaceSizes) {
	const asset = surface.assets.length === 1 ? surface.assets[0] : undefined;
	if (asset) console.log(`- ${asset.file}: ${asset.gzip} gzip bytes`);
}

if (violations.length > 0) {
	console.error("Client bundle budget exceeded:");
	for (const violation of violations) console.error(`- ${violation}`);
	process.exit(1);
}
