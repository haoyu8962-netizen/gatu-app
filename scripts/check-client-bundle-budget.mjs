import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";

const assetsDirectory = resolve(process.argv[2] ?? "apps/terminal/.output/public/assets");
const budgets = {
	largestChunkRawBytes: 4_050_000,
	largestChunkGzipBytes: 1_200_000,
	totalGzipBaselineBytes: 2_828_991,
	totalGzipAllowedIncreaseBytes: 10_000,
	surfaces: [
		{ name: "trade-terminal-page", baselineGzipBytes: 100_922, allowedIncreaseBytes: 4_000 },
		{ name: "token-selector-popup", baselineGzipBytes: 14_355, allowedIncreaseBytes: 1_500 },
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
for (const surface of surfaceSizes) {
	const asset = surface.assets.length === 1 ? surface.assets[0] : undefined;
	if (asset) console.log(`- ${asset.file}: ${asset.gzip} gzip bytes`);
}

if (violations.length > 0) {
	console.error("Client bundle budget exceeded:");
	for (const violation of violations) console.error(`- ${violation}`);
	process.exit(1);
}
