import { describe, expect, it } from "vitest";
import { resolveChartLocale } from "@/config/chart";
import { isRtlLocale, languageToIntlLocale } from "@/config/i18n";

describe("TradingView locale mapping", () => {
	it("uses Japanese dates and left-to-right presentation", () => {
		expect(languageToIntlLocale.ja).toBe("ja-JP");
		expect(isRtlLocale("ja")).toBe(false);
	});

	it.each([
		["en", "en"],
		["zh", "zh"],
		["ja", "ja"],
		["es", "es"],
		["fr", "fr"],
		["ar", "ar"],
		["hi", "en"],
		["unknown", "en"],
	])("maps %s to %s", (appLocale, chartLocale) => {
		expect(resolveChartLocale(appLocale)).toBe(chartLocale);
	});
});
