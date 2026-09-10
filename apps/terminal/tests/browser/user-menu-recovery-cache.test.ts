import { isAbsolute, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveConfig } from "vite";
import { expect, it } from "vitest";

function containsDirectory(parent: string, child: string) {
	const directory = relative(parent, child);
	return directory === "" || (!isAbsolute(directory) && directory !== ".." && !directory.startsWith(`..${sep}`));
}

it("isolates the account recovery fixture from application and shared browser dependency graphs", async () => {
	const [application, sharedBrowser, recoveryBrowser] = await Promise.all([
		resolveConfig(
			{ configFile: false, envFile: false, root: fileURLToPath(new URL("../..", import.meta.url)), logLevel: "silent" },
			"serve",
		),
		resolveConfig(
			{ configFile: fileURLToPath(new URL("./vite.config.ts", import.meta.url)), envFile: false, logLevel: "silent" },
			"serve",
		),
		resolveConfig(
			{
				configFile: fileURLToPath(new URL("./user-menu-recovery.vite.config.ts", import.meta.url)),
				envFile: false,
				logLevel: "silent",
			},
			"serve",
		),
	]);
	for (const configuration of [application, sharedBrowser]) {
		expect(containsDirectory(configuration.cacheDir, recoveryBrowser.cacheDir)).toBe(false);
		expect(containsDirectory(recoveryBrowser.cacheDir, configuration.cacheDir)).toBe(false);
	}
	expect(sharedBrowser.optimizeDeps.entries).toContain("!user-menu-recovery.html");
	expect(recoveryBrowser.optimizeDeps.entries).toEqual(["user-menu-recovery.html"]);
});
