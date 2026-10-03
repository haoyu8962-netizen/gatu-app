import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import {
	collectTradeStartupFiles,
	describeLocalEnvFiles,
	findLocalEnvFiles,
	getBudgetIncreaseViolation,
	TRADE_DESKTOP_RUNTIME_MODULE_IDS,
} from "./check-client-bundle-budget.mjs";
import {
	collectChunkGraphStaticClosure,
	collectRuntimeStartupFiles,
	createClientChunkGraph,
	findChunkContainingModule,
	findPublicClientChunkGraphArtifacts,
	findUniqueJavaScriptChunk,
	parseClientChunkGraph,
	readClientChunkGraphFile,
	removeClientChunkGraphFile,
	validateClientChunkGraphAgainstAssets,
	writeClientChunkGraphFile,
} from "./client-chunk-graph.mjs";

const runtimeGraph = {
	version: 3,
	assets: ["entry.js", "hydrate.js", "lazy-root.js", "shared.js", "startup.css", "toast.js", "workspace.js"],
	chunks: {
		"entry.js": {
			modules: ["apps/terminal/src/entry.tsx"],
			imports: ["shared.js", "startup.css"],
			dynamicImports: ["hydrate.js"],
		},
		"hydrate.js": {
			modules: ["apps/terminal/src/hydrate.tsx"],
			imports: ["shared.js"],
			dynamicImports: ["lazy-root.js"],
		},
		"lazy-root.js": {
			modules: ["apps/terminal/src/providers/client-root.tsx"],
			imports: ["shared.js"],
			dynamicImports: [],
		},
		"shared.js": {
			modules: ["apps/terminal/src/shared.ts"],
			imports: [],
			dynamicImports: [],
		},
		"toast.js": {
			modules: ["apps/terminal/src/components/ui/sonner.tsx"],
			imports: ["shared.js"],
			dynamicImports: [],
		},
		"workspace.js": {
			modules: ["apps/terminal/src/components/trade/layout/main-workspace.tsx"],
			imports: ["shared.js"],
			dynamicImports: [],
		},
	},
};

test("creates a semantic client graph without exposing external module paths", () => {
	const graph = createClientChunkGraph(
		{
			"assets/entry.js": {
				type: "chunk",
				fileName: "assets/entry.js",
				modules: {
					"/repo/apps/terminal/src/entry.tsx?commonjs-entry": {},
					"/outside/private-package/index.js": {},
				},
				imports: ["assets/shared.js"],
				dynamicImports: ["assets/lazy.js"],
				viteMetadata: {
					importedAssets: new Set(["assets/font.woff2", "assets/url-styles.css"]),
					importedCss: new Set(["assets/styles.css"]),
				},
			},
			"assets/shared.js": {
				type: "chunk",
				fileName: "assets/shared.js",
				modules: {},
				imports: [],
				dynamicImports: [],
			},
			"assets/lazy.js": {
				type: "chunk",
				fileName: "assets/lazy.js",
				modules: {},
				imports: [],
				dynamicImports: [],
			},
			"assets/styles.css": { type: "asset", fileName: "assets/styles.css" },
			"assets/url-styles.css": { type: "asset", fileName: "assets/url-styles.css" },
			"assets/font.woff2": { type: "asset", fileName: "assets/font.woff2" },
			"charting_library/charting_library.0123456789abcdef.js": {
				type: "asset",
				fileName: "charting_library/charting_library.0123456789abcdef.js",
			},
			"build-meta.json": { type: "asset", fileName: "build-meta.json" },
		},
		"/repo",
	);

	assert.deepEqual(graph.assets, ["entry.js", "lazy.js", "shared.js", "styles.css", "url-styles.css"]);
	assert.deepEqual(graph.chunks["entry.js"], {
		modules: ["apps/terminal/src/entry.tsx"],
		imports: ["shared.js", "styles.css", "url-styles.css"],
		dynamicImports: ["lazy.js"],
	});
	assert.deepEqual(parseClientChunkGraph(JSON.stringify(graph)), graph);
});

