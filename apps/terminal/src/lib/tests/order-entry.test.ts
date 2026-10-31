import { describe, expect, it } from "vitest";
import {
	getAssetAvailabilityStatus,
	getDirectionalAvailableToTrade,
	getOrderAvailabilityFlags,
	getOrderAvailabilityStatus,
	getStreamAvailabilityStatus,
} from "@/domain/trade/order/availability";
import { deriveOrderEntry } from "@/domain/trade/order/derive";
import type { SpotBalance } from "@/hooks/trade/use-account-balances";
import { getConversionPrice } from "@/hooks/trade/use-order-entry-data";

const usdcBalance: SpotBalance = {
	coin: "USDC",
	token: 0,
	total: "549.99",
	hold: "0",
	entryNtl: "0",
};

const perpMarket = {
	kind: "perp",
	name: "SOL",
	pairName: "SOL-USDC",
	szDecimals: 4,
} as never;

const builderPerpMarket = {
	kind: "builderPerp",
	name: "xyz:MU",
	pairName: "MU-USDC",
	szDecimals: 2,
	dex: "xyz",
} as never;

const googlMarket = {
	kind: "builderPerp",
	name: "xyz:GOOGL",
	pairName: "GOOGL-USDC",
	szDecimals: 3,
	dex: "xyz",
} as never;

describe("order entry balances", () => {
	it("blocks perp sizing while active asset availability is pending", () => {
		const derived = deriveOrderEntry({
			isConnected: true,
			market: perpMarket,
			side: "buy",
			conversionPrice: 100,
			sizeMode: "base",
			sizeInput: "",
			spotBalances: [usdcBalance],
			maxTradeSzs: null,
			availableToTrade: null,
			marketOrderSizing: null,
		});

		expect(derived.availableBalance).toBe(0);
		expect(derived.displayAvailableBalance).toBe(0);
		expect(derived.maxSize).toBe(0);
	});

	it("prefers the exchange availableToTrade over shared spot balance once it arrives", () => {
		const derived = deriveOrderEntry({
			isConnected: true,
			market: perpMarket,
			side: "buy",
			conversionPrice: 100,
			sizeMode: "base",
			sizeInput: "",
			spotBalances: [usdcBalance],
			maxTradeSzs: [0.05, 0.05],
			availableToTrade: [5.655465, 5.655465],
			marketOrderSizing: null,
		});

		expect(derived.availableBalance).toBeCloseTo(5.655465);
		expect(derived.displayAvailableBalance).toBeCloseTo(5.655465);
		expect(derived.maxSize).toBeCloseTo(0.05);
	});

	it("keeps standard perp order availability separate from spot balances", () => {
		const derived = deriveOrderEntry({
			isConnected: true,
			market: perpMarket,
			side: "buy",
			conversionPrice: 100,
			sizeMode: "base",
			sizeInput: "",
			spotBalances: [usdcBalance],
			maxTradeSzs: [0, 0],
			availableToTrade: [0, 0],
			marketOrderSizing: null,
		});

		expect(derived.availableBalance).toBe(0);
		expect(derived.displayAvailableBalance).toBe(0);
		expect(derived.maxSize).toBe(0);
	});

	it("blocks builder perp sizing while active asset availability is pending", () => {
		const derived = deriveOrderEntry({
			isConnected: true,
			market: builderPerpMarket,
			side: "buy",
			conversionPrice: 100,
			sizeMode: "base",
			sizeInput: "",
			spotBalances: [usdcBalance],
			maxTradeSzs: null,
			availableToTrade: null,
			marketOrderSizing: null,
		});

		expect(derived.availableBalance).toBe(0);
		expect(derived.displayAvailableBalance).toBe(0);
		expect(derived.maxSize).toBe(0);
	});

	it("reports zero when the exchange says a unified builder perp cannot open more", () => {
		const derived = deriveOrderEntry({
			isConnected: true,
			market: builderPerpMarket,
			side: "buy",
			conversionPrice: 100,
			sizeMode: "base",
			sizeInput: "",
			spotBalances: [usdcBalance],
			maxTradeSzs: [0, 0],
			availableToTrade: [0, 0],
			marketOrderSizing: null,
		});

		expect(derived.availableBalance).toBe(0);
		expect(derived.displayAvailableBalance).toBe(0);
		expect(derived.maxSize).toBe(0);
	});

	it("uses directional exchange limits without deriving them from collateral", () => {
		const long = deriveOrderEntry({
			isConnected: true,
			market: builderPerpMarket,
			side: "buy",
			conversionPrice: 100,
			sizeMode: "base",
			sizeInput: "",
			spotBalances: [usdcBalance],
			maxTradeSzs: [0.75, 0.25],
			availableToTrade: [75, 25],
			marketOrderSizing: null,
		});
		const short = deriveOrderEntry({
			isConnected: true,
			market: builderPerpMarket,
			side: "sell",
			conversionPrice: 100,
			sizeMode: "base",
			sizeInput: "",
			spotBalances: [usdcBalance],
			maxTradeSzs: [0.75, 0.25],
			availableToTrade: [75, 25],
			marketOrderSizing: null,
		});

		expect(long).toMatchObject({ availableBalance: 75, maxSize: 0.75 });
		expect(short).toMatchObject({ availableBalance: 25, maxSize: 0.25 });
	});

	it("keeps standard builder perp order availability isolated from spot balances", () => {
		const derived = deriveOrderEntry({
			isConnected: true,
			market: builderPerpMarket,
			side: "buy",
			conversionPrice: 100,
			sizeMode: "base",
			sizeInput: "",
			spotBalances: [usdcBalance],
			maxTradeSzs: [0, 0],
			availableToTrade: [0, 0],
			marketOrderSizing: null,
		});

		expect(derived.availableBalance).toBe(0);
		expect(derived.displayAvailableBalance).toBe(0);
		expect(derived.maxSize).toBe(0);
	});

	it("keeps a manually entered GOOGL quantity in base units", () => {
		const derived = deriveOrderEntry({
			isConnected: true,
			market: googlMarket,
			side: "buy",
			conversionPrice: 341,
			sizeMode: "base",
			sizeInput: "5",
			spotBalances: [usdcBalance],
			maxTradeSzs: [20, 20],
			availableToTrade: [6820, 6820],
			marketOrderSizing: null,
		});

		expect(derived.sizeValue).toBe(5);
		expect(derived.orderValue).toBe(1705);
	});

	it("converts a GOOGL quote amount without applying leverage to size", () => {
		const derived = deriveOrderEntry({
			isConnected: true,
			market: googlMarket,
			side: "buy",
			conversionPrice: 341,
			sizeMode: "quote",
			sizeInput: "5",
			spotBalances: [usdcBalance],
			maxTradeSzs: [20, 20],
			availableToTrade: [6820, 6820],
			marketOrderSizing: null,
		});

		expect(derived.sizeValue).toBe(0.014);
		expect(derived.orderValue).toBeCloseTo(4.774);
	});
});

