import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC_DIR = resolve(__dirname, "../..");
const FORMAT_MODULE = resolve(SRC_DIR, "lib/format.ts");
const RAW_INTL_PATTERN = /\.toLocale(?:String|TimeString|DateString)\(|new Intl\.(?:NumberFormat|DateTimeFormat)\(/g;

describe("locale format contract", () => {
	it("keeps every Intl number and date formatter inside lib/format.ts", () => {
		const violations: string[] = [];

		for (const filePath of findSourceFiles(SRC_DIR)) {
			if (filePath === FORMAT_MODULE) continue;
			const source = readFileSync(filePath, "utf8");
			for (const match of source.matchAll(RAW_INTL_PATTERN)) {
				const line = source.slice(0, match.index).split("\n").length;
				violations.push(`${relative(SRC_DIR, filePath)}:${line} ${match[0]}`);
			}
		}

		expect(violations).toEqual([]);
	});
});

function findSourceFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const entryPath = resolve(directory, entry.name);
		if (entry.isDirectory()) {
			return entry.name === "tests" || entry.name === "__tests__" ? [] : findSourceFiles(entryPath);
		}
		if (!/\.(ts|tsx)$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name) || entry.name.endsWith(".d.ts")) return [];
		return [entryPath];
	});
}
