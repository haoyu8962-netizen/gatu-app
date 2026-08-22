import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const TERMINAL_THEME_CSS = readFileSync(resolve(TEST_DIR, "../..", "styles.css"), "utf8");
const INPUT_SOURCE = readFileSync(resolve(TEST_DIR, "../..", "components/ui/input.tsx"), "utf8");
const TRADING_CTA_SOURCE = readFileSync(resolve(TEST_DIR, "../..", "lib/ui/trading-cta.ts"), "utf8");

describe("trading panel theme contract", () => {
	it("keeps light order book colors semantic and dark on the measured Hyperliquid palette", () => {
		expect(readCssVariable(TERMINAL_THEME_CSS, ":root", "--orderbook-depth-bid")).toBe("var(--text-success)");
		expect(readCssVariable(TERMINAL_THEME_CSS, ":root", "--orderbook-depth-ask")).toBe("var(--text-error)");
		expect(resolveCssColor(":root", "--orderbook-depth-bid")).toBe("#067a57");
		expect(resolveCssColor(":root", "--orderbook-depth-ask")).toBe("#c73a3a");
		expect(readCssVariable(TERMINAL_THEME_CSS, ".dark", "--orderbook-depth-bid")).toBe("#1fa67d");
		expect(readCssVariable(TERMINAL_THEME_CSS, ".dark", "--orderbook-depth-ask")).toBe("#ed7088");
	});

	it("keeps light order book prices at WCAG AA contrast on the light surface", () => {
		const surface = resolveCssColor(":root", "--bg-raised");
		const bid = resolveCssColor(":root", "--orderbook-depth-bid");
		const ask = resolveCssColor(":root", "--orderbook-depth-ask");

		expect(getContrastRatio(bid, surface)).toBeGreaterThanOrEqual(4.5);
		expect(getContrastRatio(ask, surface)).toBeGreaterThanOrEqual(4.5);
	});

	it("maps the light trading panel to the design handoff palette", () => {
		expect(readCssVariable(TERMINAL_THEME_CSS, ":root", "--trading-panel-text-strong")).toBe("#1a2330");
		expect(readCssVariable(TERMINAL_THEME_CSS, ":root", "--trading-panel-text-muted")).toBe("#6b7686");
		expect(readCssVariable(TERMINAL_THEME_CSS, ":root", "--trading-panel-text-subtle")).toBe("#98a2b0");
		expect(readCssVariable(TERMINAL_THEME_CSS, ":root", "--trading-panel-stroke-card")).toBe("#e3e8ee");
		expect(readCssVariable(TERMINAL_THEME_CSS, ":root", "--trading-panel-stroke-input")).toBe("#d8dfe7");
		expect(readCssVariable(TERMINAL_THEME_CSS, ":root", "--trading-panel-stroke-control")).toBe("#c6cfd9");
		expect(readCssVariable(TERMINAL_THEME_CSS, ":root", "--trading-panel-surface-card")).toBe("#f7f9fb");
		expect(readCssVariable(TERMINAL_THEME_CSS, ":root", "--trading-panel-surface-hover")).toBe("#f1f4f8");
		expect(readCssVariable(TERMINAL_THEME_CSS, ":root", "--trading-panel-control-active")).toBe("#1a2330");
		expect(readCssVariable(TERMINAL_THEME_CSS, ":root", "--trading-panel-success")).toBe("#1f8a5a");
		expect(readCssVariable(TERMINAL_THEME_CSS, ":root", "--trading-panel-error")).toBe("#d6453d");
		expect(readCssVariable(TERMINAL_THEME_CSS, ":root", "--trading-panel-neutral-disabled-fill")).toBe("#c6cfd9");
		expect(readCssVariable(TERMINAL_THEME_CSS, ":root", "--trading-panel-success-disabled-fill")).toBe("#b9dccb");
		expect(readCssVariable(TERMINAL_THEME_CSS, ":root", "--trading-panel-error-disabled-fill")).toBe("#efc3bf");
		expect(readCssVariable(TERMINAL_THEME_CSS, ":root", "--trading-panel-scrim")).toBe("rgb(20 30 45 / 42%)");
	});

	it("keeps the dark panel mapped to terminal semantic colors", () => {
		expect(readCssVariable(TERMINAL_THEME_CSS, ".dark", "--trading-panel-text-strong")).toBe("var(--text-strong)");
		expect(readCssVariable(TERMINAL_THEME_CSS, ".dark", "--trading-panel-text-muted")).toBe("var(--text-weak)");
		expect(readCssVariable(TERMINAL_THEME_CSS, ".dark", "--trading-panel-text-subtle")).toBe("var(--icon-neutral)");
		expect(readCssVariable(TERMINAL_THEME_CSS, ".dark", "--trading-panel-surface-card")).toBe("var(--fill-weak)");
		expect(readCssVariable(TERMINAL_THEME_CSS, ".dark", "--trading-panel-surface-hover")).toBe("var(--fill-press)");
		expect(readCssVariable(TERMINAL_THEME_CSS, ".dark", "--trading-panel-stroke-card")).toBe("var(--stroke-weak)");
		expect(readCssVariable(TERMINAL_THEME_CSS, ".dark", "--trading-panel-stroke-row")).toBe(
			"color-mix(in srgb, var(--stroke-weak) 70%, transparent)",
		);
		expect(readCssVariable(TERMINAL_THEME_CSS, ".dark", "--trading-panel-on-disabled")).toBe("var(--icon-neutral)");
		expect(readCssVariable(TERMINAL_THEME_CSS, ".dark", "--market-close-surface-hover")).toBe("var(--fill-press)");
		expect(readCssVariable(TERMINAL_THEME_CSS, ".dark", "--market-close-text-subtle")).toBe("var(--icon-neutral)");
		expect(readCssVariable(TERMINAL_THEME_CSS, ".dark", "--trading-panel-control-active")).toBe("var(--fill-selected)");
		expect(readCssVariable(TERMINAL_THEME_CSS, ".dark", "--trading-panel-success")).toBe("var(--text-success)");
		expect(readCssVariable(TERMINAL_THEME_CSS, ".dark", "--trading-panel-error")).toBe("var(--text-error)");
		expect(readCssVariable(TERMINAL_THEME_CSS, ".dark", "--trading-panel-neutral-disabled-fill")).toBe(
			"var(--fill-disabled)",
		);
		expect(readCssVariable(TERMINAL_THEME_CSS, ".dark", "--trading-panel-success-disabled-fill")).toBe(
			"var(--fill-disabled)",
		);
		expect(readCssVariable(TERMINAL_THEME_CSS, ".dark", "--trading-panel-error-disabled-fill")).toBe(
			"var(--fill-disabled)",
		);
		expect(readCssVariable(TERMINAL_THEME_CSS, ".dark", "--trading-panel-scrim")).toBe("var(--fill-overlay)");
	});

	it("exposes Tailwind utilities and uses theme-aware selection text", () => {
		expect(readCssVariable(TERMINAL_THEME_CSS, "@theme inline", "--color-trading-panel-fg")).toBe(
			"var(--trading-panel-text-strong)",
		);
		expect(readCssVariable(TERMINAL_THEME_CSS, "@theme inline", "--color-trading-panel-slider-thumb")).toBe(
			"var(--trading-panel-slider-thumb)",
		);
		expect(readCssVariable(TERMINAL_THEME_CSS, "@theme inline", "--color-trading-panel-success")).toBe(
			"var(--trading-panel-success)",
		);
		expect(readCssVariable(TERMINAL_THEME_CSS, "@theme inline", "--color-trading-panel-error")).toBe(
			"var(--trading-panel-error)",
		);
		expect(readCssVariable(TERMINAL_THEME_CSS, "@theme inline", "--shadow-trading-panel-slider")).toBe(
			"var(--trading-panel-slider-shadow)",
		);
		expect(INPUT_SOURCE).toContain("selection:text-fg-inverse");
		expect(INPUT_SOURCE).not.toContain("selection:text-white");
		expect(TRADING_CTA_SOURCE).toContain("data-disabled:bg-trading-panel-neutral-disabled-fill");
		expect(TRADING_CTA_SOURCE).toContain("data-disabled:bg-trading-panel-success-disabled-fill");
		expect(TRADING_CTA_SOURCE).toContain("data-disabled:bg-trading-panel-error-disabled-fill");
		expect(TRADING_CTA_SOURCE).toContain("data-disabled:text-trading-panel-on-disabled");
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

function resolveCssColor(selector: string, variable: string): string {
	let value = readCssVariable(TERMINAL_THEME_CSS, selector, variable);
	for (let depth = 0; depth < 5 && value; depth += 1) {
		const reference = /^var\((--[\w-]+)\)$/.exec(value);
		if (!reference) break;
		value = readCssVariable(TERMINAL_THEME_CSS, selector, reference[1]);
	}
	if (!value || !/^#[0-9a-f]{6}$/i.test(value)) {
		throw new Error(`Could not resolve ${variable} in ${selector} to a hex color, got: ${value}`);
	}
	return value;
}

function getContrastRatio(foreground: string, background: string): number {
	const [lighter, darker] = [getRelativeLuminance(foreground), getRelativeLuminance(background)].sort((a, b) => b - a);
	return (lighter + 0.05) / (darker + 0.05);
}

function getRelativeLuminance(hex: string): number {
	const [red, green, blue] = [1, 3, 5].map((offset) => {
		const channel = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
		return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

describe("shared foreground contract", () => {
	it("keeps disabled text legible in both themes", () => {
		expect(readCssVariable(TERMINAL_THEME_CSS, "@theme inline", "--color-fg-disabled")).toBe("var(--icon-neutral)");
	});
});