describe("active asset availability readiness", () => {
	const data = { coin: "xyz:MU", user: "0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD" };
	const baseInput = {
		isConnected: true,
		isPerpMarket: true,
		coin: "xyz:MU",
		user: "0xabcdefABCDEFabcdefABCDEFabcdefABCDEFabcd",
		data,
		subscriptionStatus: "active" as const,
		isStale: false,
	};

	it("requires the first matching payload after subscription acknowledgement", () => {
		expect(getAssetAvailabilityStatus({ ...baseInput, data: undefined })).toBe("loading");
		expect(getAssetAvailabilityStatus(baseInput)).toBe("success");
	});

	it("retains a matching stale payload without treating it as fresh", () => {
		expect(getAssetAvailabilityStatus({ ...baseInput, isStale: true })).toBe("stale");
	});

	it("rejects mismatched payloads", () => {
		expect(getAssetAvailabilityStatus({ ...baseInput, coin: "HYPE" })).toBe("loading");
		expect(getAssetAvailabilityStatus({ ...baseInput, user: "0x0000000000000000000000000000000000000000" })).toBe(
			"loading",
		);
	});

	it("surfaces subscription errors", () => {
		expect(getAssetAvailabilityStatus({ ...baseInput, subscriptionStatus: "error" })).toBe("error");
	});

	it.each([
		["disconnected", { isConnected: false }],
		["non-perp market", { isPerpMarket: false }],
		["missing coin", { coin: undefined }],
		["missing user", { user: undefined }],
	] as const)("is idle when %s", (_label, override) => {
		expect(getAssetAvailabilityStatus({ ...baseInput, ...override })).toBe("idle");
	});

	it("keeps coin identity matching case-sensitive", () => {
		expect(getAssetAvailabilityStatus({ ...baseInput, coin: "XYZ:MU" })).toBe("loading");
	});

	it("preserves the exact directional available-to-trade amount", () => {
		const availableToTrade = ["800.000000000000000001", "700.125"] as const;

		expect(getDirectionalAvailableToTrade(availableToTrade, "buy")).toBe("800.000000000000000001");
		expect(getDirectionalAvailableToTrade(availableToTrade, "sell")).toBe("700.125");
		expect(getDirectionalAvailableToTrade(["invalid", "-1"], "buy")).toBeNull();
		expect(getDirectionalAvailableToTrade(["invalid", "-1"], "sell")).toBeNull();
		expect(getDirectionalAvailableToTrade(undefined, "buy")).toBeNull();
	});
});

