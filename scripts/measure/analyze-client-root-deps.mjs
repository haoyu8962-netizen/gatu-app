/**
 * Audits the production client-root static chunk closure and, when supplied with
 * rollup-plugin-visualizer stats, apportions the closure's measured gzip bytes
 * across the modules that Rollup placed in each chunk.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import {
	readClientChunkGraphFile,
	resolveClientChunkGraphCacheFile,
	validateClientChunkGraphAgainstAssets,
} from "../client-chunk-graph.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(HERE, "../..");
const DEFAULT_ASSETS_DIRECTORY = resolve(REPOSITORY_ROOT, "apps/terminal/.output/public/assets");
const DEFAULT_GRAPH_FILE = resolveClientChunkGraphCacheFile(resolve(REPOSITORY_ROOT, "apps/terminal"));
const DEFAULT_STATS_FILE = resolve(REPOSITORY_ROOT, "apps/terminal/dist/stats.html");
const DEFAULT_OUTPUT_FILE = resolve(HERE, "out/client-root-deps.json");

const GROUP_DEFINITIONS = [
	{
		key: "privyReactAuth",
		label: "@privy-io/react-auth",
		matchers: ["/node_modules/@privy-io/react-auth/"],
	},
	{
		key: "smartWallets",
		label: "@privy-io/react-auth/smart-wallets",
		matchers: [
			"/node_modules/@privy-io/react-auth/smart-wallets",
			"/node_modules/@privy-io/react-auth/dist/esm/smart-wallets.",
			"/node_modules/@privy-io/react-auth/dist/cjs/smart-wallets.",
		],
	},
	{
		key: "privyWagmi",
		label: "@privy-io/wagmi",
		matchers: ["/node_modules/@privy-io/wagmi/"],
	},
	{
		key: "walletConnect",
		label: "WalletConnect",
		matchers: ["/node_modules/@walletconnect/"],
	},
	{
		key: "crypto",
		label: "cryptography libraries",
		matchers: [
			"/node_modules/@chainsafe/as-sha256/",
			"/node_modules/@ecies/ciphers/",
			"/node_modules/@metamask/eth-sig-util/",
			"/node_modules/@noble/",
			"/node_modules/@scure/",
			"/node_modules/@stablelib/",
			"/node_modules/aes-js/",
			"/node_modules/crypto-js/",
			"/node_modules/ethereum-cryptography/",
			"/node_modules/iron-webcrypto/",
			"/node_modules/keccak/",
			"/node_modules/secp256k1/",
			"/node_modules/sha.js/",
			"/node_modules/tweetnacl/",
		],
	},
	{
		key: "hlReact",
		label: "@sairn/hl-react",
		matchers: ["/node_modules/@sairn/hl-react/", "/packages/hl-react/"],
	},
];

const WALLET_UNION_GROUP_KEYS = ["privyReactAuth", "smartWallets", "privyWagmi", "walletConnect", "crypto"];

const args = parseArguments(process.argv.slice(2));
if (args.help) {
	printHelp();
	process.exit(0);
}

const assetsDirectory = resolveInputPath(args.assets ?? DEFAULT_ASSETS_DIRECTORY);
const graphFile = resolveInputPath(args.graph ?? DEFAULT_GRAPH_FILE);
const outputFile = resolveInputPath(args.out ?? DEFAULT_OUTPUT_FILE);
const statsFile = resolveStatsFile(args.stats);

assertDirectory(assetsDirectory, "client assets directory");
if (statsFile) assertFile(statsFile, "visualizer stats file");

const clientChunkGraph = readClientChunkGraphFile(graphFile);
const emittedAssetFiles = readdirSync(assetsDirectory)
	.filter((file) => file.endsWith(".js") || file.endsWith(".css"))
	.sort();
validateClientChunkGraphAgainstAssets(clientChunkGraph, emittedAssetFiles);
const graph = readChunkGraph(assetsDirectory, clientChunkGraph);
const entryAsset = resolveEntryAsset(graph.files, args.entry);
const closure = buildStaticClosure(entryAsset, graph);
const warnings = [];
const attribution = statsFile
	? buildModuleAttribution({ statsFile, closure, warnings })
	: buildUnavailableAttribution(closure);

const payload = {
	schemaVersion: 1,
	generatedAt: new Date().toISOString(),
	inputs: {
		assetsDirectory: displayPath(assetsDirectory),
		graphFile: displayPath(graphFile),
		entryAsset,
		statsFile: statsFile ? displayPath(statsFile) : null,
		outputFile: displayPath(outputFile),
	},
	definitions: {
		staticClosure:
			"Entry chunk plus transitive JavaScript imports from the production Rollup graph. Dynamic import() edges are deliberately excluded.",
		chunkGzipBytes: "gzipSync over the emitted chunk bytes, matching scripts/check-client-bundle-budget.mjs.",
		visualizerGzipBytes:
			"rollup-plugin-visualizer gzipLength for each module in isolation; used only as a proportional allocation weight.",
		allocatedGzipBytes:
			"Each emitted chunk's measured gzip bytes apportioned to its modules by visualizer gzipLength (rendered length or equal weights as fallback) with largest-remainder integer reconciliation.",
		inclusive:
			"Directly matched modules plus their transitive static module imports that have emitted parts inside the client-root chunk closure.",
		walletUnion: `Deduplicated union of inclusive ${WALLET_UNION_GROUP_KEYS.join(", ")}; @sairn/hl-react is reported separately.`,
		unmatched:
			"Emitted closure modules outside every reported inclusive group. Chunks without matching visualizer module parts are reported separately as unallocated chunks.",
	},
	closure,
	attribution,
	warnings,
};

mkdirSync(dirname(outputFile), { recursive: true });
writeFileSync(outputFile, `${JSON.stringify(payload, null, 2)}\n`);
printSummary(payload);

function parseArguments(rawArguments) {
	const parsed = {};
	const valueOptions = new Set(["assets", "entry", "graph", "stats", "out"]);

	for (let index = 0; index < rawArguments.length; index++) {
		const argument = rawArguments[index];
		if (argument === "--help" || argument === "-h") {
			parsed.help = true;
			continue;
		}
		if (!argument.startsWith("--")) throw new Error(`Unexpected positional argument: ${argument}`);

		const separatorIndex = argument.indexOf("=");
		const key = argument.slice(2, separatorIndex === -1 ? undefined : separatorIndex);
		if (!valueOptions.has(key)) throw new Error(`Unknown option: --${key}`);

		const inlineValue = separatorIndex === -1 ? undefined : argument.slice(separatorIndex + 1);
		const nextValue = inlineValue ?? rawArguments[index + 1];
		if (!nextValue || (inlineValue === undefined && nextValue.startsWith("--"))) {
			throw new Error(`Option --${key} requires a value`);
		}
		parsed[key] = nextValue;
		if (inlineValue === undefined) index++;
	}

	return parsed;
}

function printHelp() {
	process.stdout.write(`Usage: node scripts/measure/analyze-client-root-deps.mjs [options]\n\n`);
	process.stdout.write(`Options:\n`);
	process.stdout.write(`  --assets <dir>  Client asset directory (default: apps/terminal/.output/public/assets)\n`);
	process.stdout.write(`  --entry <file>  Exact client-root chunk filename; auto-detected when omitted\n`);
	process.stdout.write(`  --graph <file>  Client chunk graph cache generated by the production build\n`);
	process.stdout.write(`  --stats <file>  Visualizer stats HTML/JSON; use "none" to disable auto-detection\n`);
	process.stdout.write(`  --out <file>    JSON output (default: scripts/measure/out/client-root-deps.json)\n`);
	process.stdout.write(`  --help, -h      Show this help\n\n`);
	process.stdout.write(`When --stats is omitted, apps/terminal/dist/stats.html is used if it exists.\n`);
}

function resolveInputPath(value) {
	return resolve(process.cwd(), String(value));
}

function resolveStatsFile(value) {
	if (value === "none") return null;
	if (value !== undefined) return resolveInputPath(value);
	return existsSync(DEFAULT_STATS_FILE) ? DEFAULT_STATS_FILE : null;
}

function assertDirectory(pathname, label) {
	if (!existsSync(pathname) || !statSync(pathname).isDirectory()) {
		throw new Error(`${label} does not exist or is not a directory: ${pathname}`);
	}
}

function assertFile(pathname, label) {
	if (!existsSync(pathname) || !statSync(pathname).isFile()) {
		throw new Error(`${label} does not exist or is not a file: ${pathname}`);
	}
}

function readChunkGraph(directory, clientChunkGraph) {
	const files = clientChunkGraph.assets.filter((file) => file.endsWith(".js"));
	const importsByFile = new Map();
	const unresolvedByFile = new Map();
	const sizesByFile = new Map();

	for (const file of files) {
		const absoluteFile = resolve(directory, file);
		const content = readFileSync(absoluteFile);
		const chunk = clientChunkGraph.chunks[file];
		if (!chunk) throw new Error(`Client chunk graph metadata was not found for ${file}`);
		importsByFile.set(file, new Set(chunk.imports.filter((dependency) => dependency.endsWith(".js"))));
		unresolvedByFile.set(file, new Set());
		sizesByFile.set(file, { rawBytes: content.length, gzipBytes: gzipSync(content).length });
	}

	return { directory, files, importsByFile, unresolvedByFile, sizesByFile };
}

function resolveEntryAsset(files, requestedEntry) {
	if (requestedEntry) {
		const normalizedEntry = normalizePath(requestedEntry);
		if (!files.includes(normalizedEntry)) throw new Error(`Requested entry chunk was not found: ${requestedEntry}`);
		return normalizedEntry;
	}

	const matches = files.filter((file) => /^client-root-[^/]+\.js$/.test(basename(file)));
	if (matches.length !== 1) {
		throw new Error(
			`Expected exactly one client-root-*.js entry chunk, found ${matches.length}: ${matches.join(", ")}`,
		);
	}
	return matches[0];
}

function buildStaticClosure(entry, graph) {
	const depths = new Map([[entry, 0]]);
	const queue = [entry];
	const closureSet = new Set();

	while (queue.length > 0) {
		const file = queue.shift();
		if (closureSet.has(file)) continue;
		closureSet.add(file);
		const nextDepth = (depths.get(file) ?? 0) + 1;
		for (const dependency of graph.importsByFile.get(file) ?? []) {
			const previousDepth = depths.get(dependency);
			if (previousDepth === undefined || nextDepth < previousDepth) depths.set(dependency, nextDepth);
			queue.push(dependency);
		}
	}

	const parentsByFile = new Map([...closureSet].map((file) => [file, new Set()]));
	const edges = [];
	for (const from of closureSet) {
		for (const to of graph.importsByFile.get(from) ?? []) {
			if (!closureSet.has(to)) continue;
			edges.push({ from, to });
			parentsByFile.get(to).add(from);
		}
	}
	edges.sort((left, right) => left.from.localeCompare(right.from) || left.to.localeCompare(right.to));

	const chunks = [...closureSet]
		.map((file) => {
			const sizes = graph.sizesByFile.get(file);
			return {
				file,
				depth: depths.get(file),
				rawBytes: sizes.rawBytes,
				gzipBytes: sizes.gzipBytes,
				parents: [...parentsByFile.get(file)].sort((left, right) => left.localeCompare(right)),
				staticImports: [...(graph.importsByFile.get(file) ?? [])]
					.filter((dependency) => closureSet.has(dependency))
					.sort((left, right) => left.localeCompare(right)),
				unresolvedStaticImports: [...(graph.unresolvedByFile.get(file) ?? [])].sort((left, right) =>
					left.localeCompare(right),
				),
			};
		})
		.sort((left, right) => left.depth - right.depth || left.file.localeCompare(right.file));

	return {
		entry,
		chunkCount: chunks.length,
		rawBytes: chunks.reduce((total, chunk) => total + chunk.rawBytes, 0),
		gzipBytes: chunks.reduce((total, chunk) => total + chunk.gzipBytes, 0),
		chunks,
		edges,
	};
}

function buildUnavailableAttribution(closure) {
	return {
		available: false,
		reason:
			"No visualizer stats file was supplied or auto-detected. The chunk closure is exact, but module-level attribution is unavailable.",
		groups: Object.fromEntries(
			GROUP_DEFINITIONS.map((group) => [
				group.key,
				{ label: group.label, matchers: group.matchers, direct: null, inclusive: null },
			]),
		),
		walletUnion: { groupKeys: WALLET_UNION_GROUP_KEYS, inclusive: null, deduplication: null },
		unmatched: {
			moduleAttributionAvailable: false,
			unallocatedChunks: closure.chunks.map(({ file, gzipBytes }) => ({ file, gzipBytes })),
		},
	};
}

function buildModuleAttribution({ statsFile, closure, warnings }) {
	const stats = readVisualizerStats(statsFile);
	const closureByBasename = indexClosureByBasename(closure.chunks);
	const closureFiles = new Set(closure.chunks.map((chunk) => chunk.file));
	const chunkParts = new Map([...closureFiles].map((file) => [file, []]));
	const moduleRecords = new Map();
	const missingNodeParts = [];
	const matchedStatsBundleIds = new Set();

	for (const [moduleUid, meta] of Object.entries(stats.nodeMetas)) {
		if (!meta || typeof meta.id !== "string" || !meta.moduleParts || typeof meta.moduleParts !== "object") continue;
		for (const [bundleId, partUid] of Object.entries(meta.moduleParts)) {
			const closureFile = matchClosureFile(bundleId, closureFiles, closureByBasename);
			if (!closureFile) continue;
			matchedStatsBundleIds.add(bundleId);
			const part = stats.nodeParts[partUid];
			if (!part) {
				missingNodeParts.push({ moduleUid, moduleId: meta.id, bundleId, partUid });
				continue;
			}

			let moduleRecord = moduleRecords.get(moduleUid);
			if (!moduleRecord) {
				moduleRecord = { uid: moduleUid, id: meta.id, parts: [] };
				moduleRecords.set(moduleUid, moduleRecord);
			}
			const partRecord = {
				uid: partUid,
				chunk: closureFile,
				renderedBytes: finiteNonNegative(part.renderedLength),
				visualizerGzipBytes: finiteNonNegative(part.gzipLength),
				visualizerBrotliBytes: finiteNonNegative(part.brotliLength),
				allocatedGzipBytes: 0,
			};
			moduleRecord.parts.push(partRecord);
			chunkParts.get(closureFile).push({ moduleUid, moduleId: meta.id, ...partRecord });
		}
	}

	if (moduleRecords.size === 0) {
		throw new Error(
			`Visualizer stats did not contain module parts for any chunk in the ${closure.entry} static closure; the stats likely came from a different build`,
		);
	}

	const allocationChunks = [];
	const unallocatedChunks = [];
	for (const chunk of closure.chunks) {
		const parts = chunkParts.get(chunk.file);
		if (parts.length === 0) {
			unallocatedChunks.push({ file: chunk.file, gzipBytes: chunk.gzipBytes });
			continue;
		}

		const allocation = allocateChunkGzip(chunk.gzipBytes, parts);
		for (const allocatedPart of allocation.parts) {
			const moduleRecord = moduleRecords.get(allocatedPart.moduleUid);
			const modulePart = moduleRecord.parts.find((part) => part.uid === allocatedPart.uid);
			modulePart.allocatedGzipBytes = allocatedPart.allocatedGzipBytes;
		}
		allocationChunks.push({
			file: chunk.file,
			gzipBytes: chunk.gzipBytes,
			modulePartCount: allocation.parts.length,
			weightBasis: allocation.weightBasis,
			weightTotal: allocation.weightTotal,
			allocatedGzipBytes: allocation.parts.reduce((total, part) => total + part.allocatedGzipBytes, 0),
		});
	}

	for (const moduleRecord of moduleRecords.values()) {
		moduleRecord.parts.sort(
			(left, right) => left.chunk.localeCompare(right.chunk) || left.uid.localeCompare(right.uid),
		);
		moduleRecord.renderedBytes = moduleRecord.parts.reduce((total, part) => total + part.renderedBytes, 0);
		moduleRecord.visualizerGzipBytes = moduleRecord.parts.reduce((total, part) => total + part.visualizerGzipBytes, 0);
		moduleRecord.allocatedGzipBytes = moduleRecord.parts.reduce((total, part) => total + part.allocatedGzipBytes, 0);
	}

	const moduleSets = new Map();
	const groups = {};
	for (const group of GROUP_DEFINITIONS) {
		const direct = new Set(
			[...moduleRecords.values()]
				.filter((moduleRecord) => matchesGroup(moduleRecord.id, group))
				.map((moduleRecord) => moduleRecord.uid),
		);
		const inclusive = collectStaticModuleDescendants(direct, stats.nodeMetas, moduleRecords);
		moduleSets.set(group.key, inclusive);
		groups[group.key] = {
			label: group.label,
			matchers: group.matchers,
			direct: summarizeModuleSet(direct, moduleRecords, closure.gzipBytes),
			inclusive: summarizeModuleSet(inclusive, moduleRecords, closure.gzipBytes),
		};
		if (direct.size === 0) warnings.push(`No direct ${group.label} modules matched inside the client-root closure.`);
	}

	const walletUnionSet = unionSets(WALLET_UNION_GROUP_KEYS.map((key) => moduleSets.get(key)));
	const walletUnionInclusive = summarizeModuleSet(walletUnionSet, moduleRecords, closure.gzipBytes);
	const walletNaiveInclusiveGzipBytes = WALLET_UNION_GROUP_KEYS.reduce(
		(total, key) => total + groups[key].inclusive.allocatedGzipBytes,
		0,
	);
	const walletDeduplicationSavingsBytes = walletNaiveInclusiveGzipBytes - walletUnionInclusive.allocatedGzipBytes;
	const allGroupUnionSet = unionSets([...moduleSets.values()]);
	const unmatchedSet = new Set([...moduleRecords.keys()].filter((moduleUid) => !allGroupUnionSet.has(moduleUid)));
	const overlap = summarizeOverlaps(moduleSets, moduleRecords, closure.gzipBytes);
	const allocatedChunkGzipBytes = allocationChunks.reduce((total, chunk) => total + chunk.allocatedGzipBytes, 0);
	const unallocatedChunkGzipBytes = unallocatedChunks.reduce((total, chunk) => total + chunk.gzipBytes, 0);
	const moduleAllocatedGzipBytes = [...moduleRecords.values()].reduce(
		(total, moduleRecord) => total + moduleRecord.allocatedGzipBytes,
		0,
	);

	if (unallocatedChunks.length > 0) {
		warnings.push(
			`${unallocatedChunks.length}/${closure.chunkCount} closure chunks had no matching visualizer module parts; module attribution is partial.`,
		);
	}
	if (missingNodeParts.length > 0) {
		warnings.push(`${missingNodeParts.length} visualizer module-part references were missing from nodeParts.`);
	}

	return {
		available: true,
		complete: unallocatedChunks.length === 0 && missingNodeParts.length === 0,
		method: "per-chunk proportional allocation with largest-remainder reconciliation",
		stats: {
			version: stats.version ?? null,
			options: stats.options ?? null,
			matchedBundleIds: [...matchedStatsBundleIds].sort((left, right) => left.localeCompare(right)),
			missingNodeParts,
		},
		reconciliation: {
			closureGzipBytes: closure.gzipBytes,
			allocatedChunkGzipBytes,
			moduleAllocatedGzipBytes,
			unallocatedChunkGzipBytes,
			reconciledGzipBytes: moduleAllocatedGzipBytes + unallocatedChunkGzipBytes,
			differenceBytes: closure.gzipBytes - moduleAllocatedGzipBytes - unallocatedChunkGzipBytes,
			allocationCoverage: ratio(allocatedChunkGzipBytes, closure.gzipBytes),
		},
		allocationChunks,
		moduleAllocations: [...moduleRecords.values()]
			.sort((left, right) => right.allocatedGzipBytes - left.allocatedGzipBytes || left.id.localeCompare(right.id))
			.map(serializeModuleRecord),
		groups,
		walletUnion: {
			groupKeys: WALLET_UNION_GROUP_KEYS,
			inclusive: walletUnionInclusive,
			deduplication: {
				naiveInclusiveGzipBytes: walletNaiveInclusiveGzipBytes,
				uniqueInclusiveGzipBytes: walletUnionInclusive.allocatedGzipBytes,
				savingsBytes: walletDeduplicationSavingsBytes,
				savingsRatioOfNaive: ratio(walletDeduplicationSavingsBytes, walletNaiveInclusiveGzipBytes),
				uniqueRatioOfNaive: ratio(walletUnionInclusive.allocatedGzipBytes, walletNaiveInclusiveGzipBytes),
			},
		},
		overlap,
		unmatched: {
			modules: summarizeModuleSet(unmatchedSet, moduleRecords, closure.gzipBytes),
			unallocatedChunks,
		},
	};
}

function readVisualizerStats(statsFile) {
	const content = readFileSync(statsFile, "utf8");
	let parsed;
	if (extname(statsFile).toLowerCase() === ".json") {
		parsed = JSON.parse(content);
	} else {
		const runMarkerIndex = content.lastIndexOf("const run = () =>");
		const dataMarker = "const data = ";
		const dataMarkerIndex = content.lastIndexOf(dataMarker, runMarkerIndex);
		const dataEndIndex = content.lastIndexOf(";", runMarkerIndex);
		if (runMarkerIndex === -1 || dataMarkerIndex === -1 || dataEndIndex < dataMarkerIndex) {
			throw new Error(`Could not locate rollup-plugin-visualizer data in ${statsFile}`);
		}
		const json = content.slice(dataMarkerIndex + dataMarker.length, dataEndIndex).trim();
		parsed = JSON.parse(json);
	}

	if (!parsed || typeof parsed !== "object" || !parsed.nodeMetas || !parsed.nodeParts) {
		throw new Error(`Visualizer stats are missing nodeMetas or nodeParts: ${statsFile}`);
	}
	return parsed;
}

function indexClosureByBasename(chunks) {
	const index = new Map();
	for (const chunk of chunks) {
		const key = basename(chunk.file);
		const existing = index.get(key);
		if (existing && existing !== chunk.file) {
			throw new Error(`Client-root closure contains duplicate chunk basenames: ${existing}, ${chunk.file}`);
		}
		index.set(key, chunk.file);
	}
	return index;
}

function matchClosureFile(bundleId, closureFiles, closureByBasename) {
	const normalizedBundleId = normalizePath(String(bundleId).split(/[?#]/, 1)[0]).replace(/^\.\//, "");
	if (closureFiles.has(normalizedBundleId)) return normalizedBundleId;
	return closureByBasename.get(basename(normalizedBundleId)) ?? null;
}

function allocateChunkGzip(chunkGzipBytes, rawParts) {
	const parts = rawParts.map((part) => ({ ...part }));
	const visualizerGzipTotal = parts.reduce((total, part) => total + part.visualizerGzipBytes, 0);
	const renderedTotal = parts.reduce((total, part) => total + part.renderedBytes, 0);
	const weightBasis = visualizerGzipTotal > 0 ? "visualizerGzipBytes" : renderedTotal > 0 ? "renderedBytes" : "equal";
	const weightTotal =
		weightBasis === "visualizerGzipBytes"
			? visualizerGzipTotal
			: weightBasis === "renderedBytes"
				? renderedTotal
				: parts.length;

	for (const part of parts) {
		const weight =
			weightBasis === "visualizerGzipBytes"
				? part.visualizerGzipBytes
				: weightBasis === "renderedBytes"
					? part.renderedBytes
					: 1;
		const exactShare = (chunkGzipBytes * weight) / weightTotal;
		part.allocatedGzipBytes = Math.floor(exactShare);
		part.allocationRemainder = exactShare - part.allocatedGzipBytes;
	}

	let remaining = chunkGzipBytes - parts.reduce((total, part) => total + part.allocatedGzipBytes, 0);
	const remainderOrder = [...parts].sort(
		(left, right) =>
			right.allocationRemainder - left.allocationRemainder ||
			left.moduleId.localeCompare(right.moduleId) ||
			left.uid.localeCompare(right.uid),
	);
	for (let index = 0; remaining > 0; index++, remaining--) {
		remainderOrder[index % remainderOrder.length].allocatedGzipBytes++;
	}

	for (const part of parts) delete part.allocationRemainder;
	return { parts, weightBasis, weightTotal };
}

function matchesGroup(moduleId, group) {
	const normalizedId = normalizeModuleId(moduleId);
	return group.matchers.some((matcher) => normalizedId.includes(matcher));
}

function collectStaticModuleDescendants(seeds, nodeMetas, moduleRecords) {
	const visited = new Set();
	const inclusive = new Set();
	const queue = [...seeds];

	for (let index = 0; index < queue.length; index++) {
		const moduleUid = queue[index];
		if (visited.has(moduleUid)) continue;
		visited.add(moduleUid);
		if (moduleRecords.has(moduleUid)) inclusive.add(moduleUid);
		const meta = nodeMetas[moduleUid];
		for (const imported of meta?.imported ?? []) {
			if (!imported || imported.dynamic === true || typeof imported.uid !== "string") continue;
			queue.push(imported.uid);
		}
	}

	return inclusive;
}

function summarizeModuleSet(moduleUids, moduleRecords, closureGzipBytes) {
	const records = [...moduleUids].map((moduleUid) => moduleRecords.get(moduleUid)).filter(Boolean);
	const allocatedGzipBytes = records.reduce((total, record) => total + record.allocatedGzipBytes, 0);
	const chunks = new Map();

	for (const record of records) {
		for (const part of record.parts) {
			let chunk = chunks.get(part.chunk);
			if (!chunk) {
				chunk = { file: part.chunk, moduleUids: new Set(), allocatedGzipBytes: 0 };
				chunks.set(part.chunk, chunk);
			}
			chunk.moduleUids.add(record.uid);
			chunk.allocatedGzipBytes += part.allocatedGzipBytes;
		}
	}

	return {
		moduleCount: records.length,
		partCount: records.reduce((total, record) => total + record.parts.length, 0),
		renderedBytes: records.reduce((total, record) => total + record.renderedBytes, 0),
		visualizerGzipBytes: records.reduce((total, record) => total + record.visualizerGzipBytes, 0),
		allocatedGzipBytes,
		shareOfClosureGzip: ratio(allocatedGzipBytes, closureGzipBytes),
		chunks: [...chunks.values()]
			.map((chunk) => ({
				file: chunk.file,
				moduleCount: chunk.moduleUids.size,
				allocatedGzipBytes: chunk.allocatedGzipBytes,
			}))
			.sort((left, right) => right.allocatedGzipBytes - left.allocatedGzipBytes || left.file.localeCompare(right.file)),
		modules: records.map((record) => record.id).sort((left, right) => left.localeCompare(right)),
	};
}

function serializeModuleRecord(record) {
	return {
		uid: record.uid,
		id: record.id,
		renderedBytes: record.renderedBytes,
		visualizerGzipBytes: record.visualizerGzipBytes,
		allocatedGzipBytes: record.allocatedGzipBytes,
		parts: record.parts,
	};
}

function summarizeOverlaps(moduleSets, moduleRecords, closureGzipBytes) {
	const memberships = new Map();
	for (const [groupKey, moduleSet] of moduleSets) {
		for (const moduleUid of moduleSet) {
			const groups = memberships.get(moduleUid) ?? [];
			groups.push(groupKey);
			memberships.set(moduleUid, groups);
		}
	}

	const overlappingModules = [...memberships]
		.filter(([, groups]) => groups.length > 1)
		.map(([moduleUid, groups]) => {
			const moduleRecord = moduleRecords.get(moduleUid);
			return {
				id: moduleRecord.id,
				groups: groups.sort((left, right) => left.localeCompare(right)),
				allocatedGzipBytes: moduleRecord.allocatedGzipBytes,
			};
		})
		.sort((left, right) => right.allocatedGzipBytes - left.allocatedGzipBytes || left.id.localeCompare(right.id));
	const allocatedGzipBytes = overlappingModules.reduce((total, moduleRecord) => {
		return total + moduleRecord.allocatedGzipBytes;
	}, 0);
	const combinations = new Map();
	for (const moduleRecord of overlappingModules) {
		const combinationKey = moduleRecord.groups.join("+");
		let combination = combinations.get(combinationKey);
		if (!combination) {
			combination = { groups: moduleRecord.groups, moduleCount: 0, allocatedGzipBytes: 0 };
			combinations.set(combinationKey, combination);
		}
		combination.moduleCount++;
		combination.allocatedGzipBytes += moduleRecord.allocatedGzipBytes;
	}

	return {
		moduleCount: overlappingModules.length,
		allocatedGzipBytes,
		shareOfClosureGzip: ratio(allocatedGzipBytes, closureGzipBytes),
		byGroupCombination: [...combinations.values()]
			.map((combination) => ({
				...combination,
				shareOfClosureGzip: ratio(combination.allocatedGzipBytes, closureGzipBytes),
			}))
			.sort(
				(left, right) =>
					right.allocatedGzipBytes - left.allocatedGzipBytes ||
					left.groups.join("+").localeCompare(right.groups.join("+")),
			),
		modules: overlappingModules,
	};
}

function unionSets(sets) {
	const union = new Set();
	for (const set of sets) {
		for (const value of set ?? []) union.add(value);
	}
	return union;
}

function finiteNonNegative(value) {
	return Number.isFinite(value) && value >= 0 ? value : 0;
}

function ratio(numerator, denominator) {
	return denominator === 0 ? null : Number((numerator / denominator).toFixed(6));
}

function normalizeModuleId(moduleId) {
	let normalized = normalizePath(String(moduleId)).toLowerCase();
	if (!normalized.startsWith("/")) normalized = `/${normalized}`;
	return normalized;
}

function normalizePath(pathname) {
	return String(pathname).split(sep).join("/").replaceAll("\\", "/");
}

function displayPath(pathname) {
	const relativePath = normalizePath(relative(REPOSITORY_ROOT, pathname));
	return relativePath && !relativePath.startsWith("../") ? relativePath : normalizePath(pathname);
}

function printSummary(payload) {
	process.stdout.write(
		`Client-root static closure: ${payload.closure.chunkCount} chunks / ${payload.closure.gzipBytes} gzip bytes.\n`,
	);
	if (payload.attribution.available) {
		const reconciliation = payload.attribution.reconciliation;
		process.stdout.write(
			`Visualizer attribution: ${reconciliation.allocatedChunkGzipBytes}/${reconciliation.closureGzipBytes} gzip bytes covered.\n`,
		);
		for (const [key, group] of Object.entries(payload.attribution.groups)) {
			process.stdout.write(
				`- ${key}: ${group.inclusive.allocatedGzipBytes} gzip bytes (${formatPercent(group.inclusive.shareOfClosureGzip)}) inclusive\n`,
			);
		}
		const walletUnion = payload.attribution.walletUnion.inclusive;
		process.stdout.write(
			`- walletUnion: ${walletUnion.allocatedGzipBytes} gzip bytes (${formatPercent(walletUnion.shareOfClosureGzip)}) deduplicated\n`,
		);
	} else {
		process.stdout.write("Visualizer stats unavailable; wrote chunk-level closure without module attribution.\n");
	}
	process.stdout.write(`Wrote ${displayPath(outputFile)}\n`);
}

function formatPercent(value) {
	return value === null ? "n/a" : `${(value * 100).toFixed(2)}%`;
}
