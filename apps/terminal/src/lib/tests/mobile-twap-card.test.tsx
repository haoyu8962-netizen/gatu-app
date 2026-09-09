/** @vitest-environment jsdom */

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import type { TwapHistoryResponse, UserFillsResponse } from "@nktkas/hyperliquid";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	cancelTwap: vi.fn(),
	hasActiveOrder: true,
	hasSnapshot: true,
	status: "active",
	isStale: false,
	feedback: null as { message: string; tone: "error" } | null,
	hasMoreTwapFills: false,
	hasMoreTwapHistory: false,
	isTwapFillsRealtimeDegraded: false,
	isTwapHistoryRealtimeDegraded: false,
	loadMoreTwapFills: vi.fn(),
	loadMoreTwapHistory: vi.fn(),
	navigateToMarket: vi.fn(),
	retryTwapFillsRealtime: vi.fn(),
	retryTwapHistoryRealtime: vi.fn(),
	setActiveTab: vi.fn(),
	setOrderType: vi.fn(),
	side: "B" as "A" | "B",
	twapHistory: [
		{
			state: {
				coin: "GOOGL",
				executedNtl: "2298.76416",
				executedSz: "6.132",
				minutes: 30,
				randomize: true,
				reduceOnly: false,
				side: "B",
				stopPx: null,
				sz: "15.33",
				timestamp: Date.UTC(2026, 0, 1, 0, 0, 0),
				trigger: null,
				user: "0x1111111111111111111111111111111111111111",
			},
			status: { status: "finished" },
			time: Date.UTC(2026, 0, 1, 0, 30, 0) / 1000,
			twapId: 42,
		},
	] as TwapHistoryResponse,
	twapFills: [
		{
			closedPnl: "1.25",
			coin: "GOOGL",
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
			twapId: 42,
		},
	] as UserFillsResponse,
}));

vi.mock("boneyard-js/react", () => ({
	Skeleton: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/components/ui/time-ticker", () => ({
	TimeTicker: () => <>18:24</>,
}));

vi.mock("@/hooks/trade/use-market-navigation", () => ({
	useMarketNavigation: () => mocks.navigateToMarket,
}));

vi.mock("@/hooks/trade/use-twap-cancel", () => ({
	useTwapCancel: () => ({
		cancelTwap: mocks.cancelTwap,
		cancellingTwapId: null,
		feedback: mocks.feedback,
	}),
}));

vi.mock("@/hooks/trade/use-twap-history", () => ({
	useTwapHistory: () => ({
		error: undefined,
		hasMore: mocks.hasMoreTwapHistory,
		history: mocks.twapHistory,
		isConnected: true,
		isRealtimeDegraded: mocks.isTwapHistoryRealtimeDegraded,
		latestHistory: mocks.twapHistory,
		loadMore: mocks.loadMoreTwapHistory,
		realtimeError: mocks.isTwapHistoryRealtimeDegraded ? new Error("History stream unavailable") : undefined,
		retryRealtime: mocks.retryTwapHistoryRealtime,
		status: "ready",
	}),
}));

vi.mock("@/hooks/trade/use-twap-slice-fills", () => ({
	useTwapSliceFills: () => ({
		error: undefined,
		fills: mocks.twapFills,
		hasMore: mocks.hasMoreTwapFills,
		isConnected: true,
		isRealtimeDegraded: mocks.isTwapFillsRealtimeDegraded,
		loadMore: mocks.loadMoreTwapFills,
		realtimeError: mocks.isTwapFillsRealtimeDegraded ? new Error("Fill stream unavailable") : undefined,
		retryRealtime: mocks.retryTwapFillsRealtime,
		status: "ready",
	}),
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({
		address: "0x1111111111111111111111111111111111111111",
		isConnected: true,
	}),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useMarkets: () => ({
		getMarket: () => ({
			kind: "spot",
			shortName: "GOOGL",
			tokensInfo: [{ name: "GOOGL" }, { name: "USDH" }],
		}),
		getSzDecimals: () => 3,
	}),
	useSubscription: vi.fn(() => ({
		data: mocks.hasSnapshot
			? {
					dex: "",
					user: "0x1111111111111111111111111111111111111111",
					states: mocks.hasActiveOrder
						? [
								[
									42,
									{
										coin: "GOOGL",
										executedNtl: "2298.76416",
										executedSz: "6.132",
										minutes: 30,
										randomize: false,
										reduceOnly: false,
										side: mocks.side,
										stopPx: null,
										sz: "15.33",
										timestamp: Date.now() - 696_000,
										trigger: null,
										user: "0x1111111111111111111111111111111111111111",
									},
								],
							]
						: [],
				}
			: undefined,
		status: mocks.status,
		error: mocks.status === "error" ? new Error("TWAP transport details") : null,
		isStale: mocks.isStale,
	})),
}));

