import { readFileSync } from "node:fs";
import { isAbsolute, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveConfig } from "vite";
import { describe, expect, it } from "vitest";

const terminalRoot = fileURLToPath(new URL("../../..", import.meta.url));
const terminalConfigFile = fileURLToPath(new URL("../../../vite.config.ts", import.meta.url));
const browserConfigFile = fileURLToPath(new URL("../../../tests/browser/vite.config.ts", import.meta.url));

function containsDirectory(parent: string, child: string) {
	const directory = relative(parent, child);
	return directory === "" || (!isAbsolute(directory) && directory !== ".." && !directory.startsWith(`..${sep}`));
}

describe("Vite dependency cache isolation", () => {
	it("keeps the browser fixture cache separate from the terminal development cache", async () => {
		const terminalConfigSource = readFileSync(terminalConfigFile, "utf8");
		expect(
			terminalConfigSource,
			"Resolve explicit terminal root or cacheDir settings in this test when the application changes its defaults",
		).not.toMatch(/\b(?:root|cacheDir)\s*:/u);

		const [terminalConfig, browserConfig] = await Promise.all([
			resolveConfig({ configFile: false, envFile: false, root: terminalRoot, logLevel: "silent" }, "serve"),
			resolveConfig({ configFile: browserConfigFile, envFile: false, logLevel: "silent" }, "serve"),
		]);

		expect(containsDirectory(terminalConfig.cacheDir, browserConfig.cacheDir)).toBe(false);
		expect(containsDirectory(browserConfig.cacheDir, terminalConfig.cacheDir)).toBe(false);
	});
});
