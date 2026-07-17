import type { PerpConciseAnnotationsResponse } from "@nktkas/hyperliquid";
import { describe, expect, it } from "vitest";
import {
	createMarketRows,
	getDefaultMarketSubcategory,
	getMarketSelectorPairName,
	isMarketInScope,
	isMarketInSubcategory,
	type MarketRow,
	normalizePerpCategory,
} from "@/components/trade/chart/token-selector-categories";

function market(name: string, kind: MarketRow["kind"], shortName = name.split(":").at(-1) ?? name): MarketRow {
	return {
		name,
		kind,
		shortName,
		pairName: `${shortName}-USDC`,
		dex: kind === "builderPerp" ? name.split(":")[0] : undefined,
	} as MarketRow;
}

function annotatedMarket(name: string): MarketRow {
	const row = createMarketRows([market(name, "builderPerp")], annotations)[0];
	if (!row) throw new Error(`Missing test market: ${name}`);
	return row;
}

const annotations = [
	["xyz:JP225", { category: "indices" }],
	["mkts:USTECH", { category: "indices", displayName: "QQQ", keywords: ["USTECH", "NQ"] }],
	["xyz:AAPL", { category: "stocks" }],
	["xyz:EUR", { category: "FX" }],
	["xyz:BTC", { category: "crypto" }],
	["xyz:COMING", { category: "pre-launch" }],
] as PerpConciseAnnotationsResponse;

describe("token selector categories", () => {
	it("normalizes official category casing", () => {
		expect(normalizePerpCategory(" FX ")).toBe("fx");
		expect(normalizePerpCategory(undefined)).toBeUndefined();
	});

	it("defaults Traditional Finance to Indices", () => {
		expect(getDefaultMarketSubcategory("traditional")).toBe("indices");
		expect(getDefaultMarketSubcategory("all")).toBe("all");
	});

	it("attaches official annotations by canonical market name", () => {
		const source = [market("xyz:JP225", "builderPerp"), market("BTC", "perp")];
		const rows = createMarketRows(source, annotations);

		expect(rows[0]?.annotation?.category).toBe("indices");
		expect(rows[1]?.annotation).toBeUndefined();
		expect(rows[0]?.name).toBe("xyz:JP225");
	});

	it("separates crypto and traditional markets without excluding first-party markets", () => {
		const perp = market("BTC", "perp");
		const spot = market("@1", "spot", "HYPE");
		const stock = annotatedMarket("xyz:AAPL");
		const crypto = annotatedMarket("xyz:BTC");
		const fx = annotatedMarket("xyz:EUR");
		const unannotatedCrypto = market("hyna:HYPE", "builderPerp");

		expect(isMarketInScope(perp, "crypto", false)).toBe(true);
		expect(isMarketInScope(spot, "crypto", false)).toBe(true);
		expect(isMarketInScope(crypto, "crypto", false)).toBe(true);
		expect(isMarketInScope(unannotatedCrypto, "crypto", false)).toBe(true);
		expect(isMarketInScope(stock, "crypto", false)).toBe(false);
		expect(isMarketInScope(stock, "traditional", false)).toBe(true);
		expect(isMarketInScope(fx, "traditional", false)).toBe(true);
		expect(isMarketInSubcategory(stock, "traditional", "stocks")).toBe(true);
		expect(isMarketInSubcategory(stock, "traditional", "indices")).toBe(false);
	});

	it("keeps favorites and pre-launch scopes explicit", () => {
		const upcoming = annotatedMarket("xyz:COMING");

		expect(isMarketInScope(upcoming, "favorites", true)).toBe(true);
		expect(isMarketInScope(upcoming, "favorites", false)).toBe(false);
		expect(isMarketInScope(upcoming, "prelaunch", false)).toBe(true);
	});

	it("uses official display names without changing the canonical symbol", () => {
		const row = annotatedMarket("mkts:USTECH");

		expect(getMarketSelectorPairName(row)).toBe("QQQ-USDC");
		expect(row.name).toBe("mkts:USTECH");
	});

	it("filters spot markets by the displayed quote token", () => {
		const spot = {
			...market("@235", "spot", "HYPE"),
			tokensInfo: [
				{ name: "HYPE", displayName: "HYPE" },
				{ name: "USDT0", displayName: "USDT" },
			],
		} as Extract<MarketRow, { kind: "spot" }>;

		expect(isMarketInSubcategory(spot, "spot", "USDT")).toBe(true);
		expect(isMarketInSubcategory(spot, "spot", "USDT0")).toBe(false);
	});
});
