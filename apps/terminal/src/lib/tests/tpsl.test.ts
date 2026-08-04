import { describe, expect, it } from "vitest";
import {
	calculateEstimatedPnl,
	calculateEstimatedPnlExact,
	calculateRiskRewardRatioExact,
	calculateSlPrice,
	calculateSlPriceFromRoe,
	calculateTpPrice,
	calculateTpPriceFromRoe,
} from "@/lib/trade/tpsl";

describe("position TP/SL ROE pricing", () => {
	it("converts long-position ROE targets into leveraged price moves", () => {
		const tpPrice = calculateTpPriceFromRoe(28_600.68, "buy", 25, 20, 2);
		const slPrice = calculateSlPriceFromRoe(28_600.68, "buy", 5, 20, 2);

		expect(tpPrice).toBe("28958.19");
		expect(slPrice).toBe("28529.18");
		expect(calculateEstimatedPnl({ referencePrice: 28_600.68, side: "buy", size: 0.301 }, tpPrice)).toBeCloseTo(
			107.61,
			2,
		);
	});

	it("reverses the target direction for short positions", () => {
		expect(calculateTpPriceFromRoe(100, "sell", 25, 5, 2)).toBe("95.00");
		expect(calculateSlPriceFromRoe(100, "sell", 10, 5, 2)).toBe("102.00");
	});

	it("rejects invalid leverage and non-positive target prices", () => {
		expect(calculateTpPriceFromRoe(100, "buy", 25, 0, 2)).toBeNull();
		expect(calculateSlPriceFromRoe(100, "buy", 200, 1, 2)).toBeNull();
	});

	it("preserves price-percentage helpers used by pre-entry TP/SL", () => {
		expect(calculateTpPrice(100, "buy", 25, 2)).toBe("125.00");
		expect(calculateSlPrice(100, "buy", 5, 2)).toBe("95.00");
	});

	it("keeps position PnL and risk/reward calculations exact as strings", () => {
		const pnl = calculateEstimatedPnlExact(
			{ referencePrice: "9007199254740993", side: "buy", size: "0.123456789012345678" },
			"9007199254740994",
		);

		expect(pnl).toBe("0.123456789012345678");
		expect(calculateRiskRewardRatioExact(pnl, "-0.041152263004115226")).toBe("3");
	});
});
