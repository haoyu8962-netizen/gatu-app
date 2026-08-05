/** @vitest-environment jsdom */

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MOBILE_POSITIONS_TABS } from "@/config/trade";

const storeState = vi.hoisted(() => ({ activeTab: "positions", isConnected: true, snapshotsReady: true }));
const setPositionsActiveTab = vi.hoisted(() => vi.fn<(tab: string) => void>());

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({ address: storeState.isConnected ? "0x1234" : null, isConnected: storeState.isConnected }),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useSubscription: (type: string) => ({
		data: type === "twapStates" ? { states: [] } : { orders: [] },
		isStale: false,
		status: storeState.snapshotsReady ? "active" : "subscribing",
	}),
	useUserPositions: () => ({ positions: [], isLoading: !storeState.snapshotsReady, hasError: false }),
}));

vi.mock("@/hooks/trade/use-account-balances", () => ({
	useDefaultDexBalances: () => ({
		perpSummary: { accountValue: "0" },
		spotBalances: [],
		hasAllDexsSnapshot: storeState.snapshotsReady,
		hasSpotStateSnapshot: storeState.snapshotsReady,
		hasError: false,
		isLoading: !storeState.snapshotsReady,
	}),
}));

vi.mock("@/stores/use-global-settings-store", () => ({
	useGlobalSettingsActions: () => ({ setPositionsActiveTab }),
	usePositionsActiveTab: () => storeState.activeTab,
}));

vi.mock("@/components/trade/mobile/mobile-bottom-nav", () => ({
	MobileBottomNavSpacer: () => null,
}));

vi.mock("@/components/trade/mobile/mobile-funding-tab", () => ({
	MobileFundingTab: () => <div data-tab-content="funding" />,
}));

vi.mock("@/components/trade/mobile/mobile-history-tab", () => ({
	MobileHistoryTab: () => <div data-tab-content="history" />,
}));

vi.mock("@/components/trade/mobile/mobile-orders-history-tab", () => ({
	MobileOrdersHistoryTab: () => <div data-tab-content="orders-history" />,
}));

vi.mock("@/components/trade/mobile/mobile-orders-tab", () => ({
	MobileOrdersTab: () => <div data-tab-content="orders" />,
}));

vi.mock("@/components/trade/mobile/mobile-positions-tab", () => ({
	MobilePositionsTab: () => <div data-tab-content="positions" />,
}));

vi.mock("@/components/trade/mobile/mobile-twap-tab", () => ({
	MobileTwapTab: () => <div data-tab-content="twap" />,
}));

import { MobilePositionsView } from "@/components/trade/mobile/mobile-positions-view";

