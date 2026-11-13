import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";
import { LOCAL_HOSTS_ONLY_ARGS } from "./local-hosts-only";

export default defineConfig({
	testDir: fileURLToPath(new URL(".", import.meta.url)),
	testMatch: "user-menu-recovery.pw.ts",
	fullyParallel: false,
	workers: 1,
	reporter: "line",
	use: {
		launchOptions: { args: LOCAL_HOSTS_ONLY_ARGS },
		baseURL: "http://127.0.0.1:4182",
		browserName: "chromium",
		channel: process.env.CI ? undefined : "chrome",
		colorScheme: "dark",
		contextOptions: { reducedMotion: "reduce" },
		screenshot: "only-on-failure",
		trace: "retain-on-failure",
	},
	webServer: {
		command:
			"pnpm exec vite --config tests/browser/user-menu-recovery.vite.config.ts --host 127.0.0.1 --port 4182 --strictPort",
		cwd: fileURLToPath(new URL("../..", import.meta.url)),
		reuseExistingServer: false,
		timeout: 120_000,
		url: "http://127.0.0.1:4182/user-menu-recovery.html",
	},
});
