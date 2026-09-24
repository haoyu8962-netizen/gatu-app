import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";
export default defineConfig({
	testDir: fileURLToPath(new URL(".", import.meta.url)),
	testMatch: ["mobile-trade-all-orders.pw.ts", "desktop-order-entry-layout.pw.ts", "reduce-only.pw.ts"],
	outputDir: fileURLToPath(new URL("../../test-results/order-entry", import.meta.url)),
	workers: 1,
	fullyParallel: false,
	reporter: "line",
	use: {
		baseURL: "http://127.0.0.1:4183",
		browserName: "chromium",
		channel: process.env.CI ? undefined : "chrome",
		colorScheme: "light",
		screenshot: "only-on-failure",
		trace: "retain-on-failure",
		hasTouch: true,
	},
	webServer: {
		command:
			"pnpm exec vite --config tests/browser/mobile-trade-all-orders.vite.config.ts --host 127.0.0.1 --port 4183 --strictPort",
		cwd: fileURLToPath(new URL("../..", import.meta.url)),
		reuseExistingServer: false,
		timeout: 120000,
		url: "http://127.0.0.1:4183/mobile-trade-all-orders.html",
	},
});
