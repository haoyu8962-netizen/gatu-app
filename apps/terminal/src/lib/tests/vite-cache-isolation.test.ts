import { readFileSync } from "node:fs";
import { isAbsolute, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveConfig } from "vite";
import { describe, expect, it } from "vitest";

const terminalRoot = fileURLToPath(new URL("../../..", import.meta.url));
const terminalConfigFile = fileURLToPath(new URL("../../../vite.config.ts", import.meta.url));
const browserConfigFile = fileURLToPath(new URL("../../../tests/browser/vite.config.ts", import.meta.url));
const orderEntryConfigFile = fileURLToPath(
	new URL("../../../tests/browser/mobile-trade-all-orders.vite.config.ts", import.meta.url),
);
const accountConfigFile = fileURLToPath(
	new URL("../../../tests/browser/account-actions.vite.config.ts", import.meta.url),
);
const closeAllConfigFile = fileURLToPath(
	new URL("../../../tests/browser/position-close-all.vite.config.ts", import.meta.url),
);

const notificationsConfigFile = fileURLToPath(
	new URL("../../../tests/browser/notifications.vite.config.ts", import.meta.url),
);

function containsDirectory(parent: string, child: string) {
	const directory = relative(parent, child);
	return directory === "" || (!isAbsolute(directory) && directory !== ".." && !directory.startsWith(`..${sep}`));
}

describe("Vite dependency cache isolation", () => {
	it("isolates the shared, order-entry, account, close-all and notifications caches from each other and the application", async () => {
		const terminalConfigSource = readFileSync(terminalConfigFile, "utf8");
		expect(
			terminalConfigSource,
			"Resolve explicit terminal root or cacheDir settings in this test when the application changes its defaults",
		).not.toMatch(/\b(?:root|cacheDir)\s*:/u);

		const [terminalConfig, browserConfig, orderEntryConfig, accountConfig, closeAllConfig, notificationsConfig] =
			await Promise.all([
				resolveConfig({ configFile: false, envFile: false, root: terminalRoot, logLevel: "silent" }, "serve"),
				resolveConfig({ configFile: browserConfigFile, envFile: false, logLevel: "silent" }, "serve"),
				resolveConfig({ configFile: orderEntryConfigFile, envFile: false, logLevel: "silent" }, "serve"),
				resolveConfig({ configFile: accountConfigFile, envFile: false, logLevel: "silent" }, "serve"),
				resolveConfig({ configFile: closeAllConfigFile, envFile: false, logLevel: "silent" }, "serve"),
				resolveConfig({ configFile: notificationsConfigFile, envFile: false, logLevel: "silent" }, "serve"),
			]);

		const caches = [
			terminalConfig,
			browserConfig,
			orderEntryConfig,
			accountConfig,
			closeAllConfig,
			notificationsConfig,
		].map((config) => config.cacheDir);
		for (const [index, parent] of caches.entries()) {
			for (const [otherIndex, child] of caches.entries()) {
				if (index !== otherIndex) expect(containsDirectory(parent, child)).toBe(false);
			}
		}
		expect(browserConfig.optimizeDeps.entries).toEqual(
			expect.arrayContaining([
				"!mobile-trade-all-orders.html",
				"!account-actions.html",
				"!position-close-all.html",
				"!notifications.html",
			]),
		);
		expect(orderEntryConfig.optimizeDeps.entries).toEqual(["mobile-trade-all-orders.html"]);
		expect(accountConfig.optimizeDeps.entries).toEqual(["account-actions.html"]);
		expect(closeAllConfig.optimizeDeps.entries).toEqual(["position-close-all.html"]);
		expect(notificationsConfig.optimizeDeps.entries).toEqual(["notifications.html"]);
	});
});
