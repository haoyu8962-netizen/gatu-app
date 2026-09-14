import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import * as zlib from "node:zlib";

const COMPRESSION_SUFFIXES = [".br", ".gz", ".zst"];
const MANIFEST_SCHEMA_VERSION = 1;
const REQUIRED_CHART_FILES = ["charting_library.js", "sameorigin.html", "package.json"];
const CHART_ENTRY_FILE = "charting_library.js";
const HASHED_CHART_ENTRY = /^charting_library\.[0-9a-f]{16}\.js$/;

/** The application build emits a copy of the loader named by its content hash; see apps/terminal/src/config/chart-library.ts. */
async function readHashedChartEntryName(sourceChartRoot) {
	const contents = await readRegularFile(resolve(sourceChartRoot, CHART_ENTRY_FILE), "TradingView entry");
	return `charting_library.${createHash("sha256").update(contents).digest("hex").slice(0, 16)}.js`;
}

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

async function readRegularFile(file, label) {
	await access(file, constants.R_OK);
	const fileStat = await stat(file);
	if (!fileStat.isFile()) {
		throw new Error(`${label} must be a regular file.`);
	}
	return readFile(file);
}

async function assertIdentical(source, output, label) {
	const [sourceContents, outputContents] = await Promise.all([
		readRegularFile(source, `${label} source`),
		readRegularFile(output, `${label} output`),
	]);
	if (!sourceContents.equals(outputContents)) {
		throw new Error(`${label} differs between source public assets and build output.`);
	}
}

function getCompressionSuffix(relativePath) {
	return COMPRESSION_SUFFIXES.find((suffix) => relativePath.endsWith(suffix));
}

async function decompressStrict(contents, createDecoder, expectedSize, relativePath) {
	const decoder = createDecoder();
	const chunks = [];
	let outputSize = 0;
	decoder.on("data", (chunk) => {
		outputSize += chunk.length;
		if (outputSize > expectedSize) {
			decoder.destroy(new Error(`Decompressed TradingView asset ${relativePath} exceeds its base file size.`));
			return;
		}
		chunks.push(chunk);
	});
	decoder.end(contents);
	await new Promise((resolvePromise, rejectPromise) => {
		decoder.on("end", resolvePromise);
		decoder.on("error", rejectPromise);
	});
	if (decoder.bytesWritten !== contents.length) {
		throw new Error(`Compressed TradingView asset ${relativePath} contains trailing or concatenated data.`);
	}
	return Buffer.concat(chunks, outputSize);
}

async function decompressAsset(contents, suffix, expectedSize, relativePath) {
	try {
		switch (suffix) {
			case ".br":
				return await decompressStrict(contents, () => zlib.createBrotliDecompress(), expectedSize, relativePath);
			case ".gz":
				return zlib.gunzipSync(contents, { maxOutputLength: expectedSize + 1 });
			case ".zst":
				if (typeof zlib.createZstdDecompress !== "function") {
					throw new Error("Node.js 22.15 or newer is required to verify Zstandard assets.");
				}
				return await decompressStrict(contents, () => zlib.createZstdDecompress(), expectedSize, relativePath);
			default:
				throw new Error(`Unsupported compression suffix: ${suffix}`);
		}
	} catch (error) {
		if (error instanceof Error && error.message.includes(relativePath)) {
			throw error;
		}
		throw new Error(
			`Cannot decompress generated TradingView asset ${relativePath}: ${error instanceof Error ? error.message : String(error)}`,
			{ cause: error },
		);
	}
}

async function assertValidCompressedAsset(outputChartRoot, relativePath, baseRelativePath) {
	const [compressedContents, baseContents] = await Promise.all([
		readRegularFile(
			resolve(outputChartRoot, relativePath),
			`Compressed TradingView asset ${relativePath}`,
		),
		readRegularFile(
			resolve(outputChartRoot, baseRelativePath),
			`Base TradingView asset ${baseRelativePath}`,
		),
	]);
	const suffix = getCompressionSuffix(relativePath);
	const decompressedContents = await decompressAsset(
		compressedContents,
		suffix,
		baseContents.length,
		relativePath,
	);
	if (!decompressedContents.equals(baseContents)) {
		throw new Error(
			`Compressed TradingView asset ${relativePath} does not expand to ${baseRelativePath}.`,
		);
	}
}

function assertSafeManifestPath(relativePath) {
	if (
		typeof relativePath !== "string" ||
		relativePath.length === 0 ||
		relativePath.startsWith("/") ||
		relativePath.includes("\\") ||
		relativePath.split("/").some((segment) => segment.length === 0 || segment === "." || segment === "..")
	) {
		throw new Error(`Invalid TradingView manifest path: ${JSON.stringify(relativePath)}`);
	}
}

