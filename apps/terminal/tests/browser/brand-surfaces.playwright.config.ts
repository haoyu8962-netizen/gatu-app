import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

// Chromium always runs. `BRAND_SURFACES_ENGINES=webkit,firefox` adds the other engines locally;
// Firefox needs `BRAND_SURFACES_FIREFOX` pointing at an installed Firefox executable.
const extraEngines = new Set((process.env.BRAND_SURFACES_ENGINES ?? "").split(",").filter(Boolean));
const firefoxExecutable = process.env.BRAND_SURFACES_FIREFOX;

export default defineConfig({
	testDir: fileURLToPath(new URL(".", import.meta.url)),
	testMatch: "brand-surfaces.pw.ts",
	outputDir: fileURLToPath(new URL("../../test-results/brand-surfaces", import.meta.url)),
	fullyParallel: false,
	workers: 1,
	reporter: "line",
	timeout: 120_000,
	use: {
		baseURL: "http://127.0.0.1:4196",
		screenshot: "off",
		trace: "off",
		viewport: { width: 1100, height: 900 },
	},
	projects: [
		{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1100, height: 900 } } },
		...(extraEngines.has("webkit")
			? [{ name: "webkit", use: { ...devices["Desktop Safari"], viewport: { width: 1100, height: 900 } } }]
			: []),
		...(extraEngines.has("firefox") && firefoxExecutable
			? [
					{
						name: "firefox",
						use: {
							...devices["Desktop Firefox"],
							viewport: { width: 1100, height: 900 },
							launchOptions: { executablePath: firefoxExecutable },
						},
					},
				]
			: []),
	],
	webServer: {
		command: "pnpm exec vite --config tests/browser/brand-surfaces.vite.config.ts --host 127.0.0.1 --port 4196 --strictPort",
		cwd: fileURLToPath(new URL("../..", import.meta.url)),
		reuseExistingServer: false,
		timeout: 120_000,
		url: "http://127.0.0.1:4196/brand-surfaces.html",
	},
});
