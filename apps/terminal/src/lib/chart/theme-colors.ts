/**
 * Utility to read CSS variables and build TradingView chart overrides
 * This ensures the chart colors stay in sync with the app theme
 */

import type { ColorGradient, CustomThemeColors } from "@/types/charting_library";

type ChartColors = {
	background: string;
	foreground: string;
	textSecondary: string;
	textTertiary: string;
	border: string;
	green: string;
	red: string;
	accent: string;
	surface: string;
};

function getCssVar(name: string): string {
	if (typeof window === "undefined") return "";
	return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function parseHexColor(cssColor: string): { r: number; g: number; b: number; a: number } | null {
	const raw = cssColor.trim();
	if (!raw.startsWith("#")) return null;
	const hex = raw.slice(1);
	if (hex.length === 6) {
		return {
			r: Number.parseInt(hex.slice(0, 2), 16),
			g: Number.parseInt(hex.slice(2, 4), 16),
			b: Number.parseInt(hex.slice(4, 6), 16),
			a: 1,
		};
	}
	if (hex.length === 8) {
		return {
			r: Number.parseInt(hex.slice(0, 2), 16),
			g: Number.parseInt(hex.slice(2, 4), 16),
			b: Number.parseInt(hex.slice(4, 6), 16),
			a: Number.parseInt(hex.slice(6, 8), 16) / 255,
		};
	}
	return null;
}

export function strokeWeakBorderRgba(cssColor: string, opacityFactor: number): string {
	const parsed = parseHexColor(cssColor);
	if (!parsed) return colorToRgba(cssColor, opacityFactor);
	const a = Math.min(1, parsed.a * opacityFactor);
	return `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${a})`;
}

export function strokeWeakLayerRgba(cssColor: string, alpha: number): string {
	const parsed = parseHexColor(cssColor);
	if (!parsed) return colorToRgba(cssColor, alpha);
	return `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${alpha})`;
}

export const chartGridAlpha = 0.1;
export const chartCrosshairAlpha = 0.35;
export const chartScaleLineAlpha = 0.2;
export const chartPaneSeparatorAlpha = 0.14;

export function colorToHex(cssColor: string): string {
	if (!cssColor || typeof document === "undefined") return "#000000";

	const canvas = document.createElement("canvas");
	canvas.width = 1;
	canvas.height = 1;
	const ctx = canvas.getContext("2d");
	if (!ctx) return "#000000";

	ctx.fillStyle = cssColor;
	ctx.fillRect(0, 0, 1, 1);

	const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
	return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

export function colorToRgba(cssColor: string, alpha: number): string {
	if (!cssColor || typeof document === "undefined") return `rgba(0, 0, 0, ${alpha})`;

	const canvas = document.createElement("canvas");
	canvas.width = 1;
	canvas.height = 1;
	const ctx = canvas.getContext("2d");
	if (!ctx) return `rgba(0, 0, 0, ${alpha})`;

	ctx.fillStyle = cssColor;
	ctx.fillRect(0, 0, 1, 1);

	const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function getChartColors(): ChartColors {
	return {
		background: getCssVar("--bg-raised"),
		foreground: getCssVar("--text-strong"),
		textSecondary: getCssVar("--text-weak"),
		textTertiary: getCssVar("--text-weak"),
		border: getCssVar("--stroke-weak"),
		green: getCssVar("--market-up"),
		red: getCssVar("--market-down"),
		accent: getCssVar("--fill-brand-strong"),
		surface: getCssVar("--bg-raised"),
	};
}

export function buildChartOverrides(): Record<string, string | number | boolean> {
	const colors = getChartColors();

	const bg = colorToHex(colors.background);
	const textSecondary = colorToHex(colors.textSecondary);
	const green = colorToHex(colors.green);
	const red = colorToHex(colors.red);

	const gridColor = strokeWeakLayerRgba(colors.border, chartGridAlpha);
	const crosshairColor = strokeWeakLayerRgba(colors.border, chartCrosshairAlpha);

	return {
		"paneProperties.background": bg,
		"paneProperties.backgroundType": "solid",
		"paneProperties.vertGridProperties.color": gridColor,
		"paneProperties.vertGridProperties.style": 1,
		"paneProperties.horzGridProperties.color": gridColor,
		"paneProperties.horzGridProperties.style": 1,
		"paneProperties.crossHairProperties.color": crosshairColor,
		"paneProperties.crossHairProperties.style": 2,
		"paneProperties.crossHairProperties.width": 1,

		"paneProperties.legendProperties.showStudyArguments": true,
		"paneProperties.legendProperties.showStudyTitles": true,
		"paneProperties.legendProperties.showStudyValues": true,
		"paneProperties.legendProperties.showSeriesTitle": true,
		"paneProperties.legendProperties.showSeriesOHLC": true,
		"paneProperties.legendProperties.showLegend": true,
		"paneProperties.legendProperties.showBarChange": true,
		"paneProperties.legendProperties.showVolume": false,

		"scalesProperties.backgroundColor": bg,
		"scalesProperties.lineColor": strokeWeakLayerRgba(colors.border, chartScaleLineAlpha),
		"scalesProperties.textColor": textSecondary,
		"scalesProperties.fontSize": 10,
		"scalesProperties.scaleSeriesOnly": false,

		"mainSeriesProperties.candleStyle.upColor": green,
		"mainSeriesProperties.candleStyle.downColor": red,
		"mainSeriesProperties.candleStyle.borderUpColor": green,
		"mainSeriesProperties.candleStyle.borderDownColor": red,
		"mainSeriesProperties.candleStyle.wickUpColor": green,
		"mainSeriesProperties.candleStyle.wickDownColor": red,
		"mainSeriesProperties.candleStyle.drawBorder": true,
		"mainSeriesProperties.candleStyle.drawWick": true,

		"mainSeriesProperties.hollowCandleStyle.upColor": green,
		"mainSeriesProperties.hollowCandleStyle.downColor": red,
		"mainSeriesProperties.hollowCandleStyle.borderUpColor": green,
		"mainSeriesProperties.hollowCandleStyle.borderDownColor": red,
		"mainSeriesProperties.hollowCandleStyle.wickUpColor": green,
		"mainSeriesProperties.hollowCandleStyle.wickDownColor": red,

		"mainSeriesProperties.haStyle.upColor": green,
		"mainSeriesProperties.haStyle.downColor": red,
		"mainSeriesProperties.haStyle.borderUpColor": green,
		"mainSeriesProperties.haStyle.borderDownColor": red,
		"mainSeriesProperties.haStyle.wickUpColor": green,
		"mainSeriesProperties.haStyle.wickDownColor": red,

		"mainSeriesProperties.barStyle.upColor": green,
		"mainSeriesProperties.barStyle.downColor": red,

		"mainSeriesProperties.lineStyle.color": textSecondary,
		"mainSeriesProperties.lineStyle.linewidth": 2,

		"mainSeriesProperties.areaStyle.color1": colorToRgba(colors.textSecondary, 0.18),
		"mainSeriesProperties.areaStyle.color2": colorToRgba(colors.textSecondary, 0.02),
		"mainSeriesProperties.areaStyle.linecolor": textSecondary,
		"mainSeriesProperties.areaStyle.linewidth": 2,

		"mainSeriesProperties.baselineStyle.topFillColor1": colorToRgba(colors.green, 0.28),
		"mainSeriesProperties.baselineStyle.topFillColor2": colorToRgba(colors.green, 0.02),
		"mainSeriesProperties.baselineStyle.bottomFillColor1": colorToRgba(colors.red, 0.02),
		"mainSeriesProperties.baselineStyle.bottomFillColor2": colorToRgba(colors.red, 0.28),
		"mainSeriesProperties.baselineStyle.topLineColor": green,
		"mainSeriesProperties.baselineStyle.bottomLineColor": red,

		"mainSeriesProperties.priceLineColor": textSecondary,
		"mainSeriesProperties.priceLineWidth": 1,
		"mainSeriesProperties.showPriceLine": true,
		"mainSeriesProperties.showCountdown": true,

		"mainSeriesProperties.statusViewStyle.fontSize": 10,
		"mainSeriesProperties.statusViewStyle.showExchange": false,
		"mainSeriesProperties.statusViewStyle.showInterval": true,
		"mainSeriesProperties.statusViewStyle.symbolTextSource": "description",

		"symbolWatermarkProperties.transparency": 96,
		"symbolWatermarkProperties.color": colorToRgba(colors.foreground, 0.03),

		volumePaneSize: "small",
	};
}

export function getLoadingScreenColors(): { backgroundColor: string; foregroundColor: string } {
	const colors = getChartColors();
	return {
		backgroundColor: colorToHex(colors.background),
		foregroundColor: colorToHex(colors.background),
	};
}

export function getToolbarBgColor(): string {
	const colors = getChartColors();
	return colorToHex(colors.background);
}

function generateColorGradient(baseHex: string): ColorGradient {
	const r = Number.parseInt(baseHex.slice(1, 3), 16);
	const g = Number.parseInt(baseHex.slice(3, 5), 16);
	const b = Number.parseInt(baseHex.slice(5, 7), 16);

	const shades = new Array<string>(19);

	for (let i = 0; i < 19; i++) {
		let newR: number;
		let newG: number;
		let newB: number;

		if (i < 9) {
			const lightFactor = 1 - i / 9;
			newR = Math.round(r + (255 - r) * lightFactor);
			newG = Math.round(g + (255 - g) * lightFactor);
			newB = Math.round(b + (255 - b) * lightFactor);
		} else if (i === 9) {
			newR = r;
			newG = g;
			newB = b;
		} else {
			const darkFactor = 1 - (i - 9) / 9;
			newR = Math.round(r * darkFactor);
			newG = Math.round(g * darkFactor);
			newB = Math.round(b * darkFactor);
		}

		const hex = `#${newR.toString(16).padStart(2, "0")}${newG.toString(16).padStart(2, "0")}${newB.toString(16).padStart(2, "0")}`;
		shades[i] = hex;
	}

	return shades as ColorGradient;
}

export function getCustomThemeColors(): CustomThemeColors {
	const colors = getChartColors();

	const accent = colorToHex(colors.accent);
	const textTertiary = colorToHex(colors.textTertiary);
	const red = colorToHex(colors.red);
	const green = colorToHex(colors.green);
	const amber = colorToHex(getCssVar("--text-warning") || colors.accent);
	const purple = colorToHex(getCssVar("--fill-brand-strong") || colors.accent);
	const bg = colorToHex(colors.background);
	const fg = colorToHex(colors.foreground);

	return {
		color1: generateColorGradient(accent),
		color2: generateColorGradient(textTertiary),
		color3: generateColorGradient(red),
		color4: generateColorGradient(green),
		color5: generateColorGradient(amber),
		color6: generateColorGradient(purple),
		color7: generateColorGradient(accent),
		white: bg,
		black: fg,
	};
}

export function getChartCssUrl(_theme: "light" | "dark"): string {
	return "/tradingview-theme.css";
}
