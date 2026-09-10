import { describe, expect, it } from "vitest";
import { getPositionTpSlSizeForPercent, getPositionTpSlSizePercent } from "@/domain/trade/position-tpsl-size";

describe("configured TP/SL percentage sizing", () => {
	it("floors the percentage amount without converting the position string through a number", () => {
		expect(getPositionTpSlSizeForPercent("123456789.99999999", 10, 6)).toBe("12345678.999999");
		expect(getPositionTpSlSizeForPercent("0.301", 63, 3)).toBe("0.189");
	});

	it("keeps 100 percent as an explicit fixed quantity", () => {
		expect(getPositionTpSlSizeForPercent("0.301", 100, 3)).toBe("0.301");
		expect(getPositionTpSlSizeForPercent("0.301000000000000001", 100, 3)).toBe("0.301");
	});

	it("retains zero below the first executable lot", () => {
		expect(getPositionTpSlSizeForPercent("0.012", 0, 3)).toBe("0.000");
		expect(getPositionTpSlSizeForPercent("0.012", 8, 3)).toBe("0.000");
		expect(getPositionTpSlSizeForPercent("0.012", 9, 3)).toBe("0.001");
	});

	it("clamps requests and keeps missing sizes non-executable", () => {
		expect(getPositionTpSlSizeForPercent("0.301", 120, 3)).toBe("0.301");
		expect(getPositionTpSlSizeForPercent("0.301", -10, 3)).toBe("0.000");
		expect(getPositionTpSlSizeForPercent(null, 100, 3)).toBe("0");
		expect(getPositionTpSlSizeForPercent("0.301", Number.NaN, 3)).toBe("0");
	});

	it("derives the effective percentage from the fixed quantity", () => {
		expect(getPositionTpSlSizePercent("0.189", "0.301")).toBeCloseTo(62.7906976744186);
		expect(getPositionTpSlSizePercent("0.5", "0.301")).toBe(100);
		expect(getPositionTpSlSizePercent("0", "0.301")).toBe(0);
		expect(getPositionTpSlSizePercent("0.301", null)).toBe(0);
	});
});
