import { i18n } from "@lingui/core";
import { beforeEach, describe, expect, it } from "vitest";
import { formatDecimalString } from "@/lib/format";
import type { OpenOrder } from "@/lib/trade/open-orders";
import { getTrailingStopConditionLabels, parseTrailingStopCondition } from "@/lib/trade/trailing-stop-condition";
import type { Translate } from "@/lib/translate";

const translate: Translate = (descriptor) => i18n._(descriptor);

function trailingStop(overrides: Partial<Record<"side" | "triggerCondition" | "triggerPx", string>> = {}) {
	return {
		orderType: "Trailing Stop Market",
		side: "A",
		triggerCondition: "retracement 1%, activation above 100, best waiting",
		triggerPx: "0.0",
		...overrides,
	} as unknown as Pick<OpenOrder, "orderType" | "side" | "triggerCondition" | "triggerPx">;
}

describe("parseTrailingStopCondition", () => {
	it("reads the activation price and retracement before activation", () => {
		expect(parseTrailingStopCondition(trailingStop())).toEqual({
			kind: "activation",
			price: "100",
			retracement: "1%",
		});
		expect(
			parseTrailingStopCondition(trailingStop({ triggerCondition: "Retracement 2.5, Activation below 80" })),
		).toEqual({ kind: "activation", price: "80", retracement: "2.5" });
	});

	it("falls back to a nonzero trigger price when the condition names no activation price", () => {
		expect(parseTrailingStopCondition(trailingStop({ triggerCondition: "retracement 1%" }))).toEqual({
			kind: "activation",
			price: null,
			retracement: "1%",
		});
		expect(
			parseTrailingStopCondition(trailingStop({ triggerCondition: "retracement 1%", triggerPx: "101.5" })),
		).toEqual({ kind: "activation", price: "101.5", retracement: "1%" });
		expect(
			parseTrailingStopCondition(
				trailingStop({ triggerCondition: "retracement 1%, activation above abc", triggerPx: "99" }),
			),
		).toEqual({ kind: "activation", price: "99", retracement: "1%" });
	});

	it("derives the trigger from the best price: below it for a sell, above it for a buy", () => {
		expect(parseTrailingStopCondition(trailingStop({ triggerCondition: "retracement 1%, best 105" }))).toEqual({
			kind: "trigger",
			price: "103.95",
			retracement: "1%",
			watermark: "105",
		});
		expect(
			parseTrailingStopCondition(trailingStop({ side: "B", triggerCondition: "retracement 2, best 95.5" })),
		).toEqual({ kind: "trigger", price: "97.5", retracement: "2", watermark: "95.5" });
	});

	it("returns null for a condition outside the official grammar", () => {
		for (const triggerCondition of [
			"Price above 100",
			"N/A",
			"",
			"retracement , best 105",
			"retracement 1%, best abc",
			"retracement x%, best 105",
		]) {
			expect(parseTrailingStopCondition(trailingStop({ triggerCondition }))).toBeNull();
		}
	});
});

describe("getTrailingStopConditionLabels", () => {
	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
	});

	const formatters = {
		translate,
		formatPrice: (price: string) => `$${price}`,
		formatDecimalString,
	};

	it("writes the official terminal's activation and trigger text with the watermark once active", () => {
		expect(getTrailingStopConditionLabels(trailingStop(), formatters)).toEqual({
			label: "Activation: $100 / Retracement: 1%",
			watermarkLabel: null,
		});
		expect(
			getTrailingStopConditionLabels(trailingStop({ triggerCondition: "retracement 1%, best 105" }), formatters),
		).toEqual({ label: "Trigger: $103.95 / Retracement: 1%", watermarkLabel: "Watermark: $105" });
		expect(
			getTrailingStopConditionLabels(trailingStop({ triggerCondition: "retracement 1%" }), formatters)?.label,
		).toBe("Activation: - / Retracement: 1%");
	});

	it("shows the retracement in the number format and keeps an unreadable one as sent", () => {
		expect(
			getTrailingStopConditionLabels(
				trailingStop({ triggerCondition: "retracement 1234.5, activation above 100" }),
				formatters,
			)?.label,
		).toBe("Activation: $100 / Retracement: 1,234.5");
		expect(
			getTrailingStopConditionLabels(
				trailingStop({ triggerCondition: "retracement 1e2, activation above 100" }),
				formatters,
			)?.label,
		).toBe("Activation: $100 / Retracement: 1e2");
	});

	it("leaves other orders and unreadable conditions to the standard trigger text", () => {
		expect(
			getTrailingStopConditionLabels({ ...trailingStop(), orderType: "Stop Market" } as OpenOrder, formatters),
		).toBeNull();
		expect(getTrailingStopConditionLabels(trailingStop({ triggerCondition: "N/A" }), formatters)).toBeNull();
	});
});
