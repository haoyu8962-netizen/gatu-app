import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";

const assetsDirectory = resolve(process.argv[2] ?? "apps/terminal/.output/public/assets");
const budgets = {
	largestChunkRawBytes: 4_050_000,
	largestChunkGzipBytes: 1_200_000,
	totalGzipBytes: 2_650_000,
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

if (largestChunk.raw > budgets.largestChunkRawBytes) {
	violations.push(`${largestChunk.file} raw ${largestChunk.raw} > ${budgets.largestChunkRawBytes} bytes`);
}
if (largestChunk.gzip > budgets.largestChunkGzipBytes) {
	violations.push(`${largestChunk.file} gzip ${largestChunk.gzip} > ${budgets.largestChunkGzipBytes} bytes`);
}
if (totalGzip > budgets.totalGzipBytes) {
	violations.push(`total client gzip ${totalGzip} > ${budgets.totalGzipBytes} bytes`);
}

console.log(
	`Client bundle budget: ${largestChunk.file} ${largestChunk.raw} raw / ${largestChunk.gzip} gzip; total ${totalGzip} gzip bytes.`,
);

if (violations.length > 0) {
	console.error("Client bundle budget exceeded:");
	for (const violation of violations) console.error(`- ${violation}`);
	process.exit(1);
}
