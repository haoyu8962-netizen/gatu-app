import { describe, expect, it } from "vitest";
import {
	buildSwapQuote,
	getMaxSwapInput,
	getStablecoinSwapFromTokens,
	getStablecoinSwapToTokens,
} from "@/domain/trade/swap";
import type { SpotMarketInfo } from "@/lib/hyperliquid/hooks/useMarketsInfo";
import type { SpotToken } from "@/lib/hyperliquid/markets";

function token(name: string, displayName = name): SpotToken {
	return { name, displayName } as SpotToken;
}

function market(baseToken: SpotToken, quoteToken: SpotToken): SpotMarketInfo {
	return { tokensInfo: [baseToken, quoteToken] } as SpotMarketInfo;
}

describe("stablecoin swap markets", () => {
	const usdc = token("USDC");
	const usdt = token("USDT0", "USDT");
	const usdh = token("USDH");
	const aapl = token("AAPL");
	const markets = [market(usdt, usdc), market(usdh, usdc), market(aapl, usdc)];

	it("only exposes trusted stablecoins in the official display order", () => {
		expect(getStablecoinSwapFromTokens(markets).map(({ name }) => name)).toEqual(["USDC", "USDT0", "USDH"]);
		expect(getStablecoinSwapToTokens("USDC", markets).map(({ name }) => name)).toEqual(["USDT0", "USDH"]);
	});

	it("routes non-USDC stablecoins directly back to USDC", () => {
		expect(getStablecoinSwapToTokens("USDT0", markets).map(({ name }) => name)).toEqual(["USDC"]);
		expect(getStablecoinSwapToTokens("USDH", markets).map(({ name }) => name)).toEqual(["USDC"]);
		expect(getStablecoinSwapToTokens("AAPL", markets)).toEqual([]);
	});
});

describe("swap quote", () => {
	it("quotes a stablecoin buy from executable asks and applies the stable-pair fee reduction", () => {
		const quote = buildSwapQuote({
			amount: "10",
			isBuying: true,
			bids: [],
			asks: [
				{ px: "1", sz: "4" },
				{ px: "1.005", sz: "10" },
			],
			szDecimals: 2,
			slippageBps: 100,
			takerFeeRate: 0.00045,
			isStablecoinSwap: true,
		});

		expect(quote).toMatchObject({
			estimatedReceive: "9.9991",
			feeAmount: "0.0009",
			filledInput: "10.03",
			isBelowMinimumNotional: false,
			isPartial: false,
			limitPrice: "1.01",
			maxInput: "10.1",
			orderNotional: "10",
			orderSize: "10",
		});
	});

	it("detects when rounded size falls below the minimum order notional", () => {
		const quote = buildSwapQuote({
			amount: "10",
			isBuying: true,
			bids: [],
			asks: [{ px: "1.001", sz: "20" }],
			referencePrice: "1.001",
			szDecimals: 2,
			slippageBps: 100,
			takerFeeRate: 0.00045,
			isStablecoinSwap: true,
		});

		expect(quote).toMatchObject({
			isBelowMinimumNotional: true,
			orderNotional: "9.99999",
			orderSize: "9.99",
		});
	});

	it("marks a quote partial when depth beyond the slippage limit is excluded", () => {
		const quote = buildSwapQuote({
			amount: "10",
			isBuying: true,
			bids: [],
			asks: [
				{ px: "1", sz: "4" },
				{ px: "1.005", sz: "2" },
				{ px: "1.02", sz: "20" },
			],
			szDecimals: 2,
			slippageBps: 100,
			takerFeeRate: 0.00045,
			isStablecoinSwap: true,
		});

		expect(quote).toMatchObject({
			estimatedReceive: "5.99946",
			filledInput: "6.01",
			isPartial: true,
			orderSize: "10",
		});
	});

	it("uses the executable ask for the limit while preserving the market reference for order sizing", () => {
		const quote = buildSwapQuote({
			amount: "10",
			isBuying: true,
			bids: [{ px: "332.13", sz: "1" }],
			asks: [{ px: "336.26", sz: "0.18" }],
			referencePrice: "332.13",
			szDecimals: 2,
			slippageBps: 100,
			takerFeeRate: 0.0007,
			isStablecoinSwap: false,
		});

		expect(quote).toMatchObject({
			isPartial: false,
			limitPrice: "339.6226",
			orderSize: "0.03",
		});
	});

	it("reserves buy-side slippage when calculating the maximum input", () => {
		expect(getMaxSwapInput("101", true, 100, 6)).toBe("100");
		expect(getMaxSwapInput("101", false, 100, 6)).toBe("101");
	});
});
