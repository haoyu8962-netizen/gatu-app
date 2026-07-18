import { describe, expect, it } from "vitest";
import { deriveScope } from "@/providers/exchange-scope";

describe("exchange scope routing", () => {
	it("derives concrete market scopes from trade URLs", () => {
		expect(deriveScope("/trade/HYPE")).toMatchObject({ scope: "perp", marketName: "HYPE" });
		expect(deriveScope("/trade/ETH/USDH")).toMatchObject({ scope: "spot", marketName: "ETH/USDH" });
		expect(deriveScope("/trade/xyz:SILVER")).toMatchObject({
			scope: "builders-perp",
			dex: "xyz",
			marketName: "xyz:SILVER",
		});
	});

	it("keeps the addressable all-market scope across a refresh", () => {
		expect(deriveScope("/trade/HYPE", "all")).toMatchObject({ scope: "all", marketName: "HYPE" });
		expect(deriveScope("/trade/xyz:SILVER", "all")).toMatchObject({
			scope: "all",
			dex: "xyz",
			marketName: "xyz:SILVER",
		});
	});
});
