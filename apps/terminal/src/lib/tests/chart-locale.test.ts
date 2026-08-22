import { describe, expect, it } from "vitest";
import { resolveChartLocale } from "@/config/chart";

describe("TradingView locale mapping", () => {
	it.each([
		["en", "en"],
		["zh", "zh"],
		["es", "es"],
		["fr", "fr"],
		["ar", "ar"],
		["hi", "en"],
		["unknown", "en"],
	])("maps %s to %s", (appLocale, chartLocale) => {
		expect(resolveChartLocale(appLocale)).toBe(chartLocale);
	});
});
