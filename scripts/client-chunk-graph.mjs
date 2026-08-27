import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, posix, relative, resolve, sep } from "node:path";

export const CLIENT_CHUNK_GRAPH_FILE = "client-chunk-graph.json";

function isClientGraphAsset(file) {
	return file.endsWith(".js") || file.endsWith(".css");
}

export function resolveClientChunkGraphCacheFile(terminalDirectory) {
	return resolve(terminalDirectory, "node_modules/.cache/gatu", CLIENT_CHUNK_GRAPH_FILE);
}

export function removeClientChunkGraphFile(graphFile) {
	rmSync(graphFile, { force: true });
}

export function writeClientChunkGraphFile(graphFile, graph) {
	const serializedGraph = `${JSON.stringify(graph, null, 2)}\n`;
	const temporaryFile = resolve(dirname(graphFile), `.${CLIENT_CHUNK_GRAPH_FILE}.${process.pid}-${randomUUID()}.tmp`);

	mkdirSync(dirname(graphFile), { recursive: true });
	try {
		writeFileSync(temporaryFile, serializedGraph, { encoding: "utf8", flag: "wx" });
		renameSync(temporaryFile, graphFile);
	} catch (error) {
		rmSync(temporaryFile, { force: true });
		throw error;
	}
}

function normalizeModuleId(moduleId, repositoryRoot) {
	const pathname = moduleId.replace(/\?.*$/, "");
	if (!isAbsolute(pathname)) return undefined;

	const repositoryRelativePath = relative(repositoryRoot, pathname);
	if (
		repositoryRelativePath === ".." ||
		repositoryRelativePath.startsWith(`..${sep}`) ||
		isAbsolute(repositoryRelativePath)
	) {
		return undefined;
	}

	return repositoryRelativePath.split(sep).join(posix.sep);
}

function normalizeOutputFile(fileName) {
	return posix.basename(fileName);
}

export function createClientChunkGraph(bundle, repositoryRoot) {
	const chunks = {};
	const assets = [];

	for (const output of Object.values(bundle)) {
		const file = normalizeOutputFile(output.fileName);
		if (isClientGraphAsset(file)) assets.push(file);
		if (output.type !== "chunk") continue;

		if (chunks[file]) throw new Error(`duplicate client chunk basename ${file}`);

		const importedCss = output.viteMetadata?.importedCss ?? new Set();
		const importedAssets = output.viteMetadata?.importedAssets ?? new Set();
		chunks[file] = {
			modules: [
				...new Set(
					Object.keys(output.modules)
						.map((moduleId) => normalizeModuleId(moduleId, repositoryRoot))
						.filter((moduleId) => moduleId !== undefined),
				),
			].sort(),
			imports: [
				...new Set(
					[...output.imports, ...importedCss, ...importedAssets]
						.map(normalizeOutputFile)
						.filter(isClientGraphAsset),
				),
			].sort(),
			dynamicImports: [...new Set(output.dynamicImports.map(normalizeOutputFile))].sort(),
		};
	}

	const uniqueAssets = [...new Set(assets)].sort();
	if (uniqueAssets.length !== assets.length)
		throw new Error("duplicate client asset basename in chunk graph inventory");

	return { version: 3, assets: uniqueAssets, chunks };
}

export function parseClientChunkGraph(source) {
	const graph = JSON.parse(source);
	if (
		!graph ||
		graph.version !== 3 ||
		!Array.isArray(graph.assets) ||
		typeof graph.chunks !== "object" ||
		graph.chunks === null ||
		Array.isArray(graph.chunks)
	) {
		throw new Error("client chunk graph has an unsupported schema");
	}
	if (!graph.assets.every((file) => typeof file === "string" && (file.endsWith(".js") || file.endsWith(".css")))) {
		throw new Error("client chunk graph asset inventory is invalid");
	}

	const assetInventory = new Set(graph.assets);
	if (assetInventory.size !== graph.assets.length) {
		throw new Error("client chunk graph asset inventory contains duplicates");
	}

	for (const [file, chunk] of Object.entries(graph.chunks)) {
		if (
			!chunk ||
			typeof chunk !== "object" ||
			!Array.isArray(chunk.modules) ||
			!Array.isArray(chunk.imports) ||
			!Array.isArray(chunk.dynamicImports) ||
			![...chunk.modules, ...chunk.imports, ...chunk.dynamicImports].every((value) => typeof value === "string")
		) {
			throw new Error(`client chunk graph entry ${file} is invalid`);
		}
		if (!file.endsWith(".js") || !assetInventory.has(file)) {
			throw new Error(`client chunk graph metadata ${file} is not in the JavaScript asset inventory`);
		}
		for (const importedFile of [...chunk.imports, ...chunk.dynamicImports]) {
			if (!assetInventory.has(importedFile)) {
				throw new Error(`client chunk graph edge from ${file} references asset outside the inventory: ${importedFile}`);
			}
		}
	}

	for (const file of graph.assets) {
		if (file.endsWith(".js") && !graph.chunks[file]) {
			throw new Error(`client chunk graph JavaScript asset ${file} has no chunk metadata`);
		}
	}

	return graph;
}

