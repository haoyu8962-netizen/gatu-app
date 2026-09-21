import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: fileURLToPath(new URL(".", import.meta.url)),
	testMatch: "position-close-all.pw.ts",
	outputDir: fileURLToPath(new URL("../../test-results/position-close-all", import.meta.url)),
	workers: 1,
	fullyParallel: false,
	reporter: "line",
	use: {
		baseURL: "http://127.0.0.1:4188",
		browserName: "chromium",
		channel: process.env.CI ? undefined : "chrome",
		colorScheme: "light",
		screenshot: "only-on-failure",
		trace: "retain-on-failure",
		viewport: { width: 390, height: 844 },
	},
	webServer: {
		command:
			"pnpm exec vite --config tests/browser/position-close-all.vite.config.ts --host 127.0.0.1 --port 4188 --strictPort",
		cwd: fileURLToPath(new URL("../..", import.meta.url)),
		reuseExistingServer: false,
		timeout: 120000,
		url: "http://127.0.0.1:4188/position-close-all.html",
	},
});
