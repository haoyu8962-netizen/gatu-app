import { describe, expect, it } from "vitest";
import type { MarketCatalogState } from "@/lib/hyperliquid/markets/market-catalog-state";
import { getTradeTerminalBootStatus } from "@/lib/hyperliquid/trade-terminal-boot";

type TestCatalogState = {
	status: MarketCatalogState["status"];
	canResolveNotFound: boolean;
	isRefreshing: boolean;
	isRestoring: boolean;
	isPaused: boolean;
	isStale: boolean;
	error: Error | null;
};

function catalogState(overrides: Partial<TestCatalogState> = {}): MarketCatalogState {
	return {
		status: "ready",
		canResolveNotFound: false,
		isRefreshing: false,
		isRestoring: false,
		isPaused: false,
		isStale: false,
		error: null,
		...overrides,
	} as MarketCatalogState;
}

function bootStatus({
	hasRouteMarketName = true,
	hasResolvedMarket = false,
	hasCanonicalMarket = false,
	hasMalformedRouteMarket = false,
	state = catalogState(),
}: {
	hasRouteMarketName?: boolean;
	hasResolvedMarket?: boolean;
	hasCanonicalMarket?: boolean;
	hasMalformedRouteMarket?: boolean;
	state?: MarketCatalogState;
} = {}) {
	return getTradeTerminalBootStatus({
		hasRouteMarketName,
		hasResolvedMarket,
		hasCanonicalMarket,
		hasMalformedRouteMarket,
		catalogState: state,
	});
}

describe("trade terminal boot state", () => {
	const priorityCases: Array<{
		name: string;
		params: Parameters<typeof bootStatus>[0];
		expected: ReturnType<typeof bootStatus>;
	}> = [
		{
			name: "malformed routes win over every resolved or canonical signal",
			params: {
				hasMalformedRouteMarket: true,
				hasResolvedMarket: true,
				hasCanonicalMarket: true,
				state: catalogState({ status: "loading", isRefreshing: true }),
			},
			expected: "notFound",
		},
		{
			name: "resolved markets win over background refresh and errors",
			params: {
				hasResolvedMarket: true,
				state: catalogState({ status: "error", isRefreshing: true, error: new Error("background") }),
			},
			expected: "ready",
		},
		{
			name: "canonical matches redirect before loading or fresh not-found",
			params: {
				hasCanonicalMarket: true,
				state: catalogState({ status: "loading", canResolveNotFound: true }),
			},
			expected: "redirecting",
		},
		{
			name: "catalog activity wins over fresh not-found",
			params: {
				state: catalogState({ status: "loading", isRestoring: true, isRefreshing: true, canResolveNotFound: true }),
			},
			expected: "loading",
		},
		{
			name: "fresh authoritative not-found wins over paused or error",
			params: {
				state: catalogState({
					status: "paused",
					isPaused: true,
					canResolveNotFound: true,
					error: new Error("offline"),
				}),
			},
			expected: "notFound",
		},
	];

	it.each(priorityCases)("preserves priority: $name", ({ params, expected }) => {
		expect(bootStatus(params)).toBe(expected);
	});

	it("commits the shell as soon as the current market can be resolved", () => {
		expect(bootStatus({ hasResolvedMarket: true, state: catalogState({ isRefreshing: true }) })).toBe("ready");
		expect(bootStatus({ hasRouteMarketName: false })).toBe("ready");
	});

	it("keeps one loading surface while restoring, fetching, or canonicalizing", () => {
		expect(bootStatus({ state: catalogState({ status: "restoring", isRestoring: true }) })).toBe("loading");
		expect(bootStatus({ state: catalogState({ status: "loading" }) })).toBe("loading");
		expect(bootStatus({ state: catalogState({ isRefreshing: true }) })).toBe("loading");
		expect(bootStatus({ hasCanonicalMarket: true })).toBe("redirecting");
	});

	it("shows offline and error states instead of an endless skeleton", () => {
		expect(bootStatus({ state: catalogState({ status: "paused", isPaused: true }) })).toBe("paused");
		expect(bootStatus({ state: catalogState({ status: "error", error: new Error("failed") }) })).toBe("error");
		expect(bootStatus({ state: catalogState({ isStale: true }) })).toBe("error");
	});

	it("returns not found only from a fresh authoritative catalog", () => {
		expect(bootStatus({ state: catalogState({ canResolveNotFound: true }) })).toBe("notFound");
		expect(bootStatus({ state: catalogState({ canResolveNotFound: false, isStale: true }) })).not.toBe("notFound");
	});

	it("rejects a malformed trade path without falling back to a stored market", () => {
		expect(bootStatus({ hasRouteMarketName: false, hasMalformedRouteMarket: true })).toBe("notFound");
	});
});
