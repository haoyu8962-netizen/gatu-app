import { describe, expect, it } from "vitest";
import { getAppRouteSurface } from "@/config/app-route-surface";
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

	it("prerenders the shell and no route-specific pages", () => {
		expect(options).not.toHaveProperty("pages");
		expect(options.prerender.autoStaticPathsDiscovery).toBe(false);
		expect(options.prerender.crawlLinks).toBe(false);
		expect(options.prerender.failOnError).toBe(true);
	});
});