export function readClientChunkGraphFile(graphFile) {
	if (!existsSync(graphFile)) {
		throw new Error(
			`client chunk graph cache was not found at ${graphFile}. Run "pnpm --filter @gatu/terminal build" to generate and check it.`,
		);
	}

	return parseClientChunkGraph(readFileSync(graphFile, "utf8"));
}

export function validateClientChunkGraphAgainstAssets(graph, assetFiles) {
	const inventory = new Set(graph.assets);
	const emittedAssets = new Set(assetFiles);
	const missingFromOutput = graph.assets.filter((file) => !emittedAssets.has(file));
	const missingFromInventory = [...emittedAssets].filter((file) => !inventory.has(file)).sort();
	const differences = [];
	if (missingFromOutput.length > 0) {
		differences.push(`graph inventory contains assets missing from client output: ${missingFromOutput.join(", ")}`);
	}
	if (missingFromInventory.length > 0) {
		differences.push(`client output contains assets missing from graph inventory: ${missingFromInventory.join(", ")}`);
	}
	if (differences.length > 0)
		throw new Error(`client chunk graph does not match emitted assets; ${differences.join("; ")}`);
}

export function findPublicClientChunkGraphArtifacts(publicDirectory) {
	const graphArtifactNames = new Set([
		CLIENT_CHUNK_GRAPH_FILE,
		`${CLIENT_CHUNK_GRAPH_FILE}.gz`,
		`${CLIENT_CHUNK_GRAPH_FILE}.br`,
		`${CLIENT_CHUNK_GRAPH_FILE}.zst`,
	]);
	const artifacts = [];
	const pendingDirectories = [publicDirectory];

	while (pendingDirectories.length > 0) {
		const directory = pendingDirectories.pop();
		if (!directory || !existsSync(directory)) continue;
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			const entryPath = resolve(directory, entry.name);
			if (entry.isDirectory()) pendingDirectories.push(entryPath);
			else if (graphArtifactNames.has(entry.name)) {
				artifacts.push(relative(publicDirectory, entryPath).split(sep).join(posix.sep));
			}
		}
	}

	return artifacts.sort();
}

export function findUniqueJavaScriptChunk(assetFiles, prefix) {
	const matches = assetFiles.filter((file) => file.startsWith(`${prefix}-`) && file.endsWith(".js"));
	if (matches.length === 0) throw new Error(`expected client chunk ${prefix}-*.js was not found`);
	if (matches.length > 1) {
		throw new Error(`expected one client chunk ${prefix}-*.js but found ${matches.length}`);
	}
	return matches[0];
}

export function collectChunkGraphStaticClosure({ graph, assetFiles, entryFiles }) {
	const assetFileSet = new Set(assetFiles);
	const closure = new Set();
	const pending = [...entryFiles];

	while (pending.length > 0) {
		const file = pending.pop();
		if (!file || closure.has(file)) continue;
		if (!assetFileSet.has(file)) throw new Error(`client chunk graph references missing asset ${file}`);
		closure.add(file);
		if (!file.endsWith(".js")) continue;

		const chunk = graph.chunks[file];
		if (!chunk) throw new Error(`client chunk graph metadata for ${file} was not found`);
		pending.push(...chunk.imports);
	}

	return closure;
}

export function findChunkContainingModule(graph, moduleId) {
	const matches = Object.entries(graph.chunks)
		.filter(([, chunk]) => chunk.modules.includes(moduleId))
		.map(([file]) => file);
	if (matches.length === 0) throw new Error(`expected client module ${moduleId} was not found in the chunk graph`);
	if (matches.length > 1) {
		throw new Error(
			`expected client module ${moduleId} in one chunk but found ${matches.length}: ${matches.join(", ")}`,
		);
	}
	return matches[0];
}

export function collectRuntimeStartupFiles({ graph, assetFiles, startupFiles, entryFiles, moduleIds }) {
	const entryDynamicFiles = entryFiles.flatMap((file) => {
		const chunk = graph.chunks[file];
		if (!chunk) throw new Error(`client chunk graph metadata for runtime entry ${file} was not found`);
		return chunk.dynamicImports;
	});
	const moduleEntryFiles = moduleIds.map((moduleId) => findChunkContainingModule(graph, moduleId));
	const runtimeClosure = collectChunkGraphStaticClosure({
		graph,
		assetFiles,
		entryFiles: [...entryDynamicFiles, ...moduleEntryFiles],
	});

	return new Set([...runtimeClosure].filter((file) => !startupFiles.has(file)));
}
