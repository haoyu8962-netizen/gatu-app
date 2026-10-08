import { describe, expect, it } from "vitest";
import { deriveOrderEntry } from "@/domain/trade/order/derive";
import { getOrderMetrics } from "@/domain/trade/order/metrics";
import { type EntryPositionSnapshot, getReduceOnlyCapacity } from "@/domain/trade/order/reduce-only";
import { getReduceOnlySizeSelection, getSelectedSizeDisplay, getSizeStringFromInput } from "@/domain/trade/order/size";
import { getOrderActionStage } from "@/domain/trade/order-action-stage";

const snapshot: EntryPositionSnapshot = { ready: true, receivedAt: 1000, signedSize: "7.159" };
describe("Reduce Only capacity", () => {
	it.each([
		["7.159", "sell", "ready", "7.15"],
		["-7.159", "buy", "ready", "7.15"],
		["7.15", "buy", "wrong-direction", "0"],
		["-7.15", "sell", "wrong-direction", "0"],
		["0", "buy", "no-position", "0"],
		["0", "sell", "no-position", "0"],
	] as const)("%s with %s yields %s", (signedSize, side, status, maxBase) => {
		expect(getReduceOnlyCapacity(true, side, { ...snapshot, signedSize }, 2, 1001)).toEqual({ status, maxBase });
	});
	it.each([
		undefined,
		{ ...snapshot, ready: false },
		{ ...snapshot, receivedAt: undefined },
		{ ...snapshot, receivedAt: -60000 },
		{ ...snapshot, receivedAt: 1002 },
		...[undefined, "NaN", "Infinity", "garbage", "1e3", ""].map((signedSize) => ({ ...snapshot, signedSize })),
	])("does not interpret unavailable data as an empty position: %j", (position) => {
		expect(getReduceOnlyCapacity(true, "sell", position, 2, 1001).status).toBe("unavailable");
	});
	it("keeps decimal capacity exact beyond Number precision", () => {
		expect(
			getReduceOnlyCapacity(true, "sell", { ...snapshot, signedSize: "1234567890.12345678" }, 8, 1001).maxBase,
		).toBe("1234567890.12345678");
	});
	it.each(["perp", "builderPerp"] as const)("uses position capacity with zero opening balance for %s", (kind) => {
		const derived = deriveOrderEntry({
			isConnected: true,
			market: { kind, name: "HYPE", pairName: "HYPE-USDC", szDecimals: 2 } as never,
			side: "sell",
			conversionPrice: 95.997,
			sizeMode: "base",
			sizeInput: "7.16",
			spotBalances: [],
			maxTradeSzs: [0, 0],
			availableToTrade: [0, 0],
			marketOrderSizing: null,
			reduceOnly: true,
			positionSnapshot: { ...snapshot, receivedAt: Date.now() },
		});
		expect(derived.maxSize).toBe(7.15);
		expect(derived.availableBalance).toBe(0);
		expect(derived.sizeForOrder).toBe("7.16"); // preserve oversize intent
	});
	it.each([0, 50, 100])("selects %s%% in base first and preserves it through quote rounding", (pct) => {
		const selected = getReduceOnlySizeSelection("7.15", pct, "quote", 95.997, 2);
		const baseSize = pct === 0 ? "0" : pct === 50 ? "3.57" : "7.15";
		expect(selected?.baseSize).toBe(baseSize);
		expect(getSelectedSizeDisplay(baseSize, "base", 95.997)).toBe(baseSize);
		if (pct === 100)
			expect(
				getSizeStringFromInput({ sizeInput: selected?.size ?? "", sizeMode: "quote", price: 95.997, szDecimals: 2 }),
			).toBe("7.14");
	});
	it("marks margin as inapplicable without changing ordinary margin", () => {
		expect(getOrderMetrics({ sizeValue: 2, price: 100, leverage: 10, reduceOnly: true }).marginRequired).toBeNull();
		expect(getOrderMetrics({ sizeValue: 2, price: 100, leverage: 10 }).marginRequired).toBe(20);
	});
	it("keeps zero-balance reduce-only in the trade flow and retains other gates", () => {
		const input = {
			isConnected: true,
			needsApproval: false,
			isSignerReady: true,
			hasBalanceError: false,
			isBalanceLoading: false,
			availableBalance: 0,
			reduceOnly: true,
		};
		expect(getOrderActionStage(input)).toBe("submit");
		expect(getOrderActionStage({ ...input, reduceOnly: false })).toBe("deposit");
		expect(getOrderActionStage({ ...input, isBalanceLoading: true })).toBe("balanceLoading");
		expect(getOrderActionStage({ ...input, hasBalanceError: true })).toBe("balanceError");
		expect(getOrderActionStage({ ...input, needsApproval: true })).toBe("builder");
	});
});