test("validates graph inventory and rejects stale graph metadata", () => {
	assert.doesNotThrow(() => validateClientChunkGraphAgainstAssets(runtimeGraph, runtimeGraph.assets));
	assert.throws(
		() =>
			validateClientChunkGraphAgainstAssets(
				runtimeGraph,
				runtimeGraph.assets.filter((file) => file !== "toast.js"),
			),
		/graph inventory contains assets missing from client output: toast\.js/,
	);
	assert.throws(
		() => validateClientChunkGraphAgainstAssets(runtimeGraph, [...runtimeGraph.assets, "extra.js"]),
		/client output contains assets missing from graph inventory: extra\.js/,
	);
});

test("rejects stale schemas, malformed graph entries, dangling edges, and missing chunk metadata", () => {
	assert.throws(() => parseClientChunkGraph('{"version":2,"assets":[],"chunks":{}}'), /unsupported schema/);

	const danglingGraph = structuredClone(runtimeGraph);
	danglingGraph.chunks["toast.js"].imports.push("missing.js");
	assert.throws(
		() => parseClientChunkGraph(JSON.stringify(danglingGraph)),
		/edge from toast\.js references asset outside the inventory: missing\.js/,
	);

	const missingMetadataGraph = structuredClone(runtimeGraph);
	delete missingMetadataGraph.chunks["toast.js"];
	assert.throws(
		() => parseClientChunkGraph(JSON.stringify(missingMetadataGraph)),
		/JavaScript asset toast\.js has no chunk metadata/,
	);
});

test("collects static JavaScript and CSS edges while excluding dynamic imports", () => {
	const closure = collectChunkGraphStaticClosure({
		graph: runtimeGraph,
		assetFiles: runtimeGraph.assets,
		entryFiles: ["entry.js"],
	});

	assert.deepEqual([...closure].sort(), ["entry.js", "shared.js", "startup.css"]);
	assert.equal(closure.has("hydrate.js"), false);
	assert.equal(closure.has("lazy-root.js"), false);
});

test("closes route preloads, runtime scripts, and semantic startup entries as one graph", () => {
	const startupGraph = {
		version: 3,
		assets: [
			"dynamic.js",
			"route.css",
			"route-dependency.js",
			"route.js",
			"runtime-dependency.js",
			"runtime.js",
			"semantic-dependency.js",
			"semantic.js",
		],
		chunks: {
			"dynamic.js": { modules: [], imports: [], dynamicImports: [] },
			"route-dependency.js": { modules: [], imports: [], dynamicImports: [] },
			"route.js": {
				modules: [],
				imports: ["route-dependency.js", "route.css"],
				dynamicImports: [],
			},
			"runtime-dependency.js": { modules: [], imports: [], dynamicImports: [] },
			"runtime.js": {
				modules: [],
				imports: ["runtime-dependency.js"],
				dynamicImports: ["dynamic.js"],
			},
			"semantic-dependency.js": { modules: [], imports: [], dynamicImports: [] },
			"semantic.js": {
				modules: [],
				imports: ["semantic-dependency.js"],
				dynamicImports: [],
			},
		},
	};

	const startupFiles = collectTradeStartupFiles({
		graph: startupGraph,
		assetFiles: startupGraph.assets,
		routePreloadFiles: new Set(["route.js"]),
		runtimeEntryFiles: ["runtime.js"],
		semanticEntryFiles: ["semantic.js"],
	});

	assert.deepEqual([...startupFiles].sort(), [
		"route-dependency.js",
		"route.css",
		"route.js",
		"runtime-dependency.js",
		"runtime.js",
		"semantic-dependency.js",
		"semantic.js",
	]);
	assert.equal(startupFiles.has("dynamic.js"), false);
});

