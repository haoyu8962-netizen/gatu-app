import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

interface LaunchConfiguration {
	name?: string;
	runtimeArgs?: string[];
}

interface LaunchFile {
	configurations?: LaunchConfiguration[];
}

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(TEST_DIR, "../../../../..");

describe("design handoff preview launcher", () => {
	it("serves a repository-relative directory on localhost only", () => {
		const launchFile = JSON.parse(readFileSync(resolve(REPOSITORY_ROOT, ".claude/launch.json"), "utf8")) as LaunchFile;
		const preview = launchFile.configurations?.find((configuration) => configuration.name === "design-handoff");
		const args = preview?.runtimeArgs ?? [];
		const directory = args[args.indexOf("--directory") + 1];

		expect(args).toContain("--bind");
		expect(args[args.indexOf("--bind") + 1]).toBe("127.0.0.1");
		expect(directory).toBe("designs");
		expect(directory?.startsWith("/")).toBe(false);
		expect(directory).not.toContain("/Users/");
	});
});
