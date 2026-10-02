import { i18n } from "@lingui/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	bpsToPercentage,
	formatDateTime,
	formatDateTimeShort,
	formatLiquidationPrice,
	formatNumber,
	formatPercent,
	formatPrice,
	formatQuoteAmount,
	formatSlippageBps,
	formatTime,
	formatToken,
	formatUSD,
	getNumberFormatters,
	type NumberFormatters,
	normalizeDecimalInput,
	shortenAddress,
	szDecimalsToPriceDecimals,
} from "@/lib/format";
import { notifyNumberFormatChange } from "@/lib/number-format-reactivity";

const formatSettings = vi.hoisted(() => ({
	numberFormatLocale: "en-US" as "en-US" | "de-DE" | "fr-FR",
}));

vi.mock("@/stores/use-global-settings-store", () => ({
	getResolvedFormatLocale: () => formatSettings.numberFormatLocale,
}));

vi.mock("@lingui/core/macro", () => ({
	msg: (strings: TemplateStringsArray | string, ...values: unknown[]) => {
		if (typeof strings === "string") return strings;
		return strings.reduce((message, part, index) => `${message}${part}${values[index] ?? ""}`, "");
	},
	t: (strings: TemplateStringsArray | string, ...values: unknown[]) => {
		if (typeof strings === "string") return strings;
		return strings.reduce((message, part, index) => `${message}${part}${values[index] ?? ""}`, "");
	},
}));

const NUMBER_FORMATTER_NAMES: (keyof NumberFormatters)[] = [
	"formatLiquidationPrice",
	"formatNumber",
	"formatPercent",
	"formatPrice",
	"formatQuoteAmount",
	"formatSlippageBps",
	"formatToken",
	"formatUSD",
];

const SAMPLE_CALLS: { [Name in keyof NumberFormatters]: Parameters<NumberFormatters[Name]> } = {
	formatLiquidationPrice: ["1234.56", 2],
	formatNumber: [1234.56, 2],
	formatPercent: [12.5, 2],
	formatPrice: [1234.56, { szDecimals: 2 }],
	formatQuoteAmount: ["1234.56", "USDC", 2],
	formatSlippageBps: [37],
	formatToken: ["1234.56", 2],
	formatUSD: [1234.56],
};

function callFormatter(formatters: NumberFormatters, name: keyof NumberFormatters) {
	return (formatters[name] as (...args: unknown[]) => string | null)(...SAMPLE_CALLS[name]);
}

describe("number formatters from useNumberFormat()", () => {
	beforeEach(() => {
		formatSettings.numberFormatLocale = "en-US";
	});

	it("lists every formatter the snapshot carries", () => {
		expect(Object.keys(getNumberFormatters()).sort()).toEqual([...NUMBER_FORMATTER_NAMES].sort());
	});

	it.each(NUMBER_FORMATTER_NAMES)("gives %s a new identity on each change and keeps it until the next", (name) => {
		const before = getNumberFormatters();
		expect(getNumberFormatters()[name]).toBe(before[name]);

		notifyNumberFormatChange();
		const after = getNumberFormatters();

		expect(after).not.toBe(before);
		expect(after[name]).not.toBe(before[name]);
		expect(getNumberFormatters()[name]).toBe(after[name]);
	});

	it.each(NUMBER_FORMATTER_NAMES)("lets %s from an earlier snapshot format with the current setting", (name) => {
		const before = getNumberFormatters();
		const english = callFormatter(before, name);
		formatSettings.numberFormatLocale = "de-DE";
		notifyNumberFormatChange();
		const german = callFormatter(getNumberFormatters(), name);

		expect(german).not.toBe(english);
		expect(callFormatter(before, name)).toBe(german);
	});
});