test("resolves runtime startup by semantic module identity", () => {
	const startupFiles = new Set(["entry.js", "shared.js", "startup.css"]);
	const mobileFiles = collectRuntimeStartupFiles({
		graph: runtimeGraph,
		assetFiles: runtimeGraph.assets,
		startupFiles,
		entryFiles: ["entry.js"],
		moduleIds: ["apps/terminal/src/components/ui/sonner.tsx"],
	});
	const desktopFiles = collectRuntimeStartupFiles({
		graph: runtimeGraph,
		assetFiles: runtimeGraph.assets,
		startupFiles,
		entryFiles: ["entry.js"],
		moduleIds: [
			"apps/terminal/src/components/ui/sonner.tsx",
			"apps/terminal/src/components/trade/layout/main-workspace.tsx",
		],
	});

	assert.deepEqual([...mobileFiles].sort(), ["hydrate.js", "toast.js"]);
	assert.deepEqual([...desktopFiles].sort(), ["hydrate.js", "toast.js", "workspace.js"]);
	assert.equal(mobileFiles.has("lazy-root.js"), false);
});

test("keeps semantic runtime profiles stable when emitted filenames change", () => {
	const renamedFiles = new Map(
		runtimeGraph.assets.map((file, index) => [file, `renamed-${index + 1}${file.endsWith(".css") ? ".css" : ".js"}`]),
	);
	const renamedGraph = {
		version: 3,
		assets: runtimeGraph.assets.map((file) => renamedFiles.get(file)),
		chunks: Object.fromEntries(
			Object.entries(runtimeGraph.chunks).map(([file, chunk]) => [
				renamedFiles.get(file),
				{
					...chunk,
					imports: chunk.imports.map((importedFile) => renamedFiles.get(importedFile)),
					dynamicImports: chunk.dynamicImports.map((importedFile) => renamedFiles.get(importedFile)),
				},
			]),
		),
	};
	const originalStartup = new Set(["entry.js", "shared.js", "startup.css"]);
	const originalProfile = collectRuntimeStartupFiles({
		graph: runtimeGraph,
		assetFiles: runtimeGraph.assets,
		startupFiles: originalStartup,
		entryFiles: ["entry.js"],
		moduleIds: [
			"apps/terminal/src/components/ui/sonner.tsx",
			"apps/terminal/src/components/trade/layout/main-workspace.tsx",
		],
	});
	const renamedProfile = collectRuntimeStartupFiles({
		graph: renamedGraph,
		assetFiles: renamedGraph.assets,
		startupFiles: new Set([...originalStartup].map((file) => renamedFiles.get(file))),
		entryFiles: [renamedFiles.get("entry.js")],
		moduleIds: [
			"apps/terminal/src/components/ui/sonner.tsx",
			"apps/terminal/src/components/trade/layout/main-workspace.tsx",
		],
	});

	assert.deepEqual([...renamedProfile].sort(), [...originalProfile].map((file) => renamedFiles.get(file)).sort());
});

test("fails closed for missing, duplicated, and dangling semantic roots", () => {
	assert.throws(
		() => findChunkContainingModule(runtimeGraph, "apps/terminal/src/missing.ts"),
		/expected client module apps\/terminal\/src\/missing\.ts was not found/,
	);

	const duplicateGraph = structuredClone(runtimeGraph);
	duplicateGraph.chunks["workspace.js"].modules.push("apps/terminal/src/components/ui/sonner.tsx");
	assert.throws(
		() => findChunkContainingModule(duplicateGraph, "apps/terminal/src/components/ui/sonner.tsx"),
		/expected client module .* in one chunk but found 2/,
	);

	assert.throws(
		() =>
			collectChunkGraphStaticClosure({
				graph: runtimeGraph,
				assetFiles: runtimeGraph.assets.filter((file) => file !== "shared.js"),
				entryFiles: ["entry.js"],
			}),
		/client chunk graph references missing asset shared\.js/,
	);
});

test("requires exactly one generated JavaScript chunk for a prefix", () => {
	assert.equal(findUniqueJavaScriptChunk(["client-root-a.js"], "client-root"), "client-root-a.js");
	assert.throws(() => findUniqueJavaScriptChunk(["other.js"], "client-root"), /was not found/);
	assert.throws(
		() => findUniqueJavaScriptChunk(["client-root-a.js", "client-root-b.js"], "client-root"),
		/but found 2/,
	);
});

