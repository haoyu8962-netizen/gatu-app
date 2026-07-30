import { describe, expect, it, vi } from "vitest";
import {
	formatNumber,
	formatPercent,
	formatPrice,
	formatQuoteAmount,
	formatToken,
	formatUSD,
	shortenAddress,
	szDecimalsToPriceDecimals,
} from "@/lib/format";

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

describe("format", () => {
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
});