vi.mock("@/stores/use-order-entry-store", () => ({
	useOrderEntryActions: () => ({ setOrderType: mocks.setOrderType }),
}));

vi.mock("@/components/trade/mobile/use-mobile-terminal-tab", () => ({
	useMobileTerminalTab: () => ({ setActiveTab: mocks.setActiveTab }),
}));

import { MobileTwapTab } from "@/components/trade/mobile/mobile-twap-tab";
import { useSubscription } from "@/lib/hyperliquid";

describe("MobileTwapTab card", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		mocks.side = "B";
		mocks.hasActiveOrder = true;
		mocks.hasSnapshot = true;
		mocks.status = "active";
		mocks.isStale = false;
		mocks.feedback = null;
		mocks.hasMoreTwapFills = false;
		mocks.hasMoreTwapHistory = false;
		mocks.isTwapFillsRealtimeDegraded = false;
		mocks.isTwapHistoryRealtimeDegraded = false;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	function render() {
		act(() => {
			root.render(
				<I18nProvider i18n={i18n}>
					<MobileTwapTab scrollMode="page" />
				</I18nProvider>,
			);
		});
	}

	it.each([
		{ status: "active", hasSnapshot: false, isStale: false },
		{ status: "subscribing", hasSnapshot: true, isStale: false },
		{ status: "active", hasSnapshot: true, isStale: true },
		{ status: "error", hasSnapshot: false, isStale: false },
		{ status: "error", hasSnapshot: true, isStale: false },
	])("keeps missing or stale current TWAP snapshots quiet: %o", (state) => {
		Object.assign(mocks, state);
		mocks.hasActiveOrder = true;
		render();
		expect(container.querySelector('[data-slot="data-pending"]')).not.toBeNull();
		expect(container.textContent).not.toContain("No active TWAP orders.");
		expect(container.querySelector('[role="alert"]')).toBeNull();
		expect(container.textContent).not.toContain("TWAP transport details");
		expect(container.querySelector('button[aria-label="Terminate TWAP order"]')).toBeNull();
		expect(container.querySelector('button[aria-label="Switch to GOOGL market"]')).toBeNull();
		expect(mocks.cancelTwap).not.toHaveBeenCalled();
	});

	it("preserves requested cancellation feedback while passive TWAP data is pending", () => {
		mocks.status = "error";
		mocks.isStale = true;
		mocks.feedback = { tone: "error", message: "Cancellation was rejected." };
		render();
		expect(container.querySelector('[data-slot="data-pending"]')).not.toBeNull();
		expect(container.textContent).not.toContain("TWAP transport details");
		expect(container.querySelector('[role="alert"]')?.textContent).toBe("Cancellation was rejected.");
	});

	it("restores exact cancellation actions only after stale data becomes current", () => {
		mocks.isStale = true;
		mocks.status = "error";
		render();
		expect(container.querySelector('button[aria-label="Terminate TWAP order"]')).toBeNull();
		mocks.isStale = false;
		mocks.status = "active";
		render();
		const terminate = container.querySelector<HTMLButtonElement>('button[aria-label="Terminate TWAP order"]');
		expect(terminate?.disabled).toBe(false);
		act(() => terminate?.click());
		expect(mocks.cancelTwap).toHaveBeenCalledExactlyOnceWith("GOOGL", 42);
	});

	it("renders real TWAP progress metrics and the supported terminate action", () => {
		render();

		expect(useSubscription).toHaveBeenCalledWith(
			"twapStates",
			{ user: "0x1111111111111111111111111111111111111111", dex: "ALL_DEXS" },
			{ enabled: true },
		);
		expect(container.textContent).toContain("GOOGL");
		expect(container.textContent).toContain("Buy");
		expect(container.textContent).toContain("Remaining 18:24");
		expect(container.textContent).toContain("6.132 / 15.330 GOOGL");
		expect(container.textContent).toContain("Avg Price $374.88");
		expect(container.textContent).toContain("40%");
		expect(container.textContent).not.toContain("Suborder Frequency");
		const pause = container.querySelector<HTMLButtonElement>(
			'button[aria-label="Pause unavailable: Hyperliquid does not support pausing active TWAP orders."]',
		);
		expect(pause?.textContent).toBe("Pause");
		expect(pause?.disabled).toBe(true);
		expect(pause?.className).toContain("min-h-11");

		const progress = container.querySelector<HTMLElement>('[data-testid="mobile-twap-progress"]');
		expect(progress?.style.transform).toBe("scaleX(0.4)");
		expect(progress?.className).toContain("bg-market-close-success");
		expect(container.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("0.4");
		expect(
			container.querySelector<HTMLButtonElement>('button[aria-label="Switch to GOOGL market"]')?.className,
		).toContain("min-h-11");

		const terminate = container.querySelector<HTMLButtonElement>('button[aria-label="Terminate TWAP order"]');
		expect(terminate?.className).toContain("min-h-11");
		expect(terminate?.classList.contains("rounded-8")).toBe(true);
		expect(terminate?.className).toContain("disabled:text-fg-disabled");
		expect(terminate?.className).not.toContain("disabled:text-market-close-danger-disabled");
		act(() => terminate?.click());
		expect(mocks.cancelTwap).toHaveBeenCalledWith("GOOGL", 42);
	});

	it("switches the direction badge and progress color for sell TWAPs", () => {
		mocks.side = "A";
		render();

		expect(container.textContent).toContain("Sell");
		expect(container.querySelector('[data-testid="mobile-twap-progress"]')?.className).toContain(
			"bg-market-close-danger",
		);
	});

	it("keeps mobile TWAP creation unavailable from the empty state", () => {
		mocks.hasActiveOrder = false;
		render();

		const createButton = Array.from(container.querySelectorAll("button")).find(
			(button) => button.textContent === "Create TWAP",
		);
		expect(container.textContent).toContain("No active TWAP orders.");
		expect(createButton).toBeUndefined();
		expect(mocks.setOrderType).not.toHaveBeenCalled();
		expect(mocks.setActiveTab).not.toHaveBeenCalled();
	});

	it("renders touch-sized history tabs and the parent and fill history cards", () => {
		render();

		const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
		expect(tabs.map((tab) => tab.textContent)).toEqual(["Current", "History", "Fill History"]);
		expect(tabs.every((tab) => tab.className.includes("min-h-11"))).toBe(true);

		act(() => tabs[1]?.click());
		expect(container.textContent).toContain("Total Size");
		expect(container.textContent).toContain("15.330 GOOGL");
		expect(container.textContent).toContain("00:30:00");
		expect(container.textContent).toContain("Filled");

		const fillHistoryTab = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find(
			(tab) => tab.textContent === "Fill History",
		);
		act(() => fillHistoryTab?.click());
		expect(container.textContent).toContain("Trade Value");
		expect(container.textContent).toContain("1,875.00 USDH");
		expect(container.textContent).toContain("0.01000 USDC");
		expect(container.textContent).toContain("+1.25 USDC");
	});

	it("keeps history and touch-sized pagination without passive degradation notices", () => {
		mocks.hasMoreTwapHistory = true;
		mocks.isTwapHistoryRealtimeDegraded = true;
		render();

		const historyTab = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find(
			(tab) => tab.textContent === "History",
		);
		act(() => historyTab?.click());

		const retry = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
			(button) => button.textContent === "Retry",
		);
		const loadMore = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
			(button) => button.textContent === "Load more",
		);
		expect(container.querySelector("output")).toBeNull();
		expect(retry).toBeUndefined();
		expect(loadMore?.className).toContain("max-[1000px]:min-h-11");
		act(() => loadMore?.click());
		expect(mocks.retryTwapHistoryRealtime).not.toHaveBeenCalled();
		expect(mocks.loadMoreTwapHistory).toHaveBeenCalledTimes(1);
	});
});
