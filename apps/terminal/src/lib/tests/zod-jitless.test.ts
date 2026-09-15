import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { util } from "zod/v4/core";
import { z } from "@/lib/zod";

const ROOTS = [resolve(__dirname, "../.."), resolve(__dirname, "../../../../../packages/hl-react/src")];
const WRAPPERS = new Set(["apps/terminal/src/lib/zod.ts", "packages/hl-react/src/zod.ts"]);

function evalProbeRan(): boolean {
	const descriptor = Object.getOwnPropertyDescriptor(util.allowsEval, "value");
	return descriptor !== undefined && descriptor.get === undefined;
}

function sourceFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) return entry.name === "tests" ? [] : sourceFiles(path);
		return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
	});
}

describe("zod without its JIT", () => {
	it("switches the JIT off before any object schema exists, so nothing probes the Function constructor", () => {
		expect(z.config().jitless).toBe(true);
		expect(evalProbeRan()).toBe(false);
		const schema = z.object({ theme: z.enum(["light", "dark"]), nested: z.object({ count: z.number() }) });
		expect(schema.safeParse({ theme: "dark", nested: { count: 1 } }).success).toBe(true);
		expect(schema.safeParse({ theme: "blue", nested: { count: 1 } }).success).toBe(false);
		expect(evalProbeRan()).toBe(false);
	});

	it("is the only way application and hl-react modules import zod values", () => {
		const repoRoot = resolve(__dirname, "../../../../..");
		const offenders = ROOTS.flatMap(sourceFiles)
			.filter((file) => !WRAPPERS.has(relative(repoRoot, file).replaceAll("\\", "/")))
			.filter((file) => /^import (?!type )[^;]*from "zod(\/[^"]*)?";/m.test(readFileSync(file, "utf8")))
			.map((file) => relative(repoRoot, file));
		expect(offenders).toEqual([]);
	});
});
