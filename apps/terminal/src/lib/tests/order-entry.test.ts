import { describe, expect, it, vi } from "vitest";
import { getAssetAvailabilityStatus } from "@/domain/trade/order/availability";
import { deriveOrderEntry } from "@/domain/trade/order/derive";
import type { SpotBalance } from "@/hooks/trade/use-account-balances";

vi.mock("@lingui/core/macro", () => ({
	msg: (strings: TemplateStringsArray | string, ...values: unknown[]) => {
		if (typeof strings === "string") return strings;
		return { id: strings.reduce((text, part, index) => `${text}${part}${values[index] ?? ""}`, "") };
	},
	t: (strings: TemplateStringsArray | string, ...values: unknown[]) => {
		if (typeof strings === "string") return strings;
		return strings.reduce((text, part, index) => `${text}${part}${values[index] ?? ""}`, "");
	},
}));

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
		});

		expect(derived.availableBalance).toBe(0);
		expect(derived.displayAvailableBalance).toBe(0);
		expect(derived.maxSize).toBe(0);
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

	it("rejects stale or mismatched payloads", () => {
		expect(getAssetAvailabilityStatus({ ...baseInput, isStale: true })).toBe("loading");
		expect(getAssetAvailabilityStatus({ ...baseInput, coin: "HYPE" })).toBe("loading");
		expect(getAssetAvailabilityStatus({ ...baseInput, user: "0x0000000000000000000000000000000000000000" })).toBe(
			"loading",
		);
	});
});