function assertExactKeys(value, expectedKeys, label) {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`${label} must be an object.`);
	}
	const actualKeys = Object.keys(value);
	const missingKeys = expectedKeys.filter((key) => !actualKeys.includes(key));
	const unexpectedKeys = actualKeys.filter((key) => !expectedKeys.includes(key));
	if (missingKeys.length > 0 || unexpectedKeys.length > 0) {
		throw new Error(
			`${label} keys must be ${expectedKeys.join(", ")}; missing ${missingKeys.join(", ") || "none"}; unexpected ${unexpectedKeys.join(", ") || "none"}.`,
		);
	}
}

function readPackageMetadata(packageContents) {
	let packageMetadata;
	try {
		packageMetadata = JSON.parse(packageContents.toString("utf8"));
	} catch (error) {
		throw new Error("TradingView package.json is not valid JSON.", { cause: error });
	}
	const packageDescription = packageMetadata.description;
	const packageVersion =
		typeof packageMetadata.version === "string"
			? packageMetadata.version
			: typeof packageDescription === "string"
				? /^CL v([^\s]+)/.exec(packageDescription)?.[1]
				: undefined;
	if (typeof packageDescription !== "string" || packageDescription.length === 0) {
		throw new Error("TradingView package.json must declare a non-empty description.");
	}
	if (typeof packageVersion !== "string" || packageVersion.length === 0) {
		throw new Error("TradingView package version could not be derived from package.json.");
	}
	return { packageDescription, packageVersion };
}

async function readManifest(manifestPath) {
	let manifest;
	try {
		manifest = JSON.parse(await readFile(manifestPath, "utf8"));
	} catch (error) {
		throw new Error(`Cannot read TradingView package manifest ${manifestPath}.`, { cause: error });
	}
	assertExactKeys(
		manifest,
		["schemaVersion", "packageVersion", "packageDescription", "files"],
		"TradingView manifest",
	);
	if (manifest?.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
		throw new Error(
			`TradingView manifest schemaVersion must be ${MANIFEST_SCHEMA_VERSION}; received ${JSON.stringify(manifest?.schemaVersion)}.`,
		);
	}
	if (typeof manifest.packageVersion !== "string" || manifest.packageVersion.length === 0) {
		throw new Error("TradingView manifest must declare packageVersion.");
	}
	if (typeof manifest.packageDescription !== "string" || manifest.packageDescription.length === 0) {
		throw new Error("TradingView manifest must declare packageDescription.");
	}
	if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
		throw new Error("TradingView manifest must contain a non-empty files array.");
	}

	const files = new Map();
	for (const entry of manifest.files) {
		assertExactKeys(entry, ["path", "sha256", "size"], "TradingView manifest file entry");
		assertSafeManifestPath(entry?.path);
		if (!Number.isSafeInteger(entry.size) || entry.size < 0) {
			throw new Error(`Invalid TradingView manifest size for ${entry.path}: ${entry.size}`);
		}
		if (typeof entry.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(entry.sha256)) {
			throw new Error(`Invalid TradingView manifest SHA-256 for ${entry.path}.`);
		}
		if (files.has(entry.path)) {
			throw new Error(`Duplicate TradingView manifest path: ${entry.path}`);
		}
		files.set(entry.path, entry);
	}
	return { ...manifest, files };
}

async function assertSourceMatchesManifest(sourceChartRoot, sourceFiles, manifest) {
	const manifestPaths = new Set(manifest.files.keys());
	const missingManifestFiles = [...manifestPaths].filter((relativePath) => !sourceFiles.has(relativePath));
	if (missingManifestFiles.length > 0) {
		throw new Error(
			`Source TradingView package is missing manifest assets: ${missingManifestFiles.join(", ")}`,
		);
	}
	const unexpectedSourceFiles = [...sourceFiles].filter((relativePath) => !manifestPaths.has(relativePath));
	if (unexpectedSourceFiles.length > 0) {
		throw new Error(
			`Source TradingView package contains assets absent from its manifest: ${unexpectedSourceFiles.join(", ")}`,
		);
	}

	for (const [relativePath, entry] of manifest.files) {
		const contents = await readRegularFile(
			resolve(sourceChartRoot, relativePath),
			`Manifest TradingView asset ${relativePath}`,
		);
		if (contents.length !== entry.size) {
			throw new Error(
				`TradingView source asset ${relativePath} has size ${contents.length}; manifest requires ${entry.size}.`,
			);
		}
		const sha256 = createHash("sha256").update(contents).digest("hex");
		if (sha256 !== entry.sha256) {
			throw new Error(`TradingView source asset ${relativePath} does not match its manifest SHA-256.`);
		}
	}

	const packageMetadata = readPackageMetadata(
		await readRegularFile(resolve(sourceChartRoot, "package.json"), "TradingView package.json"),
	);
	if (
		manifest.packageVersion !== packageMetadata.packageVersion ||
		manifest.packageDescription !== packageMetadata.packageDescription
	) {
		throw new Error(
			`TradingView manifest identifies ${manifest.packageVersion}/${manifest.packageDescription}; package.json identifies ${packageMetadata.packageVersion}/${packageMetadata.packageDescription}.`,
		);
	}
}