describe("stream availability readiness", () => {
	it("distinguishes loading, stale, success, and error", () => {
		const baseInput = {
			isConnected: true,
			hasData: true,
			subscriptionStatus: "active" as const,
			isStale: false,
		};

		expect(getStreamAvailabilityStatus(baseInput)).toBe("success");
		expect(getStreamAvailabilityStatus({ ...baseInput, isStale: true })).toBe("stale");
		expect(getStreamAvailabilityStatus({ ...baseInput, hasData: false })).toBe("loading");
		expect(getStreamAvailabilityStatus({ ...baseInput, subscriptionStatus: "subscribing" })).toBe("loading");
		expect(getStreamAvailabilityStatus({ ...baseInput, subscriptionStatus: "error" })).toBe("error");
		expect(getStreamAvailabilityStatus({ ...baseInput, isConnected: false })).toBe("idle");
	});
});

describe("order availability routing", () => {
	const baseInput = {
		isConnected: true,
		marketKind: "perp" as const,
		spotStatus: "success" as const,
		perpStatus: "success" as const,
	};

	it("treats an unresolved market as loading instead of zero availability", () => {
		expect(getOrderAvailabilityStatus({ ...baseInput, marketKind: undefined })).toBe("loading");
	});

	it("treats an idle selected-market subscription as loading while connected", () => {
		expect(getOrderAvailabilityStatus({ ...baseInput, perpStatus: "idle" })).toBe("loading");
	});

	it("routes spot and perp readiness independently", () => {
		expect(
			getOrderAvailabilityStatus({ ...baseInput, marketKind: "spot", spotStatus: "error", perpStatus: "success" }),
		).toBe("error");
		expect(
			getOrderAvailabilityStatus({ ...baseInput, marketKind: "builderPerp", spotStatus: "error", perpStatus: "stale" }),
		).toBe("stale");
	});

	it("does not block on market state while disconnected", () => {
		expect(getOrderAvailabilityStatus({ ...baseInput, isConnected: false, marketKind: undefined })).toBe("idle");
	});

	it("fails closed for stale or unavailable connected trading state", () => {
		expect(getOrderAvailabilityFlags(true, "success")).toEqual({
			isLoading: false,
			isStale: false,
			hasError: false,
			isBlocked: false,
		});
		expect(getOrderAvailabilityFlags(true, "loading")).toMatchObject({ isLoading: true, isBlocked: true });
		expect(getOrderAvailabilityFlags(true, "stale")).toMatchObject({ isStale: true, isBlocked: true });
		expect(getOrderAvailabilityFlags(true, "error")).toMatchObject({ hasError: true, isBlocked: true });
		expect(getOrderAvailabilityFlags(true, "idle")).toMatchObject({ isBlocked: true });
		expect(getOrderAvailabilityFlags(false, "idle")).toMatchObject({ isBlocked: false });
	});
});

describe("order entry conversion price", () => {
	it("uses the limit price for limit-priced orders so size and value match what will be sent", () => {
		expect(getConversionPrice(56, 50)).toBe(50);
	});

	it("falls back to mark when no valid limit price is present", () => {
		expect(getConversionPrice(56, undefined)).toBe(56);
		expect(getConversionPrice(56, 0)).toBe(56);
		expect(getConversionPrice(0, undefined)).toBe(0);
	});
});

