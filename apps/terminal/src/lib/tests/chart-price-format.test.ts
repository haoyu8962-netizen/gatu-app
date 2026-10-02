import Big from "big.js";
import { describe, expect, it } from "vitest";
import { getChartSymbolInfo } from "@/lib/chart/market-symbol";
import { getChartPriceFormat } from "@/lib/chart/price-format";
import type { UnifiedMarketInfo } from "@/lib/hyperliquid";
import { getTradePriceDecimals } from "@/lib/trade/trades";

const PERP_SZ_DECIMALS_0_TICKS =
	"0.000001 0.099999 0.00001 0.99999 0.0001 9.9999 0.001 99.999 0.01 999.99 0.1 9999.9 1";
const PERP_SZ_DECIMALS_2_TICKS = "0.0001 9.9999 0.001 99.999 0.01 999.99 0.1 9999.9 1";
const PERP_SZ_DECIMALS_4_TICKS = "0.01 999.99 0.1 9999.9 1";
const PERP_SZ_DECIMALS_5_TICKS = "0.1 9999.9 1";
const SPOT_SZ_DECIMALS_0_TICKS =
	"0.00000001 0.00099999 0.0000001 0.0099999 0.000001 0.099999 0.00001 0.99999 0.0001 9.9999 0.001 99.999 0.01 999.99 0.1 9999.9 1";
const SPOT_SZ_DECIMALS_5_TICKS = "0.001 99.999 0.01 999.99 0.1 9999.9 1";

type MarketFields = Pick<UnifiedMarketInfo, "kind" | "name" | "pairName" | "szDecimals">;

function withMarkPx(fields: MarketFields, markPx: string | undefined): UnifiedMarketInfo {
	return { ...fields, markPx } as UnifiedMarketInfo;
}

function getDecimals(value: string): number {
	return value.split(".")[1]?.length ?? 0;
}

// Mirrors the vendored library's variable tick lookup, where a price equal to a band's limit uses that
// band; tests/browser/chart-price-format-probe.mjs checks the library itself.
function getTradingViewTickDecimals(variableTickSize: string, price: string): number {
	const parts = variableTickSize.split(" ");
	for (let index = 0; index < parts.length - 1; index += 2) {
		if (Number(price) <= Number(parts[index + 1])) return getDecimals(parts[index] ?? "");
	}
	return getDecimals(parts.at(-1) ?? "");
}

function getHyperliquidPriceDecimals(price: string, maxDecimals: number): number {
	return Math.min(maxDecimals, Math.max(0, 4 - new Big(price).e));
}

