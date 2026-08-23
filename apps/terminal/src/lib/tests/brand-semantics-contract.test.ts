import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const TERMINAL_STYLES = readFileSync(resolve(TEST_DIR, "../..", "styles.css"), "utf8");
const CHART_THEME_COLORS = readFileSync(resolve(TEST_DIR, "../..", "lib/chart/theme-colors.ts"), "utf8");

describe("brand semantics contract", () => {
	it("defines the terminal action, signal, and focus roles in both themes", () => {
		expect(readCssVariable(TERMINAL_STYLES, ":root", "--action")).toBe("#15171e");
		expect(readCssVariable(TERMINAL_STYLES, ":root", "--on-action")).toBe("#ffffff");
		expect(readCssVariable(TERMINAL_STYLES, ":root", "--signal")).toBe("#667311");
		expect(readCssVariable(TERMINAL_STYLES, ":root", "--focus")).toBe("var(--signal)");
		expect(readCssVariable(TERMINAL_STYLES, ".dark", "--action")).toBe("#edeef2");
		expect(readCssVariable(TERMINAL_STYLES, ".dark", "--on-action")).toBe("#08090d");
		expect(readCssVariable(TERMINAL_STYLES, ".dark", "--signal")).toBe("#d7ff3f");
		expect(readCssVariable(TERMINAL_STYLES, ".dark", "--focus")).toBe("var(--signal)");
	});

	it("keeps logo roles theme-aware and chart accent independent from the brand roles", () => {
		expect(readCssVariable(TERMINAL_STYLES, ":root", "--logo-ink")).toBe("#15171e");
		expect(readCssVariable(TERMINAL_STYLES, ":root", "--logo-node")).toBe("#15171e");
		expect(readCssVariable(TERMINAL_STYLES, ".dark", "--logo-ink")).toBe("#edeef2");
		expect(readCssVariable(TERMINAL_STYLES, ".dark", "--logo-node")).toBe("#d7ff3f");
		expect(readCssVariable(TERMINAL_STYLES, ":root", "--chart-accent")).toBe("#4c64d9");
		expect(readCssVariable(TERMINAL_STYLES, ".dark", "--chart-accent")).toBe("#b2bcf1");
		expect(CHART_THEME_COLORS).toContain('getCssVar("--chart-accent")');
		expect(CHART_THEME_COLORS).not.toContain('getCssVar("--fill-brand-strong")');
	});

	it("keeps the orbit loader tokenized and replaces motion with the complete static mark", () => {
		expect(TERMINAL_STYLES).toContain("animation: gatu-orbit-loader 1.5s linear infinite;");
		expect(TERMINAL_STYLES).toContain("stroke-dashoffset: -100;");
		expect(TERMINAL_STYLES).toContain(`@media (prefers-reduced-motion: reduce) {
    .gatu-orbit-loader__track {
      opacity: 1;
    }

    .gatu-orbit-loader__segment {
      animation: none;
      opacity: 0;
    }

    .gatu-orbit-loader__static-node {
      opacity: 1;
    }
  }`);
	});

	it("preserves terminal canvas, order-book, scope, and market colors", () => {
		expect(readCssVariable(TERMINAL_STYLES, ".dark", "--bg-base")).toBe("#0f1a1f");
		expect(readCssVariable(TERMINAL_STYLES, ".dark", "--orderbook-depth-bid")).toBe("#1fa67d");
		expect(readCssVariable(TERMINAL_STYLES, ".dark", "--orderbook-depth-ask")).toBe("#ed7088");
		expect(readCssVariable(TERMINAL_STYLES, ".dark", "--scope-perp")).toBe("#4F7DFF");
		expect(readCssVariable(TERMINAL_STYLES, ".dark", "--scope-spot")).toBe("#2DD4BF");
		expect(readCssVariable(TERMINAL_STYLES, ".dark", "--market-up")).toBe("var(--text-success)");
		expect(readCssVariable(TERMINAL_STYLES, ".dark", "--market-down")).toBe("var(--text-error)");
	});
});

function readCssVariable(source: string, selector: string, variable: string): string | undefined {
	const selectorStart = source.indexOf(`${selector} {`);
	if (selectorStart === -1) return undefined;

	const blockStart = source.indexOf("{", selectorStart);
	const blockEnd = source.indexOf("}", blockStart);
	if (blockStart === -1 || blockEnd === -1) return undefined;

	const declaration = new RegExp(`${variable}:\\s*([^;]+);`).exec(source.slice(blockStart + 1, blockEnd));
	return declaration?.[1]?.trim();
}
