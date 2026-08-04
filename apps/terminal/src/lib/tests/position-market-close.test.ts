import Big from "big.js";
import { describe, expect, it, vi } from "vitest";
import {
	formatPositionMarketClosePercent,
	resolvePositionMarketClosePercent,
	resolvePositionMarketCloseSize,
} from "@/domain/trade/position-market-close";
import { getPositionMarketCloseErrorMessage } from "@/lib/trade/position-market-close-errors";

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

describe("position market close sizing", () => {
	it.each([
		"Close percentage must be a decimal number",
		"Close percentage must be between 0 and 100",
		"Close size exceeds current position",
		"Close size is below market precision",
		"Close size must be a decimal number",
		"Close size must be greater than zero",
		"Position size is below market precision",
		"Position size must be a non-zero number",
		"Size precision must be a non-negative integer",
	])("maps the sizing error through the localized UI boundary: %s", (error) => {
		expect(getPositionMarketCloseErrorMessage(error)).toBe(error);
	});

	it("uses the exact absolute position size for 100 percent without number conversion", () => {
		const resolution = resolvePositionMarketClosePercent({
			signedPositionSize: "-12345678901234567890.123456",
			percent: "100.000",
			szDecimals: 6,
		});

		expect(resolution).toEqual({
			normalizedSize: "12345678901234567890.123456",
			maxSize: "12345678901234567890.123456",
			effectivePercent: "100",
			remainingSize: "0",
			side: "buy",
			errors: [],
		});
	});

	it.each([
		["99.5", "0.995", "0.005", "99.5"],
		["99.6", "1", "0", "100"],
		["99.9", "1", "0", "100"],
		["100", "1", "0", "100"],
	])(
		"snaps only percentages strictly above 99.5 to the full position: %s percent",
		(percent, normalizedSize, remainingSize, effectivePercent) => {
			const resolution = resolvePositionMarketClosePercent({ signedPositionSize: "1", percent, szDecimals: 3 });

			expect(resolution.normalizedSize).toBe(normalizedSize);
			expect(resolution.remainingSize).toBe(remainingSize);
			expect(resolution.effectivePercent).toBe(effectivePercent);
			expect(resolution.errors).toEqual([]);
		},
	);

	it("floors a decimal percentage to the market size precision", () => {
		const resolution = resolvePositionMarketClosePercent({
			signedPositionSize: "3.333",
			percent: "33.333",
			szDecimals: 3,
		});

		expect(resolution.normalizedSize).toBe("1.11");
		expect(resolution.remainingSize).toBe("2.223");
		expect(resolution.effectivePercent).toBe(Big("1.11").div("3.333").times(100).toString());
		expect(resolution.side).toBe("sell");
		expect(resolution.errors).toEqual([]);
	});

	it("reports the effective percent after size precision floors a partial close", () => {
		const resolution = resolvePositionMarketClosePercent({
			signedPositionSize: "0.015",
			percent: "50",
			szDecimals: 3,
		});

		expect(resolution.normalizedSize).toBe("0.007");
		expect(resolution.remainingSize).toBe("0.008");
		expect(resolution.effectivePercent).toBe(Big("0.007").div("0.015").times(100).toString());
		expect(formatPositionMarketClosePercent(resolution.effectivePercent)).toBe("46.6");
	});

	it("normalizes manual size and reports its effective percentage and remainder", () => {
		const resolution = resolvePositionMarketCloseSize({
			signedPositionSize: "1.234",
			closeSize: "0.3339",
			szDecimals: 3,
		});

		expect(resolution.normalizedSize).toBe("0.333");
		expect(resolution.remainingSize).toBe("0.901");
		expect(resolution.effectivePercent).toBe(Big("0.333").div("1.234").times(100).toString());
		expect(resolution.side).toBe("sell");
		expect(resolution.errors).toEqual([]);
	});

	it.each([
		["0", "Position size must be a non-zero number"],
		["not-a-number", "Position size must be a non-zero number"],
		["1e-3", "Position size must be a non-zero number"],
		[" 1", "Position size must be a non-zero number"],
	])("rejects an invalid signed position size %s", (signedPositionSize, error) => {
		const resolution = resolvePositionMarketCloseSize({ signedPositionSize, closeSize: "1", szDecimals: 3 });

		expect(resolution.normalizedSize).toBe("0");
		expect(resolution.errors).toContain(error);
	});

	it("rejects a manual size above the live position", () => {
		const resolution = resolvePositionMarketCloseSize({
			signedPositionSize: "1.25",
			closeSize: "1.2501",
			szDecimals: 4,
		});

		expect(resolution.normalizedSize).toBe("0");
		expect(resolution.errors).toContain("Close size exceeds current position");
	});

	it("rejects a positive size that formats to zero", () => {
		const resolution = resolvePositionMarketCloseSize({
			signedPositionSize: "1",
			closeSize: "0.0009",
			szDecimals: 3,
		});

		expect(resolution.normalizedSize).toBe("0");
		expect(resolution.errors).toContain("Close size is below market precision");
	});

	it.each(["100.001"])("rejects an out-of-range percentage %s", (percent) => {
		const resolution = resolvePositionMarketClosePercent({ signedPositionSize: "1", percent, szDecimals: 3 });

		expect(resolution.normalizedSize).toBe("0");
		expect(resolution.errors).toContain("Close percentage must be between 0 and 100");
	});

	it.each(["-0.001", "1e-3", " 50", "invalid"])("rejects invalid percentage syntax %s", (percent) => {
		const resolution = resolvePositionMarketClosePercent({ signedPositionSize: "1", percent, szDecimals: 3 });

		expect(resolution.normalizedSize).toBe("0");
		expect(resolution.errors).toContain("Close percentage must be a decimal number");
	});

	it.each(["-0.5", "1e-3", " 0.5", "invalid"])("rejects invalid close-size syntax %s", (closeSize) => {
		const resolution = resolvePositionMarketCloseSize({ signedPositionSize: "1", closeSize, szDecimals: 3 });

		expect(resolution.normalizedSize).toBe("0");
		expect(resolution.errors).toContain("Close size must be a decimal number");
	});

	it("accepts ordinary decimal input forms used while editing", () => {
		const percent = resolvePositionMarketClosePercent({ signedPositionSize: "1", percent: ".5", szDecimals: 3 });
		const size = resolvePositionMarketCloseSize({ signedPositionSize: "1", closeSize: "0.5", szDecimals: 3 });

		expect(percent.normalizedSize).toBe("0.005");
		expect(percent.errors).toEqual([]);
		expect(size.normalizedSize).toBe("0.5");
		expect(size.errors).toEqual([]);
	});

	it("treats zero percent as a valid input that cannot produce an orderable close size", () => {
		const resolution = resolvePositionMarketClosePercent({ signedPositionSize: "1", percent: "0", szDecimals: 3 });

		expect(resolution.normalizedSize).toBe("0");
		expect(resolution.effectivePercent).toBe("0");
		expect(resolution.errors).toContain("Close size must be greater than zero");
	});

	it("rejects a positive percentage that floors below one size unit", () => {
		const resolution = resolvePositionMarketClosePercent({
			signedPositionSize: "0.001",
			percent: "99.5",
			szDecimals: 3,
		});

		expect(resolution.normalizedSize).toBe("0");
		expect(resolution.errors).toContain("Close size is below market precision");
	});
});
