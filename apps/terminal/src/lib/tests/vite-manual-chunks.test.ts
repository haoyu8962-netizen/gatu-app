import { describe, expect, it } from "vitest";
import { createManualChunks } from "../../../vite.config";

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
});
