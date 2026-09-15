import { describe, expect, it } from "vitest";
import { DOCUMENT_ROUTE_PATHS } from "@/config/document-routes";
import { getAppRouteSurface } from "@/providers/client-runtime";
import { createTanstackStartOptions, SPA_SHELL_MASK_PATH, SPA_SHELL_OUTPUT_PATH } from "../../../vite.config";

describe("SPA shell build configuration", () => {
	const options = createTanstackStartOptions();

	it("enables SPA mode with a client-rendered terminal mask path", () => {
		expect(options.spa.enabled).toBe(true);
		expect(options.spa.maskPath).toBe(SPA_SHELL_MASK_PATH);
		expect(getAppRouteSurface(SPA_SHELL_MASK_PATH)).toBe("terminal");
		expect(SPA_SHELL_MASK_PATH).not.toBe("/");
		expect(options.spa.prerender.outputPath).toBe(SPA_SHELL_OUTPUT_PATH);
	});

	it("prerenders every document route as real HTML and nothing else", () => {
		const prerenderedPaths = options.pages.map((page) => page.path);
		expect(prerenderedPaths).toEqual([...DOCUMENT_ROUTE_PATHS]);
		for (const page of options.pages) {
			expect(page.prerender.enabled).toBe(true);
			expect(getAppRouteSurface(page.path)).toBe("document");
		}
		expect(options.prerender.autoStaticPathsDiscovery).toBe(false);
		expect(options.prerender.crawlLinks).toBe(false);
		expect(options.prerender.failOnError).toBe(true);
	});
});
