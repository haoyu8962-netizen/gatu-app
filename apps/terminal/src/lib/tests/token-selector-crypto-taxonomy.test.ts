import { describe, expect, it } from "vitest";
import {
	CRYPTO_MARKET_NAMES_BY_SECTOR,
	CRYPTO_MARKET_SECTORS,
	CRYPTO_MARKET_TAXONOMY_REVISION,
	getCryptoMarketSectors,
	isCryptoMarketSector,
	isMainPerpMarketInCryptoSector,
} from "@/domain/market/crypto-taxonomy";
import { OFFICIAL_TERMINAL_CRYPTO_TAXONOMY_SNAPSHOT } from "@/lib/tests/fixtures/crypto-market-taxonomy-snapshot";

describe("token selector crypto taxonomy", () => {
	it("records the official terminal snapshot revision", () => {
		expect(CRYPTO_MARKET_TAXONOMY_REVISION).toBe(OFFICIAL_TERMINAL_CRYPTO_TAXONOMY_SNAPSHOT.revision);
		expect(OFFICIAL_TERMINAL_CRYPTO_TAXONOMY_SNAPSHOT.source).toBe("https://app.hyperliquid.xyz/trade/HYPE");
		expect(OFFICIAL_TERMINAL_CRYPTO_TAXONOMY_SNAPSHOT.captureMethod).toContain("Official terminal");
	});

	it("requires review when the captured official membership snapshot changes", () => {
		expect(CRYPTO_MARKET_NAMES_BY_SECTOR).toEqual(OFFICIAL_TERMINAL_CRYPTO_TAXONOMY_SNAPSHOT.namesBySector);
	});

	it("keeps the official sector order separate from the All UI filter", () => {
		expect(CRYPTO_MARKET_SECTORS).toEqual(["ai", "defi", "gaming", "layer1", "layer2", "meme"]);
		expect(CRYPTO_MARKET_NAMES_BY_SECTOR).not.toHaveProperty("all");
	});

	it("narrows only supported sector values", () => {
		expect(isCryptoMarketSector("ai")).toBe(true);
		expect(isCryptoMarketSector("all")).toBe(false);
		expect(isCryptoMarketSector("AI")).toBe(false);
	});

	it("contains the complete official sector superset without duplicate names within a sector", () => {
		expect(
			Object.fromEntries(CRYPTO_MARKET_SECTORS.map((sector) => [sector, CRYPTO_MARKET_NAMES_BY_SECTOR[sector].length])),
		).toEqual({
			ai: 17,
			defi: 39,
			gaming: 17,
			layer1: 50,
			layer2: 19,
			meme: 31,
		});

		for (const sector of CRYPTO_MARKET_SECTORS) {
			const names = CRYPTO_MARKET_NAMES_BY_SECTOR[sector];
			expect(new Set(names).size).toBe(names.length);
		}
	});

	it("supports official multi-sector membership", () => {
		expect(getCryptoMarketSectors("NEAR")).toEqual(["ai", "layer1"]);
		expect(getCryptoMarketSectors("0G")).toEqual(["ai", "layer1"]);
		expect(getCryptoMarketSectors("INJ")).toEqual(["defi", "layer1"]);
		expect(getCryptoMarketSectors("IMX")).toEqual(["gaming", "layer2"]);
	});

	it("matches the original main-perp market name exactly", () => {
		expect(isMainPerpMarketInCryptoSector("kPEPE", "meme")).toBe(true);
		expect(isMainPerpMarketInCryptoSector("KPEPE", "meme")).toBe(false);
		expect(isMainPerpMarketInCryptoSector("xyz:BTC", "layer1")).toBe(false);
		expect(isMainPerpMarketInCryptoSector("@1", "layer1")).toBe(false);
	});

	it("keeps unknown markets in no specific sector", () => {
		expect(getCryptoMarketSectors("UNKNOWN")).toEqual([]);
		expect(isMainPerpMarketInCryptoSector("UNKNOWN", "ai")).toBe(false);
	});
});
