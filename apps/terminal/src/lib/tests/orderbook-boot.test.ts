/** @vitest-environment jsdom */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const warmL2BookSubscription = vi.fn();
const isTestnet = vi.fn(() => false);
const storedMarkets: Record<string, string | undefined> = {};

vi.mock("@sairn/hl-react", async (importOriginal) => ({
	...(await importOriginal<typeof import("@sairn/hl-react")>()),
	warmL2BookSubscription,
}));
vi.mock("@/lib/network", () => ({ isTestnet }));
vi.mock("@/stores/use-market-store", () => ({
	getStoredSelectedMarket: (scope: string) => storedMarkets[scope],
}));

// The first import pays the cold transform of hl-react; under a full parallel run it can exceed the
// per-test timeout, so it is warmed once for every suite in this file.
beforeAll(async () => {
	await import("@/lib/trade/orderbook-boot");
}, 60_000);

describe("getBootOrderbookCoin", () => {
	beforeEach(() => {
		Object.assign(storedMarkets, { all: "BTC", perp: "ETH", spot: "@1", "builders-perp": "xyz:SILVER" });
	});

	it("uses perp, builder-perp and indexed spot names from the trade path as the API coin", async () => {
		const { getBootOrderbookCoin } = await import("@/lib/trade/orderbook-boot");
		expect(getBootOrderbookCoin("/trade/HYPE")).toBe("HYPE");
		expect(getBootOrderbookCoin("/trade/xyz:SILVER")).toBe("xyz:SILVER");
		expect(getBootOrderbookCoin("/trade/@142")).toBe("@142");
	});

	it("leaves spot pair names, malformed paths and other routes to the panel", async () => {
		const { getBootOrderbookCoin } = await import("@/lib/trade/orderbook-boot");
		expect(getBootOrderbookCoin("/trade/PURR/USDC")).toBeUndefined();
		expect(getBootOrderbookCoin("/trade/0x0d01dc56dcaaca66ad901c959b4011ec")).toBeUndefined();
		expect(getBootOrderbookCoin("/trade/../HYPE")).toBeUndefined();
		expect(getBootOrderbookCoin("/spot")).toBeUndefined();
		expect(getBootOrderbookCoin("/portfolio")).toBeUndefined();
	});

	it("uses the stored selection for category routes only when it belongs to the route", async () => {
		const { getBootOrderbookCoin } = await import("@/lib/trade/orderbook-boot");
		expect(getBootOrderbookCoin("/perp")).toBe("ETH");
		expect(getBootOrderbookCoin("/builders-perp")).toBe("xyz:SILVER");
		expect(getBootOrderbookCoin("/builders-perp/xyz")).toBe("xyz:SILVER");
		expect(getBootOrderbookCoin("/builders-perp/abc")).toBeUndefined();
		storedMarkets.perp = "../x";
		expect(getBootOrderbookCoin("/perp")).toBeUndefined();
		storedMarkets.perp = undefined;
		expect(getBootOrderbookCoin("/perp")).toBeUndefined();
	});
});

describe("bootOrderbook", () => {
	beforeEach(() => {
		warmL2BookSubscription.mockReset();
		isTestnet.mockReset().mockReturnValue(false);
	});

	it("warms the pooled stream for the route market once and replaces an earlier warm lease", async () => {
		const first = vi.fn();
		const second = vi.fn();
		warmL2BookSubscription.mockReturnValueOnce(first).mockReturnValueOnce(second);
		const { bootOrderbook } = await import("@/lib/trade/orderbook-boot");
		bootOrderbook("/trade/HYPE");
		expect(warmL2BookSubscription).toHaveBeenCalledWith(false, { coin: "HYPE" });
		bootOrderbook("/trade/BTC");
		expect(first).toHaveBeenCalledTimes(1);
		expect(second).not.toHaveBeenCalled();
		expect(warmL2BookSubscription).toHaveBeenLastCalledWith(false, { coin: "BTC" });
	});

	it("does nothing for routes whose market needs the catalog", async () => {
		const { bootOrderbook } = await import("@/lib/trade/orderbook-boot");
		bootOrderbook("/trade/PURR/USDC");
		expect(warmL2BookSubscription).not.toHaveBeenCalled();
	});
});
