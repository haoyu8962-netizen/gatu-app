import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: fileURLToPath(new URL(".", import.meta.url)),
	testMatch: ["account-actions.pw.ts"],
	outputDir: fileURLToPath(new URL("../../test-results/account-actions", import.meta.url)),
	workers: 1,
	fullyParallel: false,
	reporter: "line",
	use: {
		baseURL: "http://127.0.0.1:4187",
		browserName: "chromium",
		channel: process.env.CI ? undefined : "chrome",
		colorScheme: "light",
		screenshot: "only-on-failure",
		trace: "retain-on-failure",
	},
	webServer: {
		command:
			"pnpm exec vite --config tests/browser/account-actions.vite.config.ts --host 127.0.0.1 --port 4187 --strictPort",
		cwd: fileURLToPath(new URL("../..", import.meta.url)),
		reuseExistingServer: false,
		timeout: 120000,
		url: "http://127.0.0.1:4187/account-actions.html",
	},
});
