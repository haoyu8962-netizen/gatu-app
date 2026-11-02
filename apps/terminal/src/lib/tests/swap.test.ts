import { describe, expect, it } from "vitest";
import {
	buildSwapQuote,
	findSpotPair,
	getMaxSwapInput,
	getStablecoinSwapFromTokens,
	getStablecoinSwapToTokens,
	getSwapSide,
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

	it("finds spot pairs in either token order and derives the submitted order side", () => {
		const usdtUsdc = markets[0];

		expect(findSpotPair("USDC", "USDT0", markets)).toBe(usdtUsdc);
		expect(findSpotPair("USDT0", "USDC", markets)).toBe(usdtUsdc);
		expect(findSpotPair("USDT0", "USDH", markets)).toBeNull();
		expect(getSwapSide("USDC", usdtUsdc)).toBe(true);
		expect(getSwapSide("USDT0", usdtUsdc)).toBe(false);
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
			builderFeeTenthsBps: 10,
			isStablePair: true,
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
			builderFeeTenthsBps: 10,
			isStablePair: true,
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
			builderFeeTenthsBps: 10,
			isStablePair: true,
		});

		expect(quote).toMatchObject({
			estimatedReceive: "5.99946",
			filledInput: "6.01",
			isPartial: true,
			orderSize: "10",
		});
	});

	it("uses the executable ask for both buy sizing and the slippage limit", () => {
		const quote = buildSwapQuote({
			amount: "10",
			isBuying: true,
			bids: [{ px: "332.13", sz: "1" }],
			asks: [{ px: "336.26", sz: "0.18" }],
			referencePrice: "332.13",
			szDecimals: 2,
			slippageBps: 100,
			takerFeeRate: 0.0007,
			builderFeeTenthsBps: 10,
			isStablePair: false,
		});

		expect(quote).toMatchObject({
			isBelowMinimumNotional: true,
			isPartial: false,
			limitPrice: "339.6226",
			orderSize: "0.02",
		});
	});

	it("quotes stablecoin sells from bids with downward slippage and includes the builder fee", () => {
		const quote = buildSwapQuote({
			amount: "10",
			isBuying: false,
			bids: [
				{ px: "1", sz: "4" },
				{ px: "0.995", sz: "6" },
				{ px: "0.98", sz: "20" },
			],
			asks: [{ px: "1.001", sz: "20" }],
			referencePrice: "1",
			szDecimals: 2,
			slippageBps: 100,
			takerFeeRate: 0.0007,
			builderFeeTenthsBps: 10,
			isStablePair: true,
		});

		expect(quote).toMatchObject({
			estimatedReceive: "9.9676072",
			feeAmount: "0.0023928",
			filledInput: "10",
			isPartial: false,
			limitPrice: "0.99",
			maxInput: "10",
			orderSize: "10",
			rate: "0.997",
		});
	});

	it("keeps a maximum buy quote within balance when the best ask is above the mark price", () => {
		const balance = "10000";
		const amount = getMaxSwapInput(balance, true, 100, 6);
		const quote = buildSwapQuote({
			amount,
			isBuying: true,
			bids: [{ px: "0.9998", sz: "20000" }],
			asks: [{ px: "1.0001", sz: "20000" }],
			referencePrice: "0.9999",
			szDecimals: 6,
			slippageBps: 100,
			takerFeeRate: 0.0007,
			builderFeeTenthsBps: 10,
			isStablePair: true,
		});

		expect(Number(quote?.maxInput)).toBeLessThanOrEqual(Number(balance));
	});

	it("reserves buy-side slippage when calculating the maximum input", () => {
		expect(getMaxSwapInput("101", true, 100, 6)).toBe("100.00");
		expect(getMaxSwapInput("101", false, 100, 6)).toBe("101.00");
		expect(getMaxSwapInput("101.5", false, 100, 0)).toBe("101");
	});
});
