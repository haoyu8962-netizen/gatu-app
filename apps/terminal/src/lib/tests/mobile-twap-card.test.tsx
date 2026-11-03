/** @vitest-environment jsdom */

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import type { TwapHistoryResponse, UserFillsResponse } from "@nktkas/hyperliquid";
import { act, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MobileDataScrollMode } from "@/components/trade/mobile/mobile-positions-view";

const mocks = vi.hoisted(() => ({
	cancelTwap: vi.fn(),
	exportListeners: new Set<() => void>(),
	exportTwapFills: vi.fn(async () => undefined),
	hasActiveOrder: true,
	hasSnapshot: true,
	status: "active",
	isStale: false,
	feedback: null as { message: string; tone: "error" } | null,
	hasMoreTwapFills: false,
	hasMoreTwapHistory: false,
	isExportingTwapFills: false,
	isTwapFillsEmpty: false,
	isTwapFillsRealtimeDegraded: false,
	isTwapHistoryRealtimeDegraded: false,
	isWalletConnected: true,
	loadMoreTwapFills: vi.fn(),
	loadMoreTwapHistory: vi.fn(),
	navigateToMarket: vi.fn(),
	retryTwapFillsRealtime: vi.fn(),
	retryTwapHistoryRealtime: vi.fn(),
	setActiveTab: vi.fn(),
	setOrderType: vi.fn(),
	side: "B" as "A" | "B",
	twapFillsStatus: "ready" as "error" | "idle" | "loading" | "ready",
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
		fills: mocks.isTwapFillsEmpty ? [] : mocks.twapFills,
		hasMore: mocks.hasMoreTwapFills,
		isConnected: mocks.isWalletConnected,
		isRealtimeDegraded: mocks.isTwapFillsRealtimeDegraded,
		loadMore: mocks.loadMoreTwapFills,
		realtimeError: mocks.isTwapFillsRealtimeDegraded ? new Error("Fill stream unavailable") : undefined,
		retryRealtime: mocks.retryTwapFillsRealtime,
		status: mocks.twapFillsStatus,
	}),
}));

vi.mock("@/hooks/trade/use-twap-fill-history-csv", () => ({
	useTwapFillHistoryCsv: () => ({
		exportCsv: mocks.exportTwapFills,
		isExporting: useSyncExternalStore(
			(listener) => {
				mocks.exportListeners.add(listener);
				return () => mocks.exportListeners.delete(listener);
			},
			() => mocks.isExportingTwapFills,
		),
	}),
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () =>
		mocks.isWalletConnected
			? { address: "0x1111111111111111111111111111111111111111", isConnected: true }
			: { address: undefined, isConnected: false },
}));