test("writes graph cache atomically and explains a missing cache", (context) => {
	const temporaryDirectory = mkdtempSync(join(tmpdir(), "sairn-client-chunk-graph-"));
	context.after(() => rmSync(temporaryDirectory, { recursive: true, force: true }));
	const graphFile = join(temporaryDirectory, "cache", "client-chunk-graph.json");

	mkdirSync(dirname(graphFile), { recursive: true });
	writeFileSync(graphFile, "stale graph", "utf8");
	removeClientChunkGraphFile(graphFile);
	assert.equal(existsSync(graphFile), false);

	writeClientChunkGraphFile(graphFile, runtimeGraph);
	assert.deepEqual(readClientChunkGraphFile(graphFile), runtimeGraph);
	assert.deepEqual(
		readdirSync(dirname(graphFile)).filter((file) => file.endsWith(".tmp")),
		[],
	);
	assert.throws(
		() => readClientChunkGraphFile(join(temporaryDirectory, "missing.json")),
		/pnpm --filter @sairn\/terminal build/,
	);
});

test("removes the same-directory temporary graph when atomic rename fails", (context) => {
	const temporaryDirectory = mkdtempSync(join(tmpdir(), "sairn-client-chunk-graph-failure-"));
	context.after(() => rmSync(temporaryDirectory, { recursive: true, force: true }));
	const graphFile = join(temporaryDirectory, "existing-directory");
	mkdirSync(graphFile);

	assert.throws(() => writeClientChunkGraphFile(graphFile, runtimeGraph));
	assert.deepEqual(
		readdirSync(temporaryDirectory).filter((file) => file.endsWith(".tmp")),
		[],
	);
});

test("does not allow chunk graph diagnostics in public output", (context) => {
	const publicDirectory = mkdtempSync(join(tmpdir(), "sairn-client-public-"));
	context.after(() => rmSync(publicDirectory, { recursive: true, force: true }));
	const nestedAssets = join(publicDirectory, "nested", "assets");
	mkdirSync(nestedAssets, { recursive: true });
	writeFileSync(join(publicDirectory, "client-chunk-graph.json"), "{}");
	writeFileSync(join(nestedAssets, "client-chunk-graph.json.gz"), "gzip");
	writeFileSync(join(nestedAssets, "client-chunk-graph.json.br"), "brotli");
	writeFileSync(join(nestedAssets, "client-chunk-graph.json.zst"), "zstd");
	writeFileSync(join(nestedAssets, "not-client-chunk-graph.json"), "{}");

	assert.deepEqual(findPublicClientChunkGraphArtifacts(publicDirectory), [
		"client-chunk-graph.json",
		"nested/assets/client-chunk-graph.json.br",
		"nested/assets/client-chunk-graph.json.gz",
		"nested/assets/client-chunk-graph.json.zst",
	]);
});

test("applies budget tolerance", () => {
	assert.equal(
		getBudgetIncreaseViolation({
			label: "trade startup gzip",
			actualBytes: 110_000,
			baselineBytes: 100_000,
			allowedIncreaseBytes: 10_000,
		}),
		undefined,
	);
	assert.equal(
		getBudgetIncreaseViolation({
			label: "trade startup gzip",
			actualBytes: 110_001,
			baselineBytes: 100_000,
			allowedIncreaseBytes: 10_000,
		}),
		"trade startup gzip increased by 10001 bytes from baseline 100000; allowed increase is 10000 bytes",
	);
});

test("names developer-only env files that make a local build measure differently from CI", (context) => {
	const appDirectory = mkdtempSync(join(tmpdir(), "sairn-budget-env-"));
	context.after(() => rmSync(appDirectory, { recursive: true, force: true }));
	for (const file of [".env", ".env.example", ".env.production", ".env.production.local", ".env.local", "notes.local"]) {
		writeFileSync(join(appDirectory, file), "");
	}

	assert.deepEqual(findLocalEnvFiles(appDirectory), [".env.local", ".env.production.local"]);
	assert.deepEqual(findLocalEnvFiles(join(appDirectory, "missing")), []);
});

