/** @vitest-environment jsdom */

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import type { TwapHistoryResponse, UserFillsResponse } from "@nktkas/hyperliquid";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
	cancelTwap: vi.fn(),
	cancellingTwapId: null as number | null,
	hasActiveOrder: true,
	hasMoreTwapFills: false,
	hasMoreTwapHistory: false,
	isTwapFillsRealtimeDegraded: false,
	isTwapHistoryRealtimeDegraded: false,
	loadMoreTwapFills: vi.fn(),
	loadMoreTwapHistory: vi.fn(),
	navigateToMarket: vi.fn(),
	retryTwapFillsRealtime: vi.fn(),
	retryTwapHistoryRealtime: vi.fn(),
	setOrderType: vi.fn(),
	twapHistory: [
		{
			state: {
				coin: "xyz:GOOGL",
				executedNtl: "2298.0144",
				executedSz: "6.13",
				minutes: 20,
				randomize: true,
				reduceOnly: false,
				side: "B",
				stopPx: "390",
				sz: "15.33",
				timestamp: Date.UTC(2026, 0, 1, 0, 0, 0),
				trigger: { above: true, px: "360" },
				user: "0x1111111111111111111111111111111111111111",
			},
			status: { status: "finished" },
			time: Date.UTC(2026, 0, 1, 0, 10, 0) / 1000,
			twapId: 45,
		},
	] as TwapHistoryResponse,
	twapFills: [
		{
			closedPnl: "2.5",
			coin: "xyz:GOOGL",
			crossed: true,
			dir: "Open Long",
			fee: "0.01",
			feeToken: "USDC",
			hash: `0x${"0".repeat(64)}`,
			oid: 84,
			px: "375",
			side: "B",
			startPosition: "0",
			sz: "5",
			tid: 200,
			time: Date.UTC(2026, 0, 1, 0, 5, 0),
			twapId: 45,
		},
	] as UserFillsResponse,
	twap: {
		coin: "xyz:GOOGL",
		side: "B",
		sz: "15.33",
		executedSz: "6.13",
		executedNtl: "2298.0144",
		timestamp: Date.UTC(2026, 0, 1, 0, 0, 0),
		minutes: 20,
		reduceOnly: false,
	},
}));

vi.mock("@/components/ui/scroll-area", () => ({
	ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	ScrollBar: () => null,
}));

vi.mock("@/components/ui/time-ticker", () => ({
	TimeTicker: ({ format }: { format: (elapsedMs: number) => string }) => <>{format(0)}</>,
}));

vi.mock("@/hooks/trade/use-market-navigation", () => ({
	useMarketNavigation: () => testState.navigateToMarket,
}));

vi.mock("@/hooks/trade/use-twap-cancel", () => ({
	useTwapCancel: () => ({
		cancelTwap: testState.cancelTwap,
		cancellingTwapId: testState.cancellingTwapId,
		feedback: null,
	}),
}));

vi.mock("@/hooks/trade/use-twap-history", () => ({
	useTwapHistory: () => ({
		error: undefined,
		hasMore: testState.hasMoreTwapHistory,
		history: testState.twapHistory,
		isConnected: true,
		isRealtimeDegraded: testState.isTwapHistoryRealtimeDegraded,
		latestHistory: testState.twapHistory,
		loadMore: testState.loadMoreTwapHistory,
		realtimeError: testState.isTwapHistoryRealtimeDegraded ? new Error("History stream unavailable") : undefined,
		retryRealtime: testState.retryTwapHistoryRealtime,
		status: "ready",
	}),
}));

vi.mock("@/hooks/trade/use-twap-slice-fills", () => ({
	useTwapSliceFills: () => ({
		error: undefined,
		fills: testState.twapFills,
		hasMore: testState.hasMoreTwapFills,
		isConnected: true,
		isRealtimeDegraded: testState.isTwapFillsRealtimeDegraded,
		loadMore: testState.loadMoreTwapFills,
		realtimeError: testState.isTwapFillsRealtimeDegraded ? new Error("Fill stream unavailable") : undefined,
		retryRealtime: testState.retryTwapFillsRealtime,
		status: "ready",
	}),
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({ address: "0x1234", isConnected: true }),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useMarkets: () => ({
		getMarket: () => ({
			shortName: "GOOGL",
			kind: "spot",
			tokensInfo: [{ name: "GOOGL" }, { name: "USDH" }],
		}),
		getSzDecimals: () => 2,
	}),
	useSubscription: vi.fn(() => ({
		data: { states: testState.hasActiveOrder ? [[45, testState.twap]] : [] },
		status: "active",
		error: null,
		isStale: false,
	})),
}));

