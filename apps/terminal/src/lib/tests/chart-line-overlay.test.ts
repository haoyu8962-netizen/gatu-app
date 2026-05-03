// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const { registerOverlay } = vi.hoisted(() => ({
	registerOverlay: vi.fn(),
}));

vi.mock("klinecharts", () => ({ registerOverlay }));
vi.mock("@/lib/chart/theme-colors", () => ({
	colorToHex: (color: string) => color,
	colorToRgba: (color: string, alpha: number) => `${color}:${alpha}`,
	getChartColors: () => ({
		background: "#000000",
		foreground: "#ffffff",
		textSecondary: "#888888",
		textTertiary: "#777777",
		border: "#333333",
		green: "#00ff00",
		red: "#ff0000",
		accent: "#0000ff",
		surface: "#111111",
	}),
}));

describe("line overlays", () => {
	beforeEach(() => {
		vi.resetModules();
		registerOverlay.mockClear();
	});

	it("registers the liquidation overlay once with a liquidation label", async () => {
		const { LIQUIDATION_LINE_NAME, registerLiquidationLineOverlay } = await import(
			"@/lib/chart/liquidation-line-overlay"
		);

		registerLiquidationLineOverlay();
		registerLiquidationLineOverlay();

		expect(registerOverlay).toHaveBeenCalledOnce();
		const overlayConfig = registerOverlay.mock.calls[0]?.[0];
		expect(overlayConfig).toMatchObject({
			name: LIQUIDATION_LINE_NAME,
			lock: true,
			totalStep: 1,
		});

		const figures = overlayConfig?.createPointFigures?.({
			overlay: { extendData: undefined, points: [{ value: 1234.567 }] },
			coordinates: [{ x: 0, y: 42 }],
			bounding: { width: 320 },
			precision: { price: 2 },
		});

		expect(figures?.[1]).toMatchObject({
			type: "text",
			attrs: { text: "Liq." },
		});
		expect(figures?.[2]).toMatchObject({
			type: "text",
			attrs: { text: "1234.57" },
		});
	});

	it("registers position overlays with long and short labels", async () => {
		const { registerPositionLineOverlay } = await import("@/lib/chart/position-line-overlay");

		registerPositionLineOverlay();

		const overlayConfig = registerOverlay.mock.calls[0]?.[0];
		const longFigures = overlayConfig?.createPointFigures?.({
			overlay: { extendData: { isLong: true }, points: [{ value: 100 }] },
			coordinates: [{ x: 0, y: 20 }],
			bounding: { width: 320 },
			precision: { price: 0 },
		});
		const shortFigures = overlayConfig?.createPointFigures?.({
			overlay: { extendData: { isLong: false }, points: [{ value: 100 }] },
			coordinates: [{ x: 0, y: 20 }],
			bounding: { width: 320 },
			precision: { price: 0 },
		});

		expect(longFigures?.[1]).toMatchObject({ attrs: { text: "Long" } });
		expect(shortFigures?.[1]).toMatchObject({ attrs: { text: "Short" } });
	});
});
