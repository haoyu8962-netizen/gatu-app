import { describe, expect, it, vi } from "vitest";
import { deriveOrderEntry } from "@/domain/trade/order/derive";
import type { SpotBalance } from "@/hooks/trade/use-account-balances";

vi.mock("@lingui/core/macro", () => ({
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

describe("order entry balances", () => {
	it("uses spot clearinghouse USDC for unified perp order availability", () => {
		const derived = deriveOrderEntry({
			isConnected: true,
			market: perpMarket,
			side: "buy",
			conversionPrice: 100,
			sizeMode: "base",
			sizeInput: "",
			spotBalances: [usdcBalance],
			accountAbstraction: "unifiedAccount",
			maxTradeSzs: [0, 0],
			availableToTrade: [0, 0],
		});

		expect(derived.availableBalance).toBeCloseTo(549.99);
		expect(derived.displayAvailableBalance).toBeCloseTo(549.99);
		expect(derived.maxSize).toBeCloseTo(5.4999);
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
			accountAbstraction: "disabled",
			maxTradeSzs: [0, 0],
			availableToTrade: [0, 0],
		});

		expect(derived.availableBalance).toBe(0);
		expect(derived.displayAvailableBalance).toBe(0);
		expect(derived.maxSize).toBe(0);
	});
});
