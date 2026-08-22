/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useProspectiveCrossMarginAccount } from "@/hooks/trade/use-prospective-cross-margin-account";
import type { UnifiedMarketInfo } from "@/lib/hyperliquid/hooks/useMarketsInfo";

const BASE_TIME = 1_000_000;

const mocks = vi.hoisted(() => ({
	address: "0xabc",
	balances: createBalances({ perpReceivedAt: 1_000_000, spotReceivedAt: 1_000_050 }),
	markets: {
		spotMarkets: [{ tokensInfo: [{ name: "USDC", index: 0 }] }],
		builderPerpMarkets: { all: [] },
	},
}));

vi.mock("@/hooks/trade/use-account-balances", () => ({
	useDexBalances: () => mocks.balances,
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({ address: mocks.address, isConnected: true }),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useMarketsInfo: () => mocks.markets,
}));

const MARKET = { assetId: 0, kind: "perp", name: "BTC" } as UnifiedMarketInfo;

let latest: ReturnType<typeof useProspectiveCrossMarginAccount>;

function Harness({ market = MARKET }: { market?: UnifiedMarketInfo }) {
	latest = useProspectiveCrossMarginAccount(market);
	return null;
}

describe("useProspectiveCrossMarginAccount", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(BASE_TIME + 50);
		mocks.address = "0xabc";
		mocks.balances = createBalances({ perpReceivedAt: BASE_TIME, spotReceivedAt: BASE_TIME + 50 });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.useRealTimers();
	});

	it("retains the last paired unified snapshot while the next stream leg arrives", () => {
		act(() => root.render(<Harness />));
		expect(latest.account).toEqual({ accountValue: "100", maintenanceMarginUsed: "5" });

		vi.setSystemTime(BASE_TIME + 5_057);
		mocks.balances = createBalances({
			perpReceivedAt: BASE_TIME + 5_057,
			spotReceivedAt: BASE_TIME + 50,
			maintenanceMarginUsed: "6",
		});
		act(() => root.render(<Harness />));

		expect(latest.account).toEqual({ accountValue: "100", maintenanceMarginUsed: "5" });

		vi.setSystemTime(BASE_TIME + 5_107);
		mocks.balances = createBalances({
			perpReceivedAt: BASE_TIME + 5_057,
			spotReceivedAt: BASE_TIME + 5_107,
			maintenanceMarginUsed: "6",
			spotTotal: "120",
		});
		act(() => root.render(<Harness />));

		expect(latest.account).toEqual({ accountValue: "120", maintenanceMarginUsed: "6" });
	});

	it("does not retain a stale or cross-identity account snapshot", () => {
		act(() => root.render(<Harness />));
		expect(latest.account).not.toBeNull();

		vi.setSystemTime(BASE_TIME + 61_000);
		mocks.balances = { ...mocks.balances };
		act(() => root.render(<Harness market={{ ...MARKET } as UnifiedMarketInfo} />));
		expect(latest.account).toBeNull();

		vi.setSystemTime(BASE_TIME + 5_057);
		mocks.address = "0xdef";
		mocks.balances = createBalances({
			perpReceivedAt: BASE_TIME + 5_057,
			spotReceivedAt: BASE_TIME + 50,
		});
		act(() => root.render(<Harness market={{ ...MARKET } as UnifiedMarketInfo} />));
		expect(latest.account).toBeNull();
	});
});

function createBalances({
	perpReceivedAt,
	spotReceivedAt,
	maintenanceMarginUsed = "5",
	spotTotal = "100",
}: {
	perpReceivedAt: number;
	spotReceivedAt: number;
	maintenanceMarginUsed?: string;
	spotTotal?: string;
}) {
	return {
		accountAbstraction: "unifiedAccount",
		allDexClearinghouseStates: [
			[
				"",
				{
					assetPositions: [],
					crossMaintenanceMarginUsed: maintenanceMarginUsed,
					crossMarginSummary: { accountValue: "90" },
				},
			],
		],
		hasAllDexsSnapshot: true,
		hasSpotStateSnapshot: true,
		perpStateReceivedAt: perpReceivedAt,
		perpStateStatus: "success",
		spotBalances: [{ token: 0, total: spotTotal }],
		spotStateReceivedAt: spotReceivedAt,
		spotStateStatus: "success",
	};
}
