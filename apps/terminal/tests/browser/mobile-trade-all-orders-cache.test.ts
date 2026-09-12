import { isAbsolute, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveConfig } from "vite";
import { expect, it } from "vitest";

function containsDirectory(parent: string, child: string) {
	const directory = relative(parent, child);
	return directory === "" || (!isAbsolute(directory) && directory !== ".." && !directory.startsWith(`..${sep}`));
}

it("isolates real mobile order fixtures from every existing dependency cache", async () => {
	const configs = await Promise.all([
		resolveConfig(
			{ configFile: false, envFile: false, root: fileURLToPath(new URL("../..", import.meta.url)), logLevel: "silent" },
			"serve",
		),
		...["vite.config.ts", "user-menu-recovery.vite.config.ts", "mobile-trade-all-orders.vite.config.ts"].map((name) =>
			resolveConfig(
				{ configFile: fileURLToPath(new URL(name, import.meta.url)), envFile: false, logLevel: "silent" },
				"serve",
			),
		),
	]);
	const mobile = configs[3];
	for (const configuration of configs.slice(0, 3)) {
		expect(containsDirectory(configuration.cacheDir, mobile.cacheDir)).toBe(false);
		expect(containsDirectory(mobile.cacheDir, configuration.cacheDir)).toBe(false);
	}
	expect(configs[1].optimizeDeps.entries).toContain("!mobile-trade-all-orders.html");
	expect(mobile.optimizeDeps.entries).toEqual(["mobile-trade-all-orders.html"]);
});
