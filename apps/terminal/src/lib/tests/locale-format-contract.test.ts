import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC_DIR = resolve(__dirname, "../..");
const FORMAT_MODULE = resolve(SRC_DIR, "lib/format.ts");
const NUMBER_INPUT_MODULE = resolve(SRC_DIR, "components/ui/number-input.tsx");
const RAW_INTL_PATTERN = /\.toLocale(?:String|TimeString|DateString)\(|\bIntl\.[A-Z][A-Za-z]+\(/g;
const DECIMAL_INPUT_PATTERN = /inputMode="decimal"/g;
const NORMALIZING_INPUT_OWNERS = new Set(["NumberInput", "PriceInput", "MobileTradePriceField"]);
const DECIMAL_NORMALIZERS = ["normalizeDecimalInput(", "normalizeDecimalInputEvent("];
/**
 * Bare decimal inputs that are placeholders only: every product caller of the frame passes its own
 * `input`, and the bare element exists for geometry parity (`trade-form-views.test.tsx`).
 */
const PLACEHOLDER_DECIMAL_INPUTS = new Set(["components/trade/tradebox/trade-input-frame-view.tsx"]);

describe("locale format contract", () => {
	it("keeps every Intl formatter inside lib/format.ts", () => {
		const violations: string[] = [];

		for (const filePath of findSourceFiles(SRC_DIR)) {
			if (filePath === FORMAT_MODULE) continue;
			const source = readFileSync(filePath, "utf8");
			for (const match of source.matchAll(RAW_INTL_PATTERN)) {
				violations.push(`${relative(SRC_DIR, filePath)}:${lineOf(source, match.index)} ${match[0]}`);
			}
		}

		expect(violations).toEqual([]);
	});

	it("normalizes the typed decimal sign on every bare decimal input", () => {
		const violations: string[] = [];

		for (const filePath of findSourceFiles(SRC_DIR)) {
			const relativePath = relative(SRC_DIR, filePath);
			if (filePath === NUMBER_INPUT_MODULE || PLACEHOLDER_DECIMAL_INPUTS.has(relativePath)) continue;
			const source = readFileSync(filePath, "utf8");
			const normalizes = DECIMAL_NORMALIZERS.some((token) => source.includes(token));
			for (const match of source.matchAll(DECIMAL_INPUT_PATTERN)) {
				const owner = enclosingTagName(source, match.index);
				if (NORMALIZING_INPUT_OWNERS.has(owner) || normalizes) continue;
				violations.push(`${relativePath}:${lineOf(source, match.index)} <${owner} inputMode="decimal">`);
			}
		}

		expect(violations).toEqual([]);
	});
});

function lineOf(source: string, index: number): number {
	return source.slice(0, index).split("\n").length;
}

function enclosingTagName(source: string, index: number): string {
	const opening = source.lastIndexOf("<", index);
	const match = /^<([A-Za-z][A-Za-z0-9.]*)/.exec(source.slice(opening));
	return match?.[1] ?? "";
}

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