describe("format", () => {
	beforeEach(() => {
		formatSettings.numberFormatLocale = "en-US";
		i18n.loadAndActivate({ locale: "en", messages: {} });
	});

	it("formats USD values with fixed digits", () => {
		expect(formatUSD(1234.56)).toBe("$1,234.56");
		expect(formatUSD(1234.56, 0)).toBe("$1,235");
		expect(formatUSD(150000)).toBe("$150K");
		expect(formatUSD(150000, { compact: false })).toBe("$150,000.00");
	});

	it("formats prices using szDecimals", () => {
		expect(szDecimalsToPriceDecimals(4)).toBe(2);
		expect(szDecimalsToPriceDecimals(0, "spot")).toBe(8);
		expect(formatPrice(88140.123, { szDecimals: 4 })).toBe("$88,140.12");
		expect(formatPrice("0.00000011", { szDecimals: 0, marketType: "spot" })).toBe("$0.00000011");
		expect(formatPrice("447.934", { szDecimals: 3, style: "decimal" })).toBe("447.934");
		expect(formatLiquidationPrice("447.934", 3, { style: "decimal" })).toBe("447.934");
	});

	it("formats token amounts and percentages", () => {
		expect(formatToken(1.23456, 2)).toBe("1.23");
		expect(formatToken(1.23456, { decimals: 3, symbol: "ETH" })).toBe("1.235 ETH");
		expect(formatQuoteAmount("12345.67", "USDH", 2)).toBe("12,345.67 USDH");
		expect(formatPercent(0.125, 2)).toBe("+12.50%");
	});

	it("formats numbers and shortens addresses", () => {
		expect(formatNumber(1234.56, 1)).toBe("1,234.6");
		expect(shortenAddress("0x1234567890123456789012345678901234567890")).toBe("0x1234...7890");
	});

	it.each([
		["en-US", "1,234.56", "$1,234.56", "+12.50%", "$12.5K"],
		["de-DE", "1.234,56", "$1.234,56", "+12,50%", "$12,5K"],
		["fr-FR", "1 234,56", "$1 234,56", "+12,50%", "$12,5K"],
	] as const)("changes only number separators for the %s preset", (locale, number, usd, percent, compactUsd) => {
		formatSettings.numberFormatLocale = locale;

		expect(formatNumber(1234.56, 2)).toBe(number);
		expect(formatUSD(1234.56, { compact: false })).toBe(usd);
		expect(formatPercent(0.125, 2)).toBe(percent);
		expect(formatUSD(12500, { decimals: 1 })).toBe(compactUsd);
	});

	it.each([
		["en-US", "1,5", "1,5"],
		["de-DE", "1,5", "1.5"],
		["fr-FR", "12,", "12."],
		["de-DE", "1.5", "1.5"],
	] as const)("normalizes typed decimal input under the %s preset", (locale, typed, expected) => {
		formatSettings.numberFormatLocale = locale;
		expect(normalizeDecimalInput(typed)).toBe(expected);
	});

	it("formats dates from the active interface language independently of number separators", () => {
		const value = new Date("2026-08-12T14:35:00Z");
		const options = { timeZone: "UTC" } as const;

		formatSettings.numberFormatLocale = "fr-FR";
		expect(formatDateTimeShort(value, options)).toBe("08/12, 14:35");
		expect(formatDateTime(value, { ...options, dateStyle: "short", timeStyle: "short" })).toBe("8/12/26, 2:35 PM");
		expect(formatTime(value, options)).toBe("2:35 PM");

		i18n.loadAndActivate({ locale: "fr", messages: {} });
		expect(formatDateTimeShort(value, options)).toBe("12/08 14:35");
		expect(formatDateTime(value, { ...options, dateStyle: "short", timeStyle: "short" })).toBe("12/08/2026 14:35");
		expect(formatTime(value, options)).toBe("14:35");

		formatSettings.numberFormatLocale = "de-DE";
		expect(formatDateTimeShort(value, options)).toBe("12/08 14:35");
		expect(formatDateTimeShort(value, { ...options, locale: "en-US" })).toBe("08/12, 14:35");
	});

	it("keeps Latin digits in dates for every interface language", () => {
		const value = new Date("2026-08-12T14:35:09Z");
		const options = { timeZone: "UTC" } as const;

		i18n.loadAndActivate({ locale: "ar", messages: {} });
		expect(formatTime(value, { ...options, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })).toMatch(/^14:35$/);
		expect(formatDateTime(value, { ...options, dateStyle: "medium", timeStyle: "short" })).toMatch(/2026/);
		expect(formatDateTime(value, { ...options, dateStyle: "medium", timeStyle: "short" })).not.toMatch(/[٠-٩]/);
		expect(formatDateTimeShort(value, options)).toContain("14:35");
		expect(formatDateTimeShort(value, options)).not.toMatch(/[٠-٩]/);

		i18n.loadAndActivate({ locale: "en", messages: {} });
	});

	it("respects an explicit date-only or time-only style instead of appending the defaults", () => {
		const value = new Date("2026-08-12T14:35:00Z");
		const options = { timeZone: "UTC" } as const;

		expect(formatDateTime(value, { ...options, dateStyle: "medium" })).toBe("Aug 12, 2026");
		expect(formatDateTime(value, { ...options, timeStyle: "short" })).toBe("2:35 PM");
		expect(formatDateTime(value, options)).toBe("Aug 12, 2026, 2:35 PM");
	});

	it("maps an interface language code passed as locale to its Intl locale", () => {
		const value = new Date("2026-08-12T14:35:00Z");
		const options = { timeZone: "UTC" } as const;

		expect(formatDateTime(value, { ...options, locale: "zh", dateStyle: "short", timeStyle: "short" })).toBe(
			formatDateTime(value, { ...options, locale: "zh-CN", dateStyle: "short", timeStyle: "short" }),
		);
		expect(formatTime(value, { ...options, locale: "fr" })).toBe("14:35");
	});

	it("resolves sub-basis-point slippage instead of collapsing it to zero", () => {
		expect(formatSlippageBps(37)).toBe("0.37%");
		expect(formatSlippageBps(1.5)).toBe("0.015%");
		expect(formatSlippageBps(0.7556)).toBe("0.0076%");
		expect(formatSlippageBps(0.0793)).toBe("0.0008%");
	});

	it("keeps slippage distinguishable from the tenth-of-a-bp builder fee conversion", () => {
		expect(formatSlippageBps(100)).toBe("1.00%");
		expect(bpsToPercentage(100)).toBe("0.10");
	});

	it("labels a floor value and a depth-exhausted lower bound", () => {
		expect(formatSlippageBps(0.0001)).toBe("<0.0001%");
		expect(formatSlippageBps(0)).toBe("0.0000%");
		expect(formatSlippageBps(120, { lowerBound: true })).toBe(">1.20%");
	});

	it("reports no slippage text without a usable number", () => {
		expect(formatSlippageBps(null)).toBeNull();
		expect(formatSlippageBps(undefined)).toBeNull();
		expect(formatSlippageBps(Number.NaN)).toBeNull();
		expect(formatSlippageBps(-1)).toBeNull();
	});
});
