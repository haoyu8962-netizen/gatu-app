import type { PerpConciseAnnotationsResponse } from "@nktkas/hyperliquid";
import { describe, expect, it } from "vitest";
import {
	createMarketRows,
	filterMarketRowsByScope,
	getDefaultMarketSubcategory,
	getMarketClassificationState,
	getMarketSelectorPairName,
	getSpotQuoteSubcategories,
	isMarketInScope,
	isMarketInSubcategory,
	type MarketRow,
	marketScopeUsesAnnotations,
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
	["para:AAOI", { category: "stock" }],
	["para:UNITREE", { category: "preipo" }],
] as PerpConciseAnnotationsResponse;

describe("token selector categories", () => {
	it("normalizes official category casing", () => {
		expect(normalizePerpCategory(" FX ")).toBe("fx");
		expect(normalizePerpCategory("stock")).toBe("stocks");
		expect(normalizePerpCategory(undefined)).toBeUndefined();
	});

	it("defaults every scope to its complete market set", () => {
		expect(getDefaultMarketSubcategory("traditional")).toBe("all");
		expect(getDefaultMarketSubcategory("prelaunch")).toBe("all");
		expect(getDefaultMarketSubcategory("all")).toBe("all");
	});

	it("identifies scopes that require official annotations", () => {
		expect(marketScopeUsesAnnotations("crypto")).toBe(false);
		expect(marketScopeUsesAnnotations("traditional")).toBe(true);
		expect(marketScopeUsesAnnotations("prelaunch")).toBe(true);
		expect(marketScopeUsesAnnotations("all")).toBe(false);
		expect(marketScopeUsesAnnotations("hip3")).toBe(false);
	});

	it("distinguishes pending, error, empty, and ready classification data", () => {
		expect(getMarketClassificationState("crypto", undefined, { isPending: true, isError: false })).toBe("ready");
		expect(getMarketClassificationState("traditional", undefined, { isPending: false, isError: true })).toBe("error");
		expect(getMarketClassificationState("prelaunch", undefined, { isPending: true, isError: false })).toBe("pending");
		expect(getMarketClassificationState("traditional", [], { isPending: false, isError: false })).toBe("empty");
		expect(getMarketClassificationState("traditional", annotations, { isPending: false, isError: true })).toBe("ready");
		expect(getMarketClassificationState("all", undefined, { isPending: true, isError: false })).toBe("ready");
	});

	it("uses the official preipo annotation for the Pre-launch scope", () => {
		const prelaunch = annotatedMarket("para:UNITREE");
		const stock = annotatedMarket("para:AAOI");

		expect(isMarketInScope(prelaunch, "prelaunch", false)).toBe(true);
		expect(isMarketInScope(stock, "prelaunch", false)).toBe(false);
		expect(isMarketInScope(market("UNITREE", "perp"), "prelaunch", false)).toBe(false);
	});

	it("suppresses only annotation-dependent results until classification data is ready", () => {
		const rows = createMarketRows([market("BTC", "perp"), market("xyz:AAPL", "builderPerp")], annotations);
		const favorites = new Set<string>();

		expect(filterMarketRowsByScope(rows, "traditional", "all", favorites, "pending")).toEqual([]);
		expect(filterMarketRowsByScope(rows, "traditional", "all", favorites, "error")).toEqual([]);
		expect(filterMarketRowsByScope(rows, "traditional", "all", favorites, "empty")).toEqual([]);
		expect(filterMarketRowsByScope(rows, "crypto", "all", favorites, "ready").map(({ name }) => name)).toEqual(["BTC"]);
	});

	it("attaches official annotations by canonical market name", () => {
		const source = [market("xyz:JP225", "builderPerp"), market("BTC", "perp")];
		const rows = createMarketRows(source, annotations);

		expect(rows[0]?.annotation?.category).toBe("indices");
		expect(rows[1]?.annotation).toBeUndefined();
		expect(rows[0]?.name).toBe("xyz:JP225");
	});

	it("separates first-dex crypto perps from spot and HIP-3 markets", () => {
		const perp = market("BTC", "perp");
		const spot = market("@1", "spot", "HYPE");
		const stock = annotatedMarket("xyz:AAPL");
		const crypto = annotatedMarket("xyz:BTC");
		const fx = annotatedMarket("xyz:EUR");
		const unannotatedCrypto = market("hyna:HYPE", "builderPerp");

		expect(isMarketInScope(perp, "crypto", false)).toBe(true);
		expect(isMarketInScope(spot, "crypto", false)).toBe(false);
		expect(isMarketInScope(crypto, "crypto", false)).toBe(false);
		expect(isMarketInScope(unannotatedCrypto, "crypto", false)).toBe(false);
		expect(isMarketInScope(stock, "crypto", false)).toBe(false);
		expect(isMarketInScope(stock, "traditional", false)).toBe(true);
		expect(isMarketInScope(fx, "traditional", false)).toBe(true);
		expect(isMarketInSubcategory(stock, "traditional", "stocks")).toBe(true);
		expect(isMarketInSubcategory(stock, "traditional", "indices")).toBe(false);
	});

	it("filters Crypto subcategories by canonical main-perp names and supports multiple sectors", () => {
		const near = market("NEAR", "perp");
		const imx = market("IMX", "perp");
		const pepe = market("kPEPE", "perp");
		const unknown = market("UNMAPPED", "perp");
		const builderNear = market("hyna:NEAR", "builderPerp", "NEAR");

		expect(isMarketInSubcategory(near, "crypto", "ai")).toBe(true);
		expect(isMarketInSubcategory(near, "crypto", "layer1")).toBe(true);
		expect(isMarketInSubcategory(imx, "crypto", "gaming")).toBe(true);
		expect(isMarketInSubcategory(imx, "crypto", "layer2")).toBe(true);
		expect(isMarketInSubcategory(pepe, "crypto", "meme")).toBe(true);
		expect(isMarketInSubcategory(unknown, "crypto", "meme")).toBe(false);
		expect(isMarketInSubcategory(builderNear, "crypto", "ai")).toBe(false);
	});

	it("normalizes the official singular stock annotation", () => {
		const stock = annotatedMarket("para:AAOI");

		expect(isMarketInScope(stock, "traditional", false)).toBe(true);
		expect(isMarketInSubcategory(stock, "traditional", "stocks")).toBe(true);
	});

	it("keeps favorites explicit", () => {
		const favorite = annotatedMarket("xyz:BTC");

		expect(isMarketInScope(favorite, "favorites", true)).toBe(true);
		expect(isMarketInScope(favorite, "favorites", false)).toBe(false);
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

	it("derives spot quote filters from live metadata", () => {
		function spotWithQuote(name: string, quoteName: string, quoteDisplayName?: string): MarketRow {
			return {
				...market(name, "spot", "HYPE"),
				tokensInfo: [
					{ name: "HYPE", displayName: "HYPE" },
					{ name: quoteName, displayName: quoteDisplayName },
				],
			} as Extract<MarketRow, { kind: "spot" }>;
		}

		const subcategories = getSpotQuoteSubcategories([
			spotWithQuote("@1", "USDE"),
			spotWithQuote("@2", "USDT0", "USDT"),
			spotWithQuote("@3", "USDC"),
			spotWithQuote("@4", "USDH"),
		]);

		expect(subcategories.map(({ value }) => value)).toEqual(["all", "USDC", "USDH", "USDT", "USDE"]);
	});
});