describe("MobilePositionsView tabs", () => {
	let container: HTMLDivElement;
	let root: Root;
	let scrollIntoView: ReturnType<typeof vi.fn>;
	let scrollByDescriptor: PropertyDescriptor | undefined;
	let scrollIntoViewDescriptor: PropertyDescriptor | undefined;

	beforeEach(() => {
		storeState.activeTab = "positions";
		storeState.isConnected = true;
		storeState.snapshotsReady = true;
		setPositionsActiveTab.mockReset();
		setPositionsActiveTab.mockImplementation((tab) => {
			storeState.activeTab = tab;
		});
		scrollByDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollBy");
		scrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
		scrollIntoView = vi.fn();
		Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
			configurable: true,
			value: scrollIntoView,
		});
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		if (scrollByDescriptor) Object.defineProperty(HTMLElement.prototype, "scrollBy", scrollByDescriptor);
		else Reflect.deleteProperty(HTMLElement.prototype, "scrollBy");
		if (scrollIntoViewDescriptor) {
			Object.defineProperty(HTMLElement.prototype, "scrollIntoView", scrollIntoViewDescriptor);
		} else {
			Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
		}
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	function render(balancesContent?: ReactNode) {
		act(() => {
			root.render(
				<I18nProvider i18n={i18n}>
					<MobilePositionsView includeBottomNavSpacer={false} balancesContent={balancesContent} />
				</I18nProvider>,
			);
		});
	}

	it("uses the same canonical seven-tab order as desktop and defaults to positions", () => {
		expect(MOBILE_POSITIONS_TABS.map((tab) => tab.value)).toEqual([
			"balances",
			"positions",
			"orders",
			"twap",
			"history",
			"funding",
			"orders-history",
		]);

		render(<div data-testid="injected-balances" />);

		expect(container.firstElementChild?.className).toContain("font-market-close");
		const tabs = Array.from(container.querySelectorAll<HTMLElement>('[role="tab"]'));
		expect(tabs).toHaveLength(7);
		expect(tabs.map((tab) => tab.textContent)).toEqual([
			"Balances(0)",
			"Positions(0)",
			"Orders(0)",
			"TWAP(0)",
			"Trade History",
			"Funding History",
			"Order History",
		]);
		expect(tabs.find((tab) => tab.getAttribute("aria-selected") === "true")?.textContent).toBe("Positions(0)");

		storeState.activeTab = "balances";
		render(<div data-testid="injected-balances" />);
		expect(container.querySelector('[data-testid="injected-balances"]')).not.toBeNull();
	});

	it("shows zero counts only after each live snapshot is ready", () => {
		storeState.snapshotsReady = false;
		render();

		const loadingLabels = Array.from(container.querySelectorAll<HTMLElement>('[role="tab"]')).map(
			(tab) => tab.textContent,
		);
		expect(loadingLabels.slice(0, 4)).toEqual(["Balances", "Positions", "Orders", "TWAP"]);

		storeState.snapshotsReady = true;
		render();
		const readyLabels = Array.from(container.querySelectorAll<HTMLElement>('[role="tab"]')).map(
			(tab) => tab.textContent,
		);
		expect(readyLabels.slice(0, 4)).toEqual(["Balances(0)", "Positions(0)", "Orders(0)", "TWAP(0)"]);
	});

	it("keeps the horizontal scroller hidden and renders a non-interactive 28px edge fade", () => {
		render();

		const scroller = container.querySelector<HTMLElement>('[data-testid="mobile-account-tabs-scroll"]');
		expect(scroller?.className).toContain("overflow-x-auto");
		expect(scroller?.className).toContain("[scrollbar-width:none]");
		expect(scroller?.className).toContain("[&::-webkit-scrollbar]:hidden");
		expect(scroller?.querySelector('[role="tablist"]')?.className).toContain("h-[47px]");

		const fade = container.querySelector<HTMLElement>('[data-testid="mobile-account-tabs-fade"]');
		expect(fade?.className).toContain("w-7");
		expect(fade?.className).toContain("pointer-events-none");
		expect(fade?.className).toContain("from-transparent");
		expect(fade?.className).toContain("to-modal");
		expect(fade?.getAttribute("aria-hidden")).toBe("true");
	});

	it("gives every tab a minimum 44px touch target", () => {
		render();

		const tabs = Array.from(container.querySelectorAll<HTMLElement>('[role="tab"]'));
		expect(tabs).toHaveLength(7);
		for (const tab of tabs) {
			expect(tab.className).toContain("min-h-11");
			expect(tab.className).toContain("text-market-close-subtle");
			expect(tab.className).toContain("data-active:text-market-close-fg");
		}
	});

	it("uses the active tab's wallet prompt while disconnected", () => {
		storeState.isConnected = false;
		storeState.activeTab = "balances";
		render();
		expect(container.textContent).toContain("Connect your wallet to view balances.");
		expect(container.textContent).not.toContain("Connect your wallet to view positions.");

		storeState.activeTab = "orders";
		render();
		expect(container.textContent).toContain("Connect your wallet to view open orders.");
	});

	it("keeps a restored history tab visible without touching the page scroll axis", () => {
		storeState.activeTab = "orders-history";
		const scrollBy = vi.fn();
		Object.defineProperty(HTMLElement.prototype, "scrollBy", {
			configurable: true,
			value: scrollBy,
		});
		const getBoundingClientRect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect");
		getBoundingClientRect.mockImplementation(function (this: HTMLElement) {
			if (this.dataset.testid === "mobile-account-tabs-scroll") {
				return { bottom: 47, height: 47, left: 0, right: 320, top: 0, width: 320, x: 0, y: 0, toJSON() {} };
			}
			if (this.dataset.mobileAccountTab === "orders-history") {
				return {
					bottom: 44,
					height: 44,
					left: 360,
					right: 460,
					top: 0,
					width: 100,
					x: 360,
					y: 0,
					toJSON() {},
				};
			}
			return { bottom: 0, height: 0, left: 0, right: 0, top: 0, width: 0, x: 0, y: 0, toJSON() {} };
		});
		render();

		const activeTab = container.querySelector<HTMLElement>('[data-mobile-account-tab="orders-history"]');
		expect(activeTab?.getAttribute("aria-selected")).toBe("true");
		expect(scrollBy).toHaveBeenCalledWith({ behavior: "auto", left: 168, top: 0 });
		expect(scrollIntoView).not.toHaveBeenCalled();
	});

	it("switches panels immediately and persists only the final rapid tab selection", () => {
		vi.useFakeTimers();
		render();

		const historyTab = container.querySelector<HTMLButtonElement>('[data-mobile-account-tab="history"]');
		const fundingTab = container.querySelector<HTMLButtonElement>('[data-mobile-account-tab="funding"]');
		act(() => historyTab?.click());
		expect(historyTab?.getAttribute("aria-selected")).toBe("true");
		expect(container.querySelector('[data-tab-content="history"]')).not.toBeNull();
		expect(container.querySelector('[data-tab-content="positions"]')).toBeNull();
		expect(setPositionsActiveTab).not.toHaveBeenCalled();

		act(() => fundingTab?.click());
		expect(fundingTab?.getAttribute("aria-selected")).toBe("true");
		expect(container.querySelector('[data-tab-content="funding"]')).not.toBeNull();
		expect(container.querySelector('[data-tab-content="history"]')).toBeNull();

		act(() => vi.runAllTimers());
		expect(setPositionsActiveTab).toHaveBeenCalledOnce();
		expect(setPositionsActiveTab).toHaveBeenCalledWith("funding");
		expect(fundingTab?.getAttribute("aria-selected")).toBe("true");
	});

	it("flushes an unpersisted tab preference when the page is hidden", () => {
		vi.useFakeTimers();
		render();

		const historyTab = container.querySelector<HTMLButtonElement>('[data-mobile-account-tab="history"]');
		act(() => historyTab?.click());
		expect(setPositionsActiveTab).not.toHaveBeenCalled();

		act(() => window.dispatchEvent(new Event("pagehide")));
		expect(setPositionsActiveTab).toHaveBeenCalledOnce();
		expect(setPositionsActiveTab).toHaveBeenCalledWith("history");
		act(() => vi.runAllTimers());
		expect(setPositionsActiveTab).toHaveBeenCalledOnce();
	});
});