async function verifyChartBuild(sourcePublicRoot, outputPublicRoot, manifestPath) {
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

	const manifest = await readManifest(resolve(manifestPath));
	await assertSourceMatchesManifest(sourceChartRoot, sourceFiles, manifest);
	const hashedEntry = await readHashedChartEntryName(sourceChartRoot);

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

	for (const relativePath of outputFiles) {
		if (sourceFiles.has(relativePath)) {
			continue;
		}
		if (relativePath === hashedEntry) {
			await assertIdentical(
				resolve(sourceChartRoot, CHART_ENTRY_FILE),
				resolve(outputChartRoot, relativePath),
				`Content-hashed TradingView entry ${relativePath}`,
			);
			continue;
		}
		if (HASHED_CHART_ENTRY.test(relativePath)) {
			throw new Error(`Build output contains a TradingView entry from another package: ${relativePath}`);
		}
		const suffix = getCompressionSuffix(relativePath);
		const baseRelativePath = suffix ? relativePath.slice(0, -suffix.length) : undefined;
		if (!baseRelativePath || !(sourceFiles.has(baseRelativePath) || baseRelativePath === hashedEntry)) {
			throw new Error(`Build output contains unexpected TradingView asset: ${relativePath}`);
		}
		await assertValidCompressedAsset(outputChartRoot, relativePath, baseRelativePath);
	}

	for (const themeFile of ["tradingview-theme-dark.css", "tradingview-theme-light.css"]) {
		await assertIdentical(
			resolve(sourcePublicRoot, themeFile),
			resolve(outputPublicRoot, themeFile),
			`TradingView ${themeFile} theme stylesheet`,
		);
	}
}

async function generateManifest(sourcePublicRoot, manifestPath) {
	const sourceChartRoot = resolve(sourcePublicRoot, "charting_library");
	const sourceFiles = await listFiles(sourceChartRoot);
	for (const relativePath of REQUIRED_CHART_FILES) {
		if (!sourceFiles.includes(relativePath)) {
			throw new Error(`Source TradingView package is missing required asset: ${relativePath}`);
		}
	}
	const packageMetadata = readPackageMetadata(
		await readRegularFile(resolve(sourceChartRoot, "package.json"), "TradingView package.json"),
	);
	const files = [];
	for (const relativePath of sourceFiles) {
		const contents = await readRegularFile(
			resolve(sourceChartRoot, relativePath),
			`TradingView asset ${relativePath}`,
		);
		files.push({
			path: relativePath,
			sha256: createHash("sha256").update(contents).digest("hex"),
			size: contents.length,
		});
	}
	const manifest = {
		schemaVersion: MANIFEST_SCHEMA_VERSION,
		...packageMetadata,
		files,
	};
	await writeFile(resolve(manifestPath), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
}

const arguments_ = process.argv.slice(2);
if (arguments_[0] === "--generate-manifest") {
	const [, sourcePublicRoot, manifestPath] = arguments_;
	if (!sourcePublicRoot || !manifestPath || arguments_.length !== 3) {
		throw new Error(
			"Usage: node deploy/verify-chart-build.mjs --generate-manifest <source-public-root> <manifest-path>",
		);
	}
	await generateManifest(sourcePublicRoot, manifestPath);
} else {
	const [sourcePublicRoot, outputPublicRoot, manifestPath] = arguments_;
	if (!sourcePublicRoot || !outputPublicRoot || !manifestPath || arguments_.length !== 3) {
		throw new Error(
			"Usage: node deploy/verify-chart-build.mjs <source-public-root> <output-public-root> <manifest-path>",
		);
	}
	await verifyChartBuild(sourcePublicRoot, outputPublicRoot, manifestPath);
}
