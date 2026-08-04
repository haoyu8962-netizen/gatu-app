/** @vitest-environment jsdom */

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MOBILE_POSITIONS_TABS } from "@/config/trade";

const storeState = vi.hoisted(() => ({ activeTab: "positions", snapshotsReady: true }));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({ address: "0x1234", isConnected: true }),
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
	useGlobalSettingsActions: () => ({ setPositionsActiveTab: vi.fn() }),
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

	beforeEach(() => {
		storeState.activeTab = "positions";
		storeState.snapshotsReady = true;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
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

		const tabs = Array.from(container.querySelectorAll<HTMLElement>('[role="tab"]'));
		expect(tabs).toHaveLength(7);
		expect(tabs.map((tab) => tab.textContent)).toEqual([
			"Balances(0)",
			"Positions(0)",
			"Open Orders(0)",
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
		expect(loadingLabels.slice(0, 4)).toEqual(["Balances", "Positions", "Open Orders", "TWAP"]);

		storeState.snapshotsReady = true;
		render();
		const readyLabels = Array.from(container.querySelectorAll<HTMLElement>('[role="tab"]')).map(
			(tab) => tab.textContent,
		);
		expect(readyLabels.slice(0, 4)).toEqual(["Balances(0)", "Positions(0)", "Open Orders(0)", "TWAP(0)"]);
	});

	it("keeps the horizontal scroller hidden and renders a non-interactive 28px edge fade", () => {
		render();

		const scroller = container.querySelector<HTMLElement>('[data-testid="mobile-account-tabs-scroll"]');
		expect(scroller?.className).toContain("overflow-x-auto");
		expect(scroller?.className).toContain("[scrollbar-width:none]");
		expect(scroller?.className).toContain("[&::-webkit-scrollbar]:hidden");

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
		for (const tab of tabs) expect(tab.className).toContain("min-h-11");
	});
});
