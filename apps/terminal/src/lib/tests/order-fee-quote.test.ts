import { describe, expect, it } from "vitest";
import {
	buildOrderFeeQuote,
	formatOrderFeeRatePercent,
	resolveEstimatedProtocolRate,
} from "@/domain/trade/order-fee-quote";

const BASE_INPUT = {
	orderValue: "10000",
	protocolRate: "0.00045",
	builderFeeTenthsBps: 10,
	marketKind: "perp",
	side: "buy",
	execution: "order",
} as const;

describe("order fee quote", () => {
	it("adds the configured builder fee to both sides of ordinary perp orders", () => {
		const buy = buildOrderFeeQuote(BASE_INPUT);
		const sell = buildOrderFeeQuote({ ...BASE_INPUT, side: "sell" });

		for (const quote of [buy, sell]) {
			expect(quote).toEqual({
				orderValue: "10000",
				protocolRate: "0.00045",
				builderRate: "0.0001",
				totalRate: "0.00055",
				protocolAmount: "4.5",
				builderAmount: "1",
				totalAmount: "5.5",
				builderApplies: true,
			});
		}
	});

	it("does not charge a builder fee on spot buys but does on spot sells", () => {
		const buy = buildOrderFeeQuote({ ...BASE_INPUT, marketKind: "spot" });
		const sell = buildOrderFeeQuote({ ...BASE_INPUT, marketKind: "spot", side: "sell" });

		expect(buy).toMatchObject({ builderApplies: false, builderRate: "0", totalRate: "0.00045" });
		expect(sell).toMatchObject({ builderApplies: true, builderRate: "0.0001", totalRate: "0.00055" });
	});

	it("keeps TWAP builder-free because its exchange action has no builder field", () => {
		const quote = buildOrderFeeQuote({ ...BASE_INPUT, execution: "twap" });

		expect(quote).toMatchObject({
			builderApplies: false,
			builderRate: "0",
			builderAmount: "0",
			totalRate: "0.00045",
			totalAmount: "4.5",
		});
	});

	it("uses decimal arithmetic for rates and amounts without binary float drift", () => {
		const quote = buildOrderFeeQuote({ ...BASE_INPUT, orderValue: "10000.01", protocolRate: "0.0007" });

		expect(quote.protocolAmount).toBe("7.000007");
		expect(quote.builderAmount).toBe("1.000001");
		expect(quote.totalAmount).toBe("8.000008");
		expect(formatOrderFeeRatePercent(quote.totalRate)).toBe("0.0800%");
	});

	it("fails closed to zero for invalid order values and builder fee settings", () => {
		const quote = buildOrderFeeQuote({
			...BASE_INPUT,
			orderValue: "not-a-number",
			builderFeeTenthsBps: -10,
		});

		expect(quote).toMatchObject({
			orderValue: "0",
			builderApplies: false,
			builderRate: "0",
			protocolAmount: "0",
			builderAmount: "0",
			totalAmount: "0",
		});
	});
});

describe("estimated protocol fee rate", () => {
	it("uses maker pricing only when the order is guaranteed post-only", () => {
		const rates = { takerRate: "0.00045", makerRate: "0.00015" } as const;
		expect(resolveEstimatedProtocolRate({ ...rates, orderType: "limit", tif: "Alo" })).toBe(rates.makerRate);
		expect(resolveEstimatedProtocolRate({ ...rates, orderType: "scale", tif: "Alo" })).toBe(rates.makerRate);
	});

	it("uses conservative taker pricing for marketable and uncertain executions", () => {
		const rates = { takerRate: "0.00045", makerRate: "0.00015" } as const;
		expect(resolveEstimatedProtocolRate({ ...rates, orderType: "limit", tif: "Gtc" })).toBe(rates.takerRate);
		expect(resolveEstimatedProtocolRate({ ...rates, orderType: "limit", tif: "Ioc" })).toBe(rates.takerRate);
		expect(resolveEstimatedProtocolRate({ ...rates, orderType: "market", tif: "Alo" })).toBe(rates.takerRate);
		expect(resolveEstimatedProtocolRate({ ...rates, orderType: "twap", tif: "Alo" })).toBe(rates.takerRate);
		expect(resolveEstimatedProtocolRate({ ...rates, orderType: "stopLimit", tif: "Alo" })).toBe(rates.takerRate);
		expect(resolveEstimatedProtocolRate({ ...rates, orderType: "takeProfitLimit", tif: "Alo" })).toBe(rates.takerRate);
	});
});
