import { constants } from "node:fs";
import { access, readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";

const COMPRESSION_SUFFIXES = [".br", ".gz", ".zst"];
const REQUIRED_CHART_FILES = ["charting_library.js", "sameorigin.html"];

async function listFiles(root, directory = "") {
	const entries = await readdir(resolve(root, directory), { withFileTypes: true });
	const files = [];

	for (const entry of entries) {
		const relativePath = directory ? `${directory}/${entry.name}` : entry.name;
		if (entry.isDirectory()) {
			files.push(...(await listFiles(root, relativePath)));
		} else if (entry.isFile()) {
			files.push(relativePath);
		} else {
			throw new Error(`Unsupported TradingView asset type: ${resolve(root, relativePath)}`);
		}
	}

	return files.sort();
}

async function assertIdentical(source, output, label) {
	await access(source, constants.R_OK);
	await access(output, constants.R_OK);

	const [sourceStat, outputStat] = await Promise.all([stat(source), stat(output)]);
	if (!sourceStat.isFile() || !outputStat.isFile()) {
		throw new Error(`${label} must be a regular file.`);
	}
	if (sourceStat.size !== outputStat.size) {
		throw new Error(`${label} differs between source public assets and build output.`);
	}

	const [sourceContents, outputContents] = await Promise.all([readFile(source), readFile(output)]);
	if (!sourceContents.equals(outputContents)) {
		throw new Error(`${label} differs between source public assets and build output.`);
	}
}

function isGeneratedCompressedAsset(relativePath, sourceFiles) {
	return COMPRESSION_SUFFIXES.some(
		(suffix) => relativePath.endsWith(suffix) && sourceFiles.has(relativePath.slice(0, -suffix.length)),
	);
}

async function verifyChartBuild(sourcePublicRoot, outputPublicRoot) {
	const sourceChartRoot = resolve(sourcePublicRoot, "charting_library");
	const outputChartRoot = resolve(outputPublicRoot, "charting_library");
	const sourceFiles = new Set(await listFiles(sourceChartRoot));
	const outputFiles = new Set(await listFiles(outputChartRoot));

	if (sourceFiles.size === 0) {
		throw new Error(`Source TradingView package is empty: ${sourceChartRoot}`);
	}
	for (const relativePath of REQUIRED_CHART_FILES) {
		if (!sourceFiles.has(relativePath)) {
			throw new Error(`Source TradingView package is missing required asset: ${relativePath}`);
		}
	}

	for (const relativePath of sourceFiles) {
		if (!outputFiles.has(relativePath)) {
			throw new Error(`Build output is missing TradingView asset: ${relativePath}`);
		}
		await assertIdentical(
			resolve(sourceChartRoot, relativePath),
			resolve(outputChartRoot, relativePath),
			`TradingView asset ${relativePath}`,
		);
	}

	const unexpectedFiles = [...outputFiles].filter(
		(relativePath) => !sourceFiles.has(relativePath) && !isGeneratedCompressedAsset(relativePath, sourceFiles),
	);
	if (unexpectedFiles.length > 0) {
		throw new Error(`Build output contains unexpected TradingView assets: ${unexpectedFiles.join(", ")}`);
	}

	await assertIdentical(
		resolve(sourcePublicRoot, "tradingview-theme.css"),
		resolve(outputPublicRoot, "tradingview-theme.css"),
		"TradingView theme stylesheet",
	);
}

const [sourcePublicRoot, outputPublicRoot] = process.argv.slice(2);
if (!sourcePublicRoot || !outputPublicRoot) {
	throw new Error("Usage: node deploy/verify-chart-build.mjs <source-public-root> <output-public-root>");
}

await verifyChartBuild(sourcePublicRoot, outputPublicRoot);
