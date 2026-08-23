import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const TERMINAL_STYLES = readFileSync(resolve(TEST_DIR, "../..", "styles.css"), "utf8");
const SHARED_STYLES = readFileSync(resolve(TEST_DIR, "../../../../..", "packages/ui/src/globals.css"), "utf8");
const WEBSITE_STYLES = readFileSync(resolve(TEST_DIR, "../../../..", "website/src/styles/global.css"), "utf8");
const WEBSITE_HERO = readFileSync(resolve(TEST_DIR, "../../../..", "website/src/components/Hero.astro"), "utf8");
const WEBSITE_MARKETS = readFileSync(resolve(TEST_DIR, "../../../..", "website/src/components/Markets.astro"), "utf8");
const CHART_THEME_COLORS = readFileSync(resolve(TEST_DIR, "../..", "lib/chart/theme-colors.ts"), "utf8");
const TERMINAL_OG_IMAGE = readFileSync(resolve(TEST_DIR, "../../..", "public/og-terminal-1200x630.png"));
const WEBSITE_OG_IMAGE = readFileSync(resolve(TEST_DIR, "../../../..", "website/public/og-website-1200x630.png"));

describe("brand semantics contract", () => {
	it("defines the same action, signal, and focus roles in the shared and terminal themes", () => {
		for (const stylesheet of [SHARED_STYLES, TERMINAL_STYLES]) {
			expect(readCssVariable(stylesheet, ":root", "--action")).toBe("#15171e");
			expect(readCssVariable(stylesheet, ":root", "--on-action")).toBe("#ffffff");
			expect(readCssVariable(stylesheet, ":root", "--signal")).toBe("#667311");
			expect(readCssVariable(stylesheet, ":root", "--focus")).toBe("var(--signal)");
			expect(readCssVariable(stylesheet, ".dark", "--action")).toBe("#edeef2");
			expect(readCssVariable(stylesheet, ".dark", "--on-action")).toBe("#08090d");
			expect(readCssVariable(stylesheet, ".dark", "--signal")).toBe("#d7ff3f");
			expect(readCssVariable(stylesheet, ".dark", "--focus")).toBe("var(--signal)");
		}
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

	it("uses signal and action semantics on the website without legacy gradient or glow treatments", () => {
		expect(readCssVariable(WEBSITE_STYLES, ":root", "--action")).toBe("#edeef2");
		expect(readCssVariable(WEBSITE_STYLES, ":root", "--signal")).toBe("#d7ff3f");
		expect(readCssVariable(WEBSITE_STYLES, ":root", "--focus")).toBe("var(--signal)");
		expect(readCssVariable(WEBSITE_STYLES, ":root", "--logo-ink")).toBe("#edeef2");
		expect(readCssVariable(WEBSITE_STYLES, ":root", "--logo-node")).toBe("#d7ff3f");
		expect(WEBSITE_HERO).toContain("bg-action");
		expect(WEBSITE_HERO).toContain("text-on-action");
		expect(WEBSITE_HERO).toContain("text-signal");
		expect(WEBSITE_MARKETS).toContain("text-signal");

		const websiteBrandSources = `${WEBSITE_STYLES}\n${WEBSITE_HERO}\n${WEBSITE_MARKETS}`;
		for (const legacyTreatment of ["#26d2ec", "#46f0de", "#2e86f5", "glow-radial", "text-brand-gradient"]) {
			expect(websiteBrandSources.toLowerCase()).not.toContain(legacyTreatment);
		}
	});

	it("ships distinct Terminal and Website social cards at the declared large-card dimensions", () => {
		for (const image of [TERMINAL_OG_IMAGE, WEBSITE_OG_IMAGE]) {
			expect(image.toString("ascii", 12, 16)).toBe("IHDR");
			expect(image.readUInt32BE(16)).toBe(1200);
			expect(image.readUInt32BE(20)).toBe(630);
		}
		expect(TERMINAL_OG_IMAGE.equals(WEBSITE_OG_IMAGE)).toBe(false);
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