vi.mock("@/stores/use-order-entry-store", () => ({
	useOrderEntryActions: () => ({ setOrderType: testState.setOrderType }),
}));

import { TwapTab } from "@/components/trade/positions/twap-tab";
import { useSubscription } from "@/lib/hyperliquid";

describe("desktop TWAP toolbar", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		vi.mocked(useSubscription).mockClear();
		vi.useFakeTimers();
		vi.setSystemTime(testState.twap.timestamp + 5 * 60_000);
		testState.twap.side = "B";
		testState.cancellingTwapId = null;
		testState.hasActiveOrder = true;
		testState.hasMoreTwapFills = false;
		testState.hasMoreTwapHistory = false;
		testState.isTwapFillsRealtimeDegraded = false;
		testState.isTwapHistoryRealtimeDegraded = false;
		testState.cancelTwap.mockReset();
		testState.loadMoreTwapFills.mockReset();
		testState.loadMoreTwapHistory.mockReset();
		testState.navigateToMarket.mockReset();
		testState.retryTwapFillsRealtime.mockReset();
		testState.retryTwapHistoryRealtime.mockReset();
		testState.setOrderType.mockReset();
		i18n.load("en", {});
		i18n.activate("en");
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.useRealTimers();
	});

	function render() {
		act(() => {
			root.render(
				<I18nProvider i18n={i18n}>
					<TwapTab />
				</I18nProvider>,
			);
		});
	}

	it.each([
		{ status: "active", isStale: false, data: undefined },
		{ status: "subscribing", isStale: false, data: { states: [] } },
		{ status: "error", isStale: false, data: { states: [] } },
		{ status: "active", isStale: true, data: { states: [] } },
	])("never shows empty TWAP guidance before a current snapshot: %o", (snapshot) => {
		vi.mocked(useSubscription).mockReturnValueOnce(snapshot as ReturnType<typeof useSubscription>);
		render();
		expect(container.querySelector('[data-slot="passive-data-placeholder"]')).not.toBeNull();
		expect(container.textContent).not.toMatch(
			/Loading TWAP|Failed to load TWAP|No active TWAP|Create TWAP|may be stale/,
		);
		expect(container.querySelector('button[aria-label="Terminate TWAP order"]')).toBeNull();
		expect(testState.cancelTwap).not.toHaveBeenCalled();
		testState.hasActiveOrder = false;
		render();
		expect(container.textContent).toContain("No active TWAP orders.");
	});

	it("renders the seven design columns from SDK state and Big.js-derived metrics", () => {
		render();

		expect(useSubscription).toHaveBeenCalledWith("twapStates", { user: "0x1234", dex: "ALL_DEXS" }, { enabled: true });
		expect(Array.from(container.querySelectorAll("th"), (cell) => cell.textContent)).toEqual([
			"Asset",
			"Direction",
			"Execution Progress",
			"Average Fill Price",
			"Execution Interval",
			"Remaining Time",
			"Actions",
		]);
		expect(container.textContent).toContain("GOOGL");
		expect(container.textContent).toContain("Buy / Long");
		expect(container.textContent).toContain("6.13 / 15.33 GOOGL");
		expect(container.textContent).toContain("40.0%");
		expect(container.textContent).toContain("$374.88");
		expect(container.textContent).toContain("Every 30 seconds");
		expect(container.textContent).toContain("00:15:00");

		const progress = container.querySelector<HTMLElement>('[role="progressbar"]');
		expect(progress?.getAttribute("aria-valuenow")).toBe("0.3998695368558382");
		expect(progress?.getAttribute("aria-valuetext")).toBe("40.0%");
		expect(progress?.firstElementChild?.getAttribute("style")).toContain("scaleX(0.3998695368558382");
		expect(container.querySelector("thead tr")?.className).toContain("h-[33px]");
		expect(container.querySelector("tbody tr")?.className).toContain("h-14");
	});

	it("explains the unsupported pause action and submits terminate with the exact SDK identity", () => {
		render();

		const pause = container.querySelector<HTMLButtonElement>(
			'button[aria-label="Pause unavailable: Hyperliquid does not support pausing active TWAP orders."]',
		);
		expect(pause?.textContent).toBe("Pause");
		expect(pause?.disabled).toBe(true);
		const terminate = container.querySelector<HTMLButtonElement>('button[aria-label="Terminate TWAP order"]');
		expect(terminate?.textContent).toBe("Terminate");

		act(() => terminate?.click());
		expect(testState.cancelTwap).toHaveBeenCalledWith("xyz:GOOGL", 45);

		testState.twap.side = "A";
		testState.cancellingTwapId = 45;
		render();

		expect(container.textContent).toContain("Sell / Short");
		const sellDirection = Array.from(container.querySelectorAll("td")).find(
			(cell) => cell.textContent === "Sell / Short",
		);
		expect(sellDirection?.className).toContain("text-market-close-danger");
		const busyTerminate = container.querySelector<HTMLButtonElement>('button[aria-label="Terminate TWAP order"]');
		expect(busyTerminate?.disabled).toBe(true);
		expect(busyTerminate?.getAttribute("aria-busy")).toBe("true");
		expect(busyTerminate?.textContent).toBe("Terminating...");
	});

	it("reuses the existing order-entry action for the empty-state CTA", () => {
		testState.hasActiveOrder = false;
		render();

		const createButton = Array.from(container.querySelectorAll("button")).find(
			(button) => button.textContent === "Create TWAP",
		);
		expect(createButton).toBeDefined();
		act(() => createButton?.click());
		expect(testState.setOrderType).toHaveBeenCalledWith("twap");
	});

	it("switches between current, parent history, and slice fill history without mixing their fields", () => {
		render();

		const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
		expect(tabs.map((tab) => tab.textContent)).toEqual(["Current", "History", "Fill History"]);
		expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");

		act(() => tabs[1]?.click());
		expect(Array.from(container.querySelectorAll("th"), (cell) => cell.textContent)).toEqual([
			"Time",
			"Market",
			"Total Size",
			"Executed Size",
			"Average Price",
			"Total Run Time",
			"Trigger Price",
			"Highest / Lowest Price",
			"Reduce Only",
			"Randomized",
			"Status",
		]);
		expect(container.textContent).toContain("15.33 GOOGL");
		expect(container.textContent).toContain("6.13 GOOGL");
		expect(container.textContent).toContain("$374.88");
		expect(container.textContent).toContain("00:10:00");
		expect(container.textContent).toContain("Filled");

		const fillHistoryTab = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find(
			(tab) => tab.textContent === "Fill History",
		);
		act(() => fillHistoryTab?.click());
		expect(Array.from(container.querySelectorAll("th"), (cell) => cell.textContent)).toEqual([
			"Time",
			"Market",
			"Direction",
			"Price",
			"Size",
			"Trade Value",
			"Fee",
			"Closed PNL",
		]);
		expect(container.textContent).toContain("Open Long");
		expect(container.textContent).toContain("5.00 GOOGL");
		expect(container.textContent).toContain("1,875.00 USDH");
		expect(container.textContent).toContain("0.01000 USDC");
		expect(container.textContent).toContain("+2.50 USDC");
	});

	it("keeps cached history visible while exposing realtime recovery and pagination controls", () => {
		testState.hasMoreTwapHistory = true;
		testState.isTwapHistoryRealtimeDegraded = true;
		render();

		const historyTab = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find(
			(tab) => tab.textContent === "History",
		);
		act(() => historyTab?.click());

		expect(container.textContent).toContain("15.33 GOOGL");
		expect(container.querySelector("output")).toBeNull();
		expect(container.textContent).not.toContain("Real-time TWAP updates are unavailable.");
		const retry = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
			(button) => button.textContent === "Retry",
		);
		const loadMore = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
			(button) => button.textContent === "Load more",
		);
		act(() => retry?.click());
		act(() => loadMore?.click());
		expect(testState.retryTwapHistoryRealtime).toHaveBeenCalledTimes(1);
		expect(testState.loadMoreTwapHistory).toHaveBeenCalledTimes(1);
	});
});
