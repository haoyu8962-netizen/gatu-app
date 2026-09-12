import { fileURLToPath } from "node:url";
import { build } from "vite";
import { describe, expect, it } from "vitest";
import { createManualChunks, createOrderSummaryChunksPlugin } from "../../../vite.config";

describe("Vite manual chunks", () => {
	it.each([
		["@tanstack/react-router", "vendor-tanstack-router"],
		["@tanstack/router-core", "vendor-tanstack-router"],
		["@tanstack/react-start-client", "vendor-tanstack-router"],
		["@tanstack/react-query", "vendor-tanstack-query"],
		["@tanstack/query-core", "vendor-tanstack-query"],
		["@tanstack/react-query-persist-client", "vendor-tanstack-query"],
		["@tanstack/query-persist-client-core", "vendor-tanstack-query"],
		["@tanstack/query-sync-storage-persister", "vendor-tanstack-query"],
		["@tanstack/react-table", "vendor-tanstack-table"],
		["@tanstack/table-core", "vendor-tanstack-table"],
		["@tanstack/react-virtual", "vendor-tanstack-virtual"],
		["@tanstack/virtual-core", "vendor-tanstack-virtual"],
	])("places %s in %s", (packageName, expectedChunk) => {
		expect(createManualChunks(`/repo/node_modules/${packageName}/dist/index.js`)).toBe(expectedChunk);
	});

	it("does not classify application modules as vendor chunks", () => {
		expect(createManualChunks("/repo/apps/terminal/src/router.tsx")).toBeUndefined();
	});

	it("splits route summaries without extra client entries or reversed runtime dependencies", async () => {
		const summaryIds = ["twap-order-summary", "scale-order-summary"].map((name) =>
			fileURLToPath(new URL(`../../components/trade/tradebox/${name}.tsx`, import.meta.url)),
		);
		const sources: Record<string, string> = {
			"/fixture/entry.js": "globalThis.loadPage = () => import('/fixture/page.js');",
			"/fixture/page.js": `import { Summary as twap } from ${JSON.stringify(summaryIds[0])}; import { Summary as scale } from ${JSON.stringify(summaryIds[1])}; export const summaries = [twap(), scale()];`,
			"/fixture/shared.js": "export const shared = globalThis.value;",
			...Object.fromEntries(
				summaryIds.map((id) => [
					id,
					"import { shared } from '/fixture/shared.js'; export const Summary = () => shared;",
				]),
			),
		};
		const result = await build({
			configFile: false,
			envFile: false,
			logLevel: "silent",
			plugins: [
				createOrderSummaryChunksPlugin(),
				{
					name: "summary-fixture",
					resolveId: (id) => (id in sources ? id : undefined),
					load: (id) => sources[id],
				},
			],
			build: {
				write: false,
				minify: false,
				rollupOptions: { input: "/fixture/entry.js", output: { manualChunks: createManualChunks } },
			},
		});
		if (Array.isArray(result) || !("output" in result)) throw new Error("Expected one client output");
		expect(result.output.filter((chunk) => chunk.type === "chunk" && chunk.isEntry)).toHaveLength(1);
		const runtime = result.output.find((chunk) => chunk.type === "chunk" && chunk.isEntry);
		const page = result.output.find((chunk) => chunk.type === "chunk" && chunk.facadeModuleId === "/fixture/page.js");
		if (!runtime || !page || page.type !== "chunk") throw new Error("Expected runtime and lazy route chunks");
		const summaries = result.output.filter(
			(chunk) => chunk.type === "chunk" && summaryIds.includes(chunk.facadeModuleId ?? ""),
		);
		expect(summaries).toHaveLength(2);
		for (const summary of summaries) {
			if (summary.type !== "chunk") throw new Error("Expected a summary chunk");
			expect(Object.keys(summary.modules)).toEqual([summary.facadeModuleId]);
			expect(summary.imports).toHaveLength(1);
			expect(summary.imports).not.toContain(runtime.fileName);
			expect(summary.imports).not.toContain(page.fileName);
			expect(page.imports).toContain(summary.fileName);
		}
	});
});
