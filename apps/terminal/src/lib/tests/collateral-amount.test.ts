import { describe, expect, it } from "vitest";
import { getNumberFormatters } from "@/lib/format";
import type { UnifiedMarket } from "@/lib/hyperliquid";
import {
	formatCollateralAmount,
	getFundingCollateralSymbol,
	getMarketCollateralSymbol,
} from "@/lib/trade/collateral-amount";
import { getFundingPositionPresentation } from "@/lib/trade/funding-position";
import { getMarketPriceFormatOptions } from "@/lib/trade/market-price-format";

const numberFormat = getNumberFormatters();
const USDC_PERP = { kind: "perp", shortName: "BTC", szDecimals: 5 } as UnifiedMarket;
const USDE_DEX = {
	kind: "builderPerp",
	quoteToken: { displayName: "USDE" },
	shortName: "TSLA",
	szDecimals: 3,
} as UnifiedMarket;

describe("collateral amounts", () => {
	it("settles USDC markets in dollars and HIP-3 DEX markets in their collateral token", () => {
		expect(getMarketCollateralSymbol(USDC_PERP)).toBe("USDC");
		expect(getMarketCollateralSymbol(undefined)).toBe("USDC");
		expect(getMarketCollateralSymbol(USDE_DEX)).toBe("USDE");

		expect(formatCollateralAmount("-12.345", "USDC", numberFormat)).toBe("-$12.35");
		expect(formatCollateralAmount("1234567.5", "USDC", numberFormat)).toBe("$1,234,567.50");
		expect(formatCollateralAmount("-12.345", "USDE", numberFormat)).toBe("-12.35 USDE");
		expect(formatCollateralAmount("3", "USDE", numberFormat, { signDisplay: "exceptZero" })).toBe("+3.00 USDE");
	});

	it("names a funding payment's collateral only when the catalog knows it", () => {
		expect(getFundingCollateralSymbol("BTC", USDC_PERP)).toBe("USDC");
		expect(getFundingCollateralSymbol("xyz:TSLA", USDE_DEX)).toBe("USDE");
		expect(getFundingCollateralSymbol("xyz:TSLA", { ...USDE_DEX, quoteToken: undefined } as UnifiedMarket)).toBeNull();
		expect(getFundingCollateralSymbol("xyz:DELISTED", undefined)).toBeNull();
		expect(getFundingCollateralSymbol("OLDPERP", undefined)).toBe("USDC");
	});

	it("keeps the side of a funded position next to its size", () => {
		const translate = (descriptor: { message?: string }) => descriptor.message ?? "";

		expect(getFundingPositionPresentation("-2.5", USDE_DEX, numberFormat.formatToken, translate)).toEqual({
			side: "short",
			sideLabel: "Short",
			size: "2.500 TSLA",
		});
		expect(getFundingPositionPresentation("0.1", USDC_PERP, numberFormat.formatToken, translate)).toMatchObject({
			side: "long",
			sideLabel: "Long",
		});
	});

	it("formats prices with the market's protocol decimals instead of a compact or cent format", () => {
		expect(getMarketPriceFormatOptions(USDC_PERP)).toEqual({ marketType: "perp", szDecimals: 5 });
		expect(getMarketPriceFormatOptions({ kind: "spot", szDecimals: 2 })).toEqual({ marketType: "spot", szDecimals: 2 });
		expect(numberFormat.formatPrice("29780.5", getMarketPriceFormatOptions(USDC_PERP))).toBe("$29,780.5");
		expect(numberFormat.formatPrice("0.18342", getMarketPriceFormatOptions(undefined))).toBe("$0.18342");
	});
});
