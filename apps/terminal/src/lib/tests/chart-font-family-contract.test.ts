import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CHART_CUSTOM_FONT_FAMILY } from "@/config/chart";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const CHART_STYLESHEETS = ["tradingview-theme-dark.css", "tradingview-theme-light.css"].map((name) => ({
	name,
	css: readFileSync(resolve(TEST_DIR, "../../../public", name), "utf8"),
}));
const SYSTEM_FONT_FAMILIES = new Set([
	"ui-sans-serif",
	"ui-monospace",
	"system-ui",
	"-apple-system",
	"sans-serif",
	"monospace",
	"inherit",
]);
const FONT_FACE_RULE = /@font-face\s*\{[^}]*\}/g;

function splitFamilies(value: string): string[] {
	return value
		.replace(/!important/g, "")
		.split(",")
		.map((family) => family.trim().replace(/^["']|["']$/g, ""))
		.filter(Boolean);
}

function readDeclaredFamilies(css: string): Set<string> {
	const faces = css.match(FONT_FACE_RULE) ?? [];
	return new Set(faces.flatMap((face) => splitFamilies(face.match(/font-family:\s*([^;}]+)/)?.[1] ?? "")));
}

function readFamilyStacks(css: string): string[][] {
	const rules = css.replace(FONT_FACE_RULE, "");
	return [...rules.matchAll(/font-family:\s*([^;}]+)/g)].map(([, value]) => splitFamilies(value));
}

describe("chart font family contract", () => {
	it.each(CHART_STYLESHEETS)("$name only names families the chart iframe can resolve", ({ css }) => {
		const declared = readDeclaredFamilies(css);
		const stacks = readFamilyStacks(css);

		expect(stacks.length).toBeGreaterThan(0);
		for (const family of stacks.flat()) {
			expect(SYSTEM_FONT_FAMILIES.has(family) || declared.has(family), family).toBe(true);
		}
	});

	it.each(CHART_STYLESHEETS)("$name styles chart chrome with the stack the widget draws with", ({ css }) => {
		expect(readFamilyStacks(css)).toContainEqual(splitFamilies(CHART_CUSTOM_FONT_FAMILY));
	});

	it("passes the widget only families every chart stylesheet can resolve", () => {
		const families = splitFamilies(CHART_CUSTOM_FONT_FAMILY);

		expect(families.length).toBeGreaterThan(0);
		for (const family of families) {
			if (SYSTEM_FONT_FAMILIES.has(family)) continue;
			for (const { name, css } of CHART_STYLESHEETS) {
				expect(readDeclaredFamilies(css).has(family), `${family} in ${name}`).toBe(true);
			}
		}
	});
});
