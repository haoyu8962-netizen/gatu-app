import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";
import { LOCAL_HOSTS_ONLY_ARGS } from "./local-hosts-only";

export default defineConfig({
	testDir: fileURLToPath(new URL(".", import.meta.url)),
	testMatch: "top-nav-connected.pw.ts",
	outputDir: fileURLToPath(new URL("../../test-results/top-nav-connected", import.meta.url)),
	fullyParallel: false,
	workers: 1,
	reporter: "line",
	timeout: 180_000,
	use: {
		launchOptions: { args: LOCAL_HOSTS_ONLY_ARGS },
		baseURL: "http://127.0.0.1:4195",
		browserName: "chromium",
		channel: process.env.CI ? undefined : "chrome",
		colorScheme: "dark",
		contextOptions: { reducedMotion: "reduce" },
		screenshot: "off",
		trace: "off",
	},
	webServer: {
		command:
			"pnpm exec vite --config tests/browser/top-nav-connected.vite.config.ts --host 127.0.0.1 --port 4195 --strictPort",
		cwd: fileURLToPath(new URL("../..", import.meta.url)),
		reuseExistingServer: false,
		timeout: 120_000,
		url: "http://127.0.0.1:4195/top-nav-connected.html",
	},
});