vi.mock("@/lib/hyperliquid", () => ({
	useMarkets: () => ({
		getMarket: () => ({
			kind: "spot",
			shortName: "GOOGL",
			tokensInfo: [{ name: "GOOGL" }, { name: "USDH" }],
		}),
		getSzDecimals: () => 3,
		getTokenDisplayName: (name: string) => (name === "USDT0" ? "USDT" : name),
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
		mocks.isExportingTwapFills = false;
		mocks.isTwapFillsEmpty = false;
		mocks.isTwapFillsRealtimeDegraded = false;
		mocks.isTwapHistoryRealtimeDegraded = false;
		mocks.isWalletConnected = true;
		mocks.twapFillsStatus = "ready";
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	function render(scrollMode: MobileDataScrollMode = "page") {
		act(() => {
			root.render(
				<I18nProvider i18n={i18n}>
					<MobileTwapTab scrollMode={scrollMode} />
				</I18nProvider>,
			);
		});
	}

	function selectSubview(label: string) {
		const tab = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find(
			(candidate) => candidate.textContent === label,
		);
		expect(tab).toBeDefined();
		act(() => tab?.click());
	}

	function setExportingTwapFills(isExporting: boolean) {
		act(() => {
			mocks.isExportingTwapFills = isExporting;
			for (const listener of mocks.exportListeners) listener();
		});
	}

	function getTwapFillFooter() {
		return container.querySelector<HTMLElement>('[data-testid="mobile-twap-fill-history-footer"]');
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
		expect(tabs.every((tab) => tab.className.includes("before:h-11"))).toBe(true);

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

	it("shows TWAP history prices at the market's protocol decimals, as the other history tables do", () => {
		const history = mocks.twapHistory;
		const fills = mocks.twapFills;
		mocks.twapHistory = history.map((entry) => ({
			...entry,
			state: { ...entry.state, executedNtl: "6132.123" },
		})) as TwapHistoryResponse;
		mocks.twapFills = fills.map((fill) => ({ ...fill, px: "374.5" })) as UserFillsResponse;
		try {
			render();
			selectSubview("History");
			expect(container.textContent).toContain("$1,000.02006");
			selectSubview("Fill History");
			expect(container.textContent).toContain("$374.5");
			expect(container.textContent).not.toContain("$374.50");
		} finally {
			mocks.twapHistory = history;
			mocks.twapFills = fills;
		}
	});

	it("shows a slice fill's fee token by its display name", () => {
		const fills = mocks.twapFills;
		mocks.twapFills = fills.map((fill) => ({ ...fill, feeToken: "USDT0" })) as UserFillsResponse;
		try {
			render();
			const fillHistoryTab = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find(
				(tab) => tab.textContent === "Fill History",
			);
			act(() => fillHistoryTab?.click());

			expect(container.textContent).toContain("0.01000 USDT");
			expect(container.textContent).toContain("+1.25 USDT");
			expect(container.textContent).not.toContain("USDT0");
		} finally {
			mocks.twapFills = fills;
		}
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

	it.each([
		{ status: "idle", empty: false, degraded: false },
		{ status: "loading", empty: false, degraded: false },
		{ status: "error", empty: false, degraded: false },
		{ status: "ready", empty: true, degraded: true },
	] as const)(
		"keeps the TWAP fill export next to a quiet $status placeholder (degraded: $degraded)",
		({ status, empty, degraded }) => {
			mocks.twapFillsStatus = status;
			mocks.isTwapFillsEmpty = empty;
			mocks.isTwapFillsRealtimeDegraded = degraded;
			render();
			selectSubview("Fill History");

			const pending = container.querySelector('[data-slot="data-pending"]');
			expect(pending?.getAttribute("aria-busy")).toBe(String(status === "idle" || status === "loading"));
			expect(container.textContent).not.toMatch(/Loading|Failed|No TWAP fills found|Exporting/);
			const footer = getTwapFillFooter();
			expect(pending?.compareDocumentPosition(footer as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
			expect(footer?.querySelector("button")?.disabled).toBe(false);
		},
	);

	it("keeps the TWAP fill export below a confirmed empty history", () => {
		mocks.isTwapFillsEmpty = true;
		render();
		selectSubview("Fill History");

		expect(container.textContent).toContain("No TWAP fills found.");
		expect(getTwapFillFooter()?.querySelector("button")?.textContent).toBe("Export CSV");
	});

	it.each(["page", "contained"] as const)("places the TWAP fill export after the %s-scrolled cards", (scrollMode) => {
		mocks.hasMoreTwapFills = true;
		render(scrollMode);
		selectSubview("Fill History");

		const list = container.querySelector<HTMLElement>('[data-testid="mobile-twap-fill-history-list"]');
		const footer = getTwapFillFooter();
		expect(list?.querySelector("article")).not.toBeNull();
		expect(list?.textContent).toContain("Load more");
		expect(list?.nextElementSibling).toBe(footer);
		expect(footer?.parentElement?.lastElementChild).toBe(footer);
		expect(footer?.parentElement?.className.includes("overflow-y-auto")).toBe(scrollMode === "contained");
		expect(footer?.className).toContain("h-[38px]");
		expect(footer?.className).toContain("px-3.5");
		const button = footer?.querySelector<HTMLButtonElement>("button");
		expect(button?.className).toContain("h-[38px]");
		expect(button?.className).toContain("min-h-0");
		expect(button?.className).toContain("after:h-11");
		expect(button?.className).toContain("active:text-market-close-fg");

		act(() => button?.click());
		expect(mocks.exportTwapFills).toHaveBeenCalledTimes(1);
	});

	it("disables the TWAP fill export only while it runs and keeps its label", () => {
		render();
		selectSubview("Fill History");

		setExportingTwapFills(true);
		const button = getTwapFillFooter()?.querySelector<HTMLButtonElement>("button");
		expect(button?.disabled).toBe(true);
		expect(button?.textContent).toBe("Export CSV");
		act(() => button?.click());
		expect(mocks.exportTwapFills).not.toHaveBeenCalled();

		setExportingTwapFills(false);
		expect(getTwapFillFooter()?.querySelector<HTMLButtonElement>("button")?.disabled).toBe(false);
	});

	it("keeps the TWAP fill export off the other subviews and off disconnected accounts", () => {
		render();
		expect(getTwapFillFooter()).toBeNull();
		selectSubview("History");
		expect(getTwapFillFooter()).toBeNull();
		selectSubview("Fill History");
		expect(getTwapFillFooter()).not.toBeNull();

		act(() => root.unmount());
		root = createRoot(container);
		mocks.isWalletConnected = false;
		render();
		selectSubview("Fill History");
		expect(getTwapFillFooter()).toBeNull();
		expect(container.querySelector("button[disabled]")).toBeNull();
		expect(container.textContent).not.toContain("Export CSV");
	});
});
