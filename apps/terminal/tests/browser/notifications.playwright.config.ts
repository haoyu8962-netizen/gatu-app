import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: fileURLToPath(new URL(".", import.meta.url)),
	testMatch: "notifications.pw.ts",
	outputDir: fileURLToPath(new URL("../../test-results/notifications", import.meta.url)),
	workers: 1,
	fullyParallel: false,
	reporter: "line",
	use: {
		baseURL: "http://127.0.0.1:4189",
		browserName: "chromium",
		channel: process.env.CI ? undefined : "chrome",
		colorScheme: "light",
		screenshot: "only-on-failure",
		trace: "retain-on-failure",
		viewport: { width: 1280, height: 900 },
	},
	webServer: {
		command:
			"pnpm exec vite --config tests/browser/notifications.vite.config.ts --host 127.0.0.1 --port 4189 --strictPort",
		cwd: fileURLToPath(new URL("../..", import.meta.url)),
		reuseExistingServer: false,
		timeout: 120_000,
		url: "http://127.0.0.1:4189/notifications.html",
	},
});
