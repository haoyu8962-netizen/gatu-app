import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const terminalRoot = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
	testDir: fileURLToPath(new URL(".", import.meta.url)),
	testMatch: "*.pw.ts",
	testIgnore: [
		"user-menu-recovery.pw.ts",
		"mobile-trade-all-orders.pw.ts",
		"reduce-only.pw.ts",
		"desktop-order-entry-layout.pw.ts",
		"account-actions.pw.ts",
		"position-close-all.pw.ts",
		"notifications.pw.ts",
		"top-nav-connected.pw.ts",
		"brand-surfaces.pw.ts",
	],
	outputDir: fileURLToPath(new URL("../../test-results/shared-browser", import.meta.url)),
	fullyParallel: false,
	workers: 1,
	reporter: "line",
	use: {
		baseURL: "http://127.0.0.1:4179",
		browserName: "chromium",
		channel: process.env.CI ? undefined : "chrome",
		colorScheme: "dark",
		screenshot: "only-on-failure",
		trace: "retain-on-failure",
		viewport: { width: 900, height: 500 },
	},
	webServer: {
		command: "pnpm exec vite --config tests/browser/vite.config.ts --host 127.0.0.1 --port 4179 --strictPort",
		cwd: terminalRoot,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
		url: "http://127.0.0.1:4179/trade-size-slider-performance.html",
	},
});