describe("perp order entry maximum at the official terminal's margin price", () => {
	const passiveBuyMargin = (size: string) => Number(size) * 80;

	it("raises a passive buy's maximum by mark over limit and checks the size by the margin it reserves", () => {
		const input = {
			isConnected: true,
			market: perpMarket,
			side: "buy" as const,
			conversionPrice: 80,
			markPx: 100,
			marginNotionalForSize: passiveBuyMargin,
			sizeMode: "base" as const,
			spotBalances: [usdcBalance],
			maxTradeSzs: [10, 10] as [number, number],
			availableToTrade: [100, 100] as [number, number],
			marketOrderSizing: null,
		};
		const within = deriveOrderEntry({ ...input, sizeInput: "12.5" });
		expect(within.maxSize).toBe(12.5);
		expect(within.exceedsMaxSize).toBe(false);

		const beyond = deriveOrderEntry({ ...input, sizeInput: "12.5001" });
		expect(beyond.exceedsMaxSize).toBe(true);

		const market = deriveOrderEntry({
			...input,
			conversionPrice: 100,
			marginNotionalForSize: undefined,
			sizeInput: "10.0001",
		});
		expect(market.maxSize).toBe(10);
		expect(market.exceedsMaxSize).toBe(true);
	});

	it("leaves the exchange maximum in place for reduce-only and disconnected entry", () => {
		const reduceOnly = deriveOrderEntry({
			isConnected: true,
			reduceOnly: true,
			positionSnapshot: { ready: true, receivedAt: Date.now(), signedSize: "-50" },
			market: perpMarket,
			side: "buy",
			conversionPrice: 80,
			markPx: 100,
			marginNotionalForSize: passiveBuyMargin,
			sizeMode: "base",
			sizeInput: "40",
			spotBalances: [usdcBalance],
			maxTradeSzs: [10, 10],
			availableToTrade: [100, 100],
			marketOrderSizing: null,
		});
		expect(reduceOnly.exceedsMaxSize).toBe(false);
	});

	it("fails a perp entry closed when its side has no capacity", () => {
		const derived = deriveOrderEntry({
			isConnected: true,
			market: perpMarket,
			side: "buy",
			conversionPrice: 100,
			markPx: 100,
			sizeMode: "base",
			sizeInput: "1",
			spotBalances: [usdcBalance],
			maxTradeSzs: [0, 10],
			availableToTrade: [100, 100],
			marketOrderSizing: null,
		});
		expect(derived.exceedsMaxSize).toBe(true);
	});

	it("rounds a spot market buy's budget the way the order price is rounded", () => {
		const spotMarket = {
			kind: "spot",
			name: "@1",
			pairName: "HYPE/USDC",
			assetId: 10_001,
			szDecimals: 2,
			tokensInfo: [{ name: "HYPE" }, { name: "USDC" }],
		} as never;
		const derived = deriveOrderEntry({
			isConnected: true,
			market: spotMarket,
			side: "buy",
			conversionPrice: 10,
			sizeMode: "base",
			sizeInput: "10",
			spotBalances: [usdcBalance],
			maxTradeSzs: null,
			availableToTrade: null,
			marketOrderSizing: { referencePx: 10.0065, slippageBps: 250 },
		});
		expect(derived.spotBuyQuoteCost).toBe(102.56);

		const markAboveSendPrice = deriveOrderEntry({
			isConnected: true,
			market: spotMarket,
			side: "buy",
			conversionPrice: 110,
			sizeMode: "base",
			sizeInput: "10",
			spotBalances: [usdcBalance],
			maxTradeSzs: null,
			availableToTrade: null,
			marketOrderSizing: { referencePx: 100, slippageBps: 250 },
		});
		expect(markAboveSendPrice.orderValue).toBe(1100);
		expect(markAboveSendPrice.spotBuyQuoteCost).toBe(1025);
	});

	it("costs a spot market buy at its slippage limit, the price the order is sent at", () => {
		const spotMarket = {
			kind: "spot",
			name: "@1",
			pairName: "HYPE/USDC",
			assetId: 10_001,
			szDecimals: 2,
			tokensInfo: [{ name: "HYPE" }, { name: "USDC" }],
		} as never;
		const derived = deriveOrderEntry({
			isConnected: true,
			market: spotMarket,
			side: "buy",
			conversionPrice: 20,
			sizeMode: "base",
			sizeInput: "10",
			spotBalances: [usdcBalance],
			maxTradeSzs: null,
			availableToTrade: null,
			marketOrderSizing: { referencePx: 20, slippageBps: 250 },
		});
		expect(derived.orderValue).toBe(200);
		expect(derived.spotBuyQuoteCost).toBe(205);
	});
});
