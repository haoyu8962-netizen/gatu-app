import type { InfoClient, UserFillsResponse } from "@nktkas/hyperliquid";
import { describe, expect, it, vi } from "vitest";
import { fetchTradeHistorySnapshot } from "@/hooks/trade/use-trade-history";
import {
	filterTradeHistory,
	getTradeHistoryMarkets,
	getTradeHistoryType,
	isTradeHistoryDirectionFilter,
	isTradeHistoryRoleFilter,
	isTradeHistoryTypeFilter,
	TRADE_HISTORY_SNAPSHOT_LIMIT,
} from "@/lib/trade/trade-history";

const ADDRESS = "0x1111111111111111111111111111111111111111" as const;

type UserFill = UserFillsResponse[number];

function createFill(index: number, overrides: Partial<UserFill> = {}): UserFill {
	return {
		closedPnl: "0",
		coin: "BTC",
		crossed: false,
		dir: "Open Long",
		fee: "0.01",
		feeToken: "USDC",
		hash: `0x${index.toString(16).padStart(64, "0")}`,
		oid: index,
		px: "100",
		side: "B",
		startPosition: "0",
		sz: "1",
		tid: index,
		time: 1_800_000_000_000 + index,
		twapId: null,
		...overrides,
	};
}

describe("trade history", () => {
	it("filters by market, direction, role, and type", () => {
		const btcMaker = createFill(1);
		const spotTaker = createFill(2, { coin: "PURR/USDC", crossed: true, dir: "Sell", side: "A" });
		const btcLiquidation = createFill(3, { crossed: true, liquidation: { markPx: "90", method: "market" } });
		const fills = [btcMaker, spotTaker, btcLiquidation];
		const getMarketKind = (coin: string) => (coin === "PURR/USDC" ? ("spot" as const) : ("perp" as const));

		expect(getTradeHistoryMarkets(fills)).toEqual(["BTC", "PURR/USDC"]);
		expect(getTradeHistoryType(btcMaker, getMarketKind)).toBe("perp");
		expect(getTradeHistoryType(spotTaker, getMarketKind)).toBe("spot");
		expect(filterTradeHistory(fills, "BTC", "all", "all", "all", getMarketKind)).toEqual([btcMaker, btcLiquidation]);
		expect(filterTradeHistory(fills, null, "sell", "taker", "spot", getMarketKind)).toEqual([spotTaker]);
		expect(filterTradeHistory(fills, null, "buy", "taker", "perp", getMarketKind)).toEqual([btcLiquidation]);
	});

	it("classifies delisted markets from their canonical fill coin names", () => {
		const delistedPerp = createFill(1, { coin: "OLD" });
		const delistedBuilderPerp = createFill(2, { coin: "xyz:OLD" });
		const delistedIndexedSpot = createFill(3, { coin: "@42" });
		const delistedNamedSpot = createFill(4, { coin: "OLD/USDC" });
		const fills = [delistedPerp, delistedBuilderPerp, delistedIndexedSpot, delistedNamedSpot];
		const missingFromCurrentCatalog = vi.fn(() => undefined);

		expect(getTradeHistoryType(delistedPerp, missingFromCurrentCatalog)).toBe("perp");
		expect(getTradeHistoryType(delistedBuilderPerp, missingFromCurrentCatalog)).toBe("perp");
		expect(getTradeHistoryType(delistedIndexedSpot, missingFromCurrentCatalog)).toBe("spot");
		expect(getTradeHistoryType(delistedNamedSpot, missingFromCurrentCatalog)).toBe("spot");
		expect(filterTradeHistory(fills, null, "all", "all", "perp", missingFromCurrentCatalog)).toEqual([
			delistedPerp,
			delistedBuilderPerp,
		]);
		expect(filterTradeHistory(fills, null, "all", "all", "spot", missingFromCurrentCatalog)).toEqual([
			delistedIndexedSpot,
			delistedNamedSpot,
		]);
	});

	it("accepts only supported filter values", () => {
		expect(["all", "buy", "sell"].every(isTradeHistoryDirectionFilter)).toBe(true);
		expect(["all", "maker", "taker"].every(isTradeHistoryRoleFilter)).toBe(true);
		expect(["all", "perp", "spot"].every(isTradeHistoryTypeFilter)).toBe(true);
		expect(isTradeHistoryDirectionFilter("long")).toBe(false);
		expect(isTradeHistoryRoleFilter("crossed")).toBe(false);
		expect(isTradeHistoryTypeFilter(null)).toBe(false);
	});

	it("loads one documented userFills snapshot, removes TWAP fills, deduplicates, and sorts newest first", async () => {
		const older = createFill(1);
		const newer = createFill(2);
		const twap = createFill(3, { twapId: 9 });
		const userFills = vi.fn().mockResolvedValue([older, newer, twap, older]);
		const info = { userFills } as unknown as InfoClient;
		const signal = new AbortController().signal;

		const result = await fetchTradeHistorySnapshot(info, ADDRESS, signal);

		expect(userFills).toHaveBeenCalledOnce();
		expect(userFills).toHaveBeenCalledWith({ aggregateByTime: true, user: ADDRESS }, signal);
		expect(result.fills).toEqual([newer, older]);
		expect(result.reachedLimit).toBe(false);
	});

	it("marks a snapshot that reaches the public 2000-fill boundary", async () => {
		const response = Array.from({ length: TRADE_HISTORY_SNAPSHOT_LIMIT }, (_, index) => createFill(index + 1));
		const info = { userFills: vi.fn().mockResolvedValue(response) } as unknown as InfoClient;

		const result = await fetchTradeHistorySnapshot(info, ADDRESS, new AbortController().signal);

		expect(result.fills).toHaveLength(TRADE_HISTORY_SNAPSHOT_LIMIT);
		expect(result.reachedLimit).toBe(true);
	});

	it("fails closed when the endpoint exceeds its documented 2000-fill boundary", async () => {
		const response = Array.from({ length: TRADE_HISTORY_SNAPSHOT_LIMIT + 1 }, (_, index) => createFill(index + 1));
		const info = { userFills: vi.fn().mockResolvedValue(response) } as unknown as InfoClient;

		await expect(fetchTradeHistorySnapshot(info, ADDRESS, new AbortController().signal)).rejects.toMatchObject({
			name: "MalformedHistoryPageError",
		});
	});

	it("fails closed when the snapshot contains an invalid fill", async () => {
		const info = {
			userFills: vi.fn().mockResolvedValue([{ ...createFill(1), tid: -1 }]),
		} as unknown as InfoClient;

		await expect(fetchTradeHistorySnapshot(info, ADDRESS, new AbortController().signal)).rejects.toMatchObject({
			name: "MalformedHistoryPageError",
		});
	});
});