describe("chart price format", () => {
	it.each<[string, MarketFields, string[], number, string]>([
		[
			"a perp with szDecimals 2",
			{ kind: "perp", name: "HYPE", pairName: "HYPE-USDC", szDecimals: 2 },
			["90", "90.0", "90.000", "90.001", "90.0010", "90.0865", "90.1", "90.10"],
			1_000,
			PERP_SZ_DECIMALS_2_TICKS,
		],
		[
			"a perp quoted in whole dollars",
			{ kind: "perp", name: "BTC", pairName: "BTC-USDC", szDecimals: 5 },
			["118234", "118234.0", "118234.5", "118234.50"],
			1,
			PERP_SZ_DECIMALS_5_TICKS,
		],
		[
			"a perp with one decimal at its price",
			{ kind: "perp", name: "ETH", pairName: "ETH-USDC", szDecimals: 4 },
			["4012", "4012.3", "4012.30", "4012.35"],
			10,
			PERP_SZ_DECIMALS_4_TICKS,
		],
		[
			"a low-priced perp capped by 6 - szDecimals",
			{ kind: "perp", name: "kPEPE", pairName: "kPEPE-USDC", szDecimals: 0 },
			["0.0123", "0.012345", "0.0123450", "0.01234567"],
			1_000_000,
			PERP_SZ_DECIMALS_0_TICKS,
		],
		[
			"a spot pair with szDecimals 0",
			{ kind: "spot", name: "PURR/USDC", pairName: "PURR/USDC", szDecimals: 0 },
			["0.2", "0.20000", "0.21234", "0.212340"],
			100_000,
			SPOT_SZ_DECIMALS_0_TICKS,
		],
		[
			"a spot pair capped by 8 - szDecimals",
			{ kind: "spot", name: "@235", pairName: "ETH/USDH", szDecimals: 5 },
			["68.7", "68.7000", "68.712", "68.7125"],
			1_000,
			SPOT_SZ_DECIMALS_5_TICKS,
		],
		[
			"a builder perp with szDecimals 2",
			{ kind: "builderPerp", name: "xyz:SILVER", pairName: "SILVER-USDC", szDecimals: 2 },
			["47", "47.12", "47.123", "47.1230"],
			1_000,
			PERP_SZ_DECIMALS_2_TICKS,
		],
		[
			"a builder perp quoted in whole points",
			{ kind: "builderPerp", name: "xyz:XYZ100", pairName: "XYZ100-USDC", szDecimals: 4 },
			["25012", "25012.0", "25012.5"],
			1,
			PERP_SZ_DECIMALS_4_TICKS,
		],
	])(
		"pins the price format of %s regardless of the mark price's trailing digits",
		(_label, fields, marks, pricescale, ticks) => {
			for (const markPx of marks) {
				const symbolInfo = getChartSymbolInfo(withMarkPx(fields, markPx));
				expect(symbolInfo.pricescale, markPx).toBe(pricescale);
				expect(symbolInfo.variable_tick_size, markPx).toBe(ticks);
				const marketType = fields.kind === "spot" ? "spot" : "perp";
				expect(symbolInfo.pricescale, markPx).toBe(10 ** getTradePriceDecimals(markPx, fields.szDecimals, marketType));
			}
		},
	);

	it("keeps the per-price ticks when the mark price crosses a power of ten", () => {
		const fields: MarketFields = { kind: "perp", name: "HYPE", pairName: "HYPE-USDC", szDecimals: 2 };

		expect(getChartSymbolInfo(withMarkPx(fields, "99.999"))).toMatchObject({
			pricescale: 1_000,
			variable_tick_size: PERP_SZ_DECIMALS_2_TICKS,
		});
		expect(getChartSymbolInfo(withMarkPx(fields, "100"))).toMatchObject({
			pricescale: 100,
			variable_tick_size: PERP_SZ_DECIMALS_2_TICKS,
		});
	});

	it.each([undefined, "", "0", "-1", "not a price"])(
		"uses the market's finest tick as the scale without a usable mark price (%s)",
		(markPx) => {
			expect(getChartPriceFormat(2, "perp", markPx)).toEqual({
				pricescale: 10_000,
				variable_tick_size: PERP_SZ_DECIMALS_2_TICKS,
			});
			expect(getChartPriceFormat(0, "spot", markPx)).toEqual({
				pricescale: 100_000_000,
				variable_tick_size: SPOT_SZ_DECIMALS_0_TICKS,
			});
		},
	);

	it.each([undefined, Number.NaN, -1, 1.5])(
		"falls back to the protocol maximum for invalid szDecimals (%s)",
		(szDecimals) => {
			expect(getChartPriceFormat(szDecimals, "perp", "90")).toEqual({
				pricescale: 1_000,
				variable_tick_size: PERP_SZ_DECIMALS_0_TICKS,
			});
		},
	);

	it("omits the variable tick size when the market only allows whole prices", () => {
		expect(getChartPriceFormat(6, "perp", "0.5")).toEqual({ pricescale: 1 });
	});

	it.each<[string, number, string[]]>([
		[
			PERP_SZ_DECIMALS_2_TICKS,
			4,
			[
				"0.0001",
				"0.5",
				"1.2345",
				"9.9999",
				"10",
				"10.001",
				"99.999",
				"100",
				"100.01",
				"999.99",
				"1000",
				"1000.1",
				"9999.9",
				"10000",
				"123456",
			],
		],
		[
			SPOT_SZ_DECIMALS_0_TICKS,
			8,
			[
				"0.00000001",
				"0.00012345",
				"0.00099999",
				"0.001",
				"0.0012345",
				"0.0099999",
				"0.01",
				"0.099999",
				"0.1",
				"0.99999",
				"1",
				"9.9999",
				"10",
				"12345",
				"123456",
			],
		],
	])("maps every band boundary of %s to Hyperliquid's decimals", (ticks, maxDecimals, prices) => {
		for (const price of prices) {
			expect(getTradingViewTickDecimals(ticks, price), price).toBe(getHyperliquidPriceDecimals(price, maxDecimals));
		}
	});
});
