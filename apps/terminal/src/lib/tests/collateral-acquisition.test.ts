import { describe, expect, it } from "vitest";
import { getBuilderPerpSwapTargetToken } from "@/domain/trade/collateral-acquisition";
import type { SpotMarketInfo, UnifiedMarketInfo } from "@/lib/hyperliquid/hooks/useMarketsInfo";
import type { SpotToken } from "@/lib/hyperliquid/markets";

function token(name: string): SpotToken {
	return { name, displayName: name } as SpotToken;
}

function spotMarket(baseToken: SpotToken, quoteToken: SpotToken): SpotMarketInfo {
	return { tokensInfo: [baseToken, quoteToken] } as SpotMarketInfo;
}

function builderMarket(quoteToken: SpotToken | undefined): UnifiedMarketInfo {
	return { kind: "builderPerp", quoteToken } as unknown as UnifiedMarketInfo;
}

describe("builder perp collateral acquisition", () => {
	it("only exposes a swap when collateral metadata and a direct USDC pair both exist", () => {
		const usdc = token("USDC");
		const usdt = token("USDT0");
		const usdh = token("USDH");
		const usdtUsdc = spotMarket(usdt, usdc);
		const usdhUsdc = spotMarket(usdh, usdc);

		expect(getBuilderPerpSwapTargetToken(builderMarket(usdh), [usdtUsdc, usdhUsdc])).toBe("USDH");
		expect(getBuilderPerpSwapTargetToken(builderMarket(usdh), [usdtUsdc])).toBeNull();
		expect(getBuilderPerpSwapTargetToken(builderMarket(undefined), [usdhUsdc])).toBeNull();
		expect(getBuilderPerpSwapTargetToken(builderMarket(usdc), [usdhUsdc])).toBeNull();
		expect(getBuilderPerpSwapTargetToken(undefined, [usdhUsdc])).toBeNull();
	});

	it("accepts either spot pair direction", () => {
		const usdc = token("USDC");
		const usdh = token("USDH");

		expect(getBuilderPerpSwapTargetToken(builderMarket(usdh), [spotMarket(usdc, usdh)])).toBe("USDH");
	});
});
