// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	buildChartOverrides,
	chartPaneSeparatorAlpha,
	getChartColors,
	getLoadingScreenColors,
} from "@/lib/chart/theme-colors";

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
			foregroundColor: "#0f1a1f",
		});
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
