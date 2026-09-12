import { describe, expect, it } from "vitest";
import {
	buildTwapOrderDetails,
	formatTwapPriceInput,
	getTwapTriggerDirection,
	resolveTwapPriceInputs,
} from "@/domain/trade/twap-details";

describe("buildTwapOrderDetails", () => {
	it("omits details entirely when neither trigger nor stop price is set", () => {
		expect(buildTwapOrderDetails({ triggerPx: null, stopPx: null, markPx: "100" })).toBeUndefined();
	});

	it("activates above when the trigger sits above the current mark", () => {
		expect(buildTwapOrderDetails({ triggerPx: "105.5", stopPx: null, markPx: "100" })).toEqual({
			t: { p: "105.5", a: true },
			s: null,
		});
	});

	it("activates below when the trigger sits below the current mark", () => {
		expect(buildTwapOrderDetails({ triggerPx: "95", stopPx: null, markPx: 100 })).toEqual({
			t: { p: "95", a: false },
			s: null,
		});
	});

	it("keeps a stop-only request with a null trigger", () => {
		expect(buildTwapOrderDetails({ triggerPx: null, stopPx: "110", markPx: "100" })).toEqual({
			t: null,
			s: "110",
		});
	});

	it("passes trigger and stop prices through as the exact strings it was given", () => {
		expect(buildTwapOrderDetails({ triggerPx: "0.012345", stopPx: "0.0125", markPx: "0.0121" })).toEqual({
			t: { p: "0.012345", a: true },
			s: "0.0125",
		});
	});

	it("refuses a trigger that equals the mark instead of guessing an activation direction", () => {
		expect(() => buildTwapOrderDetails({ triggerPx: "100", stopPx: null, markPx: "100" })).toThrow(
			"Trigger price is not valid against the live mark price",
		);
	});

	it("refuses a trigger without a live mark price", () => {
		expect(() => buildTwapOrderDetails({ triggerPx: "105", stopPx: null, markPx: 0 })).toThrow(
			"Trigger price is not valid against the live mark price",
		);
		expect(() => buildTwapOrderDetails({ triggerPx: "105", stopPx: null, markPx: null })).toThrow(
			"Trigger price is not valid against the live mark price",
		);
	});

	it("keeps the payload direction identical to the direction derived from the tick-rounded trigger", () => {
		const format = { assetId: 0, szDecimals: 5 };
		const roundedOntoMark = formatTwapPriceInput("117312.4", format);
		expect(roundedOntoMark).toBe("117312");
		expect(getTwapTriggerDirection(roundedOntoMark, "117312")).toBeNull();
		expect(() => buildTwapOrderDetails({ triggerPx: roundedOntoMark, stopPx: null, markPx: "117312" })).toThrow();

		const roundedAbove = formatTwapPriceInput("117312.6", format);
		expect(roundedAbove).toBe("117313");
		expect(getTwapTriggerDirection(roundedAbove, "117312")).toBe("above");
		expect(buildTwapOrderDetails({ triggerPx: roundedAbove, stopPx: null, markPx: "117312" })).toEqual({
			t: { p: "117313", a: true },
			s: null,
		});
	});
});

describe("formatTwapPriceInput", () => {
	it("returns null for empty or unparsable input", () => {
		expect(formatTwapPriceInput("", { assetId: 0, szDecimals: 3 })).toBeNull();
		expect(formatTwapPriceInput("   ", { assetId: 0, szDecimals: 3 })).toBeNull();
		expect(formatTwapPriceInput("abc", { assetId: 0, szDecimals: 3 })).toBeNull();
	});

	it("collapses non-positive input to zero so validation can flag it", () => {
		expect(formatTwapPriceInput("0", { assetId: 0, szDecimals: 3 })).toBe("0");
		expect(formatTwapPriceInput("-1", { assetId: 0, szDecimals: 3 })).toBe("0");
	});

	it("rounds to the market tick using perp and spot decimal rules", () => {
		expect(formatTwapPriceInput("117312.4", { assetId: 0, szDecimals: 5 })).toBe("117312");
		expect(formatTwapPriceInput("1.234567", { assetId: 0, szDecimals: 2 })).toBe("1.2346");
		expect(formatTwapPriceInput("0.0123456789", { assetId: 10_000, szDecimals: 0 })).toBe("0.012346");
		expect(formatTwapPriceInput("105.5", { assetId: undefined, szDecimals: 0 })).toBe("105.5");
	});
});

describe("getTwapTriggerDirection", () => {
	it("returns above or below relative to the mark", () => {
		expect(getTwapTriggerDirection("101", "100")).toBe("above");
		expect(getTwapTriggerDirection("99.99", 100)).toBe("below");
	});

	it("returns null without a positive trigger, a live mark, or a real gap between them", () => {
		expect(getTwapTriggerDirection("100", "100")).toBeNull();
		expect(getTwapTriggerDirection("", "100")).toBeNull();
		expect(getTwapTriggerDirection("0", "100")).toBeNull();
		expect(getTwapTriggerDirection("abc", "100")).toBeNull();
		expect(getTwapTriggerDirection("101", 0)).toBeNull();
		expect(getTwapTriggerDirection("101", null)).toBeNull();
	});
});

describe("resolveTwapPriceInputs", () => {
	it("excludes both configured and invalid draft prices while advanced settings are off", () => {
		const format = { assetId: 0, szDecimals: 5 };
		for (const [trigger, stop] of [
			["105", "110"],
			["100", "0"],
			["abc", "-5"],
		]) {
			expect(resolveTwapPriceInputs(false, trigger, stop, format)).toEqual({ triggerPx: null, stopPx: null });
		}
	});
	it("applies existing precision and empty-field rules when enabled", () => {
		const format = { assetId: 0, szDecimals: 5 };
		expect(resolveTwapPriceInputs(true, "117312.6", "118000.1", format)).toEqual({
			triggerPx: "117313",
			stopPx: "118000",
		});
		expect(resolveTwapPriceInputs(true, "", "118000.1", format)).toEqual({ triggerPx: null, stopPx: "118000" });
		expect(resolveTwapPriceInputs(true, "0", "", format)).toEqual({ triggerPx: "0", stopPx: null });
	});
});
