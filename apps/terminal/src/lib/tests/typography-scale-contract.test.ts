import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const TERMINAL_CSS = readFileSync(resolve(TEST_DIR, "../../styles.css"), "utf8");
const UI_CSS = readFileSync(resolve(TEST_DIR, "../../../../..", "packages/ui/src/globals.css"), "utf8");

const DOCUMENTED_FONT_SIZES = {
	"3xs": "10px",
	"2xs": "11px",
	xs: "12px",
	"2sm": "13px",
	sm: "14px",
	base: "16px",
};

function readPrimitiveTheme(css: string): string {
	const start = css.indexOf("@theme {");
	const end = css.indexOf("\n}", start);
	return start === -1 || end === -1 ? "" : css.slice(start, end);
}

function readTypeScale(css: string): Record<string, string> {
	const declarations = readPrimitiveTheme(css).matchAll(/--text-([a-z0-9]+(?:--line-height)?):\s*([^;]+);/g);
	return Object.fromEntries([...declarations].map(([, name, value]) => [name, value.trim()]));
}

describe("typography scale contract", () => {
	const terminalScale = readTypeScale(TERMINAL_CSS);
	const uiScale = readTypeScale(UI_CSS);

	it("keeps the shared package scale equal to the terminal scale", () => {
		expect(Object.keys(terminalScale).length).toBeGreaterThan(0);
		expect(uiScale).toEqual(terminalScale);
	});

	it("pairs every font size with a line height", () => {
		const sizes = Object.keys(terminalScale).filter((name) => !name.endsWith("--line-height"));

		expect(sizes.length).toBeGreaterThan(0);
		for (const name of sizes) {
			expect(terminalScale[`${name}--line-height`], `--text-${name}--line-height`).toBeDefined();
		}
	});

	it("matches the named sizes documented in design-tokens.md", () => {
		for (const [name, size] of Object.entries(DOCUMENTED_FONT_SIZES)) {
			expect(terminalScale[name], `--text-${name}`).toBe(size);
		}
	});
});