test("notes a local env file next to the application whose built assets are measured", (context) => {
	const appDirectory = mkdtempSync(join(tmpdir(), "sairn-budget-app-"));
	context.after(() => rmSync(appDirectory, { recursive: true, force: true }));
	const assetsDirectory = join(appDirectory, ".output", "public", "assets");
	mkdirSync(assetsDirectory, { recursive: true });

	assert.equal(describeLocalEnvFiles(assetsDirectory), null);

	writeFileSync(join(appDirectory, ".env.local"), "");
	assert.match(describeLocalEnvFiles(assetsDirectory) ?? "", /^Note: \.env\.local sits next to this build\. CI has no local env file/);
});

test("prints the local env note with every budget report", () => {
	const source = readFileSync(new URL("./check-client-bundle-budget.mjs", import.meta.url), "utf8");
	const report = source.slice(source.indexOf("export async function checkClientBundleBudget"));
	assert.match(
		report,
		/const localEnvNote = describeLocalEnvFiles\(assetsDirectory\);\n\tif \(localEnvNote\) console\.log\(localEnvNote\);/,
	);
});

test("keeps every deterministic PositionsPanel idle preload in the desktop runtime profile", () => {
	const positionsPanelSource = readFileSync(
		new URL("../apps/terminal/src/components/trade/positions/positions-panel.tsx", import.meta.url),
		"utf8",
	);
	assert.equal(
		positionsPanelSource.includes("requestIdleCallback(preloadHistoryTabs"),
		true,
		"PositionsPanel must schedule its history preload set with requestIdleCallback",
	);
	assert.equal(
		positionsPanelSource.includes("setTimeout(preloadHistoryTabs"),
		true,
		"PositionsPanel must preserve the deterministic timeout fallback for history preloads",
	);
	const idlePreloads = [
		{
			moduleId: "apps/terminal/src/components/trade/positions/funding-tab.tsx",
			preload: "funding: () => void FundingTab.preload?.()",
		},
		{
			moduleId: "apps/terminal/src/components/trade/positions/history-tab.tsx",
			preload: "history: () => void HistoryTab.preload?.()",
		},
		{
			moduleId: "apps/terminal/src/components/trade/positions/orders-history-tab.tsx",
			preload: '"orders-history": () => void OrdersHistoryTab.preload?.()',
		},
	];

	for (const { moduleId, preload } of idlePreloads) {
		assert.equal(positionsPanelSource.includes(preload), true, `missing deterministic preload ${preload}`);
		assert.equal(
			TRADE_DESKTOP_RUNTIME_MODULE_IDS.includes(moduleId),
			true,
			`desktop runtime profile is missing ${moduleId}`,
		);
	}
});

test("keeps graph helpers and tests in the production workflow path filter", () => {
	const workflow = readFileSync(new URL("../.github/workflows/production-build.yml", import.meta.url), "utf8");
	assert.equal(workflow.includes('- "scripts/check-client-bundle-budget.test.mjs"'), true);
	assert.equal(workflow.includes('- "scripts/client-chunk-graph.*"'), true);
	assert.equal(workflow.includes("scripts/check-client-bundle-budget.test.mjs"), true);
	assert.equal(workflow.includes("pnpm --filter @sairn/terminal perf:startup"), true);
});

test("runs the budget tests once from the terminal test workflow, outside the build matrix", () => {
	const tests = readFileSync(new URL("../.github/workflows/terminal-tests.yml", import.meta.url), "utf8");
	assert.equal(tests.includes('- ".github/workflows/**"'), true);
	assert.equal(tests.includes('- "scripts/check-client-bundle-budget.mjs"'), true);
	assert.equal(tests.includes('- "scripts/check-client-bundle-budget.test.mjs"'), true);
	assert.equal(tests.includes('- "scripts/client-chunk-graph.*"'), true);
	assert.match(tests, /node --test\n(?:[ \t]+scripts\/\S+\n)*[ \t]+scripts\/check-client-bundle-budget\.test\.mjs/);
	assert.equal(/\bmatrix\b/.test(tests), false);

	const builds = readFileSync(new URL("../.github/workflows/production-build.yml", import.meta.url), "utf8");
	assert.equal(/vitest run|node --test|pnpm test:cloudfront/.test(builds), false);
});
