// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	buildChartOverrides,
	chartPaneSeparatorAlpha,
	getChartColors,
	getLoadingScreenColors,
} from "@/lib/chart/theme-colors";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const TRADINGVIEW_THEME_STYLESHEETS = [
	readFileSync(resolve(TEST_DIR, "../../../public/tradingview-theme-dark.css"), "utf8"),
	readFileSync(resolve(TEST_DIR, "../../../public/tradingview-theme-light.css"), "utf8"),
];

const cssVariables = {
	"--bg-base": "#0f1a1f",
	"--bg-raised": "#1d1e26",
	"--fill-brand-strong": "#b2bcf1",
	"--market-down": "#ed7088",
	"--market-up": "#0a9981",
	"--stroke-weak": "#ffffff1f",
	"--text-strong": "#ffffff",
	"--text-weak": "#ffffffc7",
} as const;

describe("chart theme colors", () => {
	beforeEach(() => {
		for (const [name, value] of Object.entries(cssVariables)) {
			document.documentElement.style.setProperty(name, value);
		}

		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => createCanvasContext());
	});

	afterEach(() => {
		for (const name of Object.keys(cssVariables)) {
			document.documentElement.style.removeProperty(name);
		}
		vi.restoreAllMocks();
	});

	it("uses the base background independently from raised surfaces", () => {
		const colors = getChartColors();
		const overrides = buildChartOverrides();

		expect(colors.background).toBe("#0f1a1f");
		expect(colors.surface).toBe("#1d1e26");
		expect(overrides["paneProperties.background"]).toBe("#0f1a1f");
		expect(overrides["scalesProperties.backgroundColor"]).toBe("#0f1a1f");
		expect(getLoadingScreenColors()).toEqual({
			backgroundColor: "#0f1a1f",
			foregroundColor: "#ffffff",
		});
	});

	it("keeps the dark chart canvas separate from elevated interactive chrome", () => {
		for (const stylesheet of TRADINGVIEW_THEME_STYLESHEETS) {
			expect(stylesheet).toContain("--tv-app-bg: #0f1a1f;");
			expect(stylesheet).toContain("--tv-raised-bg: #1d1e26;");
			expect(stylesheet).toContain("--tv-muted-fg: #ffffffc7;");
			expect(stylesheet).toContain(
				"html,\nbody,\n.chart-page,\n.chart-container,\n.layout__area--center {\n\tbackground: var(--tv-bg) !important;",
			);
			expect(stylesheet).toContain(
				".layout__area--top,\n.layout__area--left,\n.chart-controls-bar {\n\tbackground: var(--tv-raised-bg) !important;",
			);
			expect(stylesheet).toContain(
				'[class*="search"] input,\n[class*="Search"] input,\ninput[class*="search"],\ninput[class*="Search"] {',
			);
			expect(stylesheet).toContain("background-color: var(--themed-color-input-bg, var(--tv-raised-bg)) !important;");
		}
	});

	it("overrides the TradingView pane separator with the shared border treatment", () => {
		const overrides = buildChartOverrides();

		expect(overrides["paneProperties.separatorColor"]).toBe(`rgba(255, 255, 255, ${chartPaneSeparatorAlpha})`);
	});
});

function createCanvasContext(): CanvasRenderingContext2D {
	let fillStyle = "#000000";

	return {
		get fillStyle() {
			return fillStyle;
		},
		set fillStyle(value: string | CanvasGradient | CanvasPattern) {
			fillStyle = String(value);
		},
		fillRect: vi.fn(),
		getImageData: () => ({ data: parseHexColor(fillStyle) }),
	} as unknown as CanvasRenderingContext2D;
}

function parseHexColor(color: string): Uint8ClampedArray {
	const hex = color.slice(1, 7);
	return new Uint8ClampedArray([
		Number.parseInt(hex.slice(0, 2), 16),
		Number.parseInt(hex.slice(2, 4), 16),
		Number.parseInt(hex.slice(4, 6), 16),
		255,
	]);
}
