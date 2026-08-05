/** @vitest-environment jsdom */

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
	activeTab: "positions",
	openDepositModal: vi.fn(),
	setPositionsActiveTab: vi.fn(),
}));

const accountBalances = {
	accountAbstraction: "disabled" as const,
	allDexClearinghouseStates: [],
	crossMaintenanceMarginUsed: "2",
	marginSummary: { accountValue: "100", totalNtlPos: "0", totalMarginUsed: "0" },
	perpPositions: [],
	perpSummary: { accountValue: "100" },
	spotBalances: [{ total: "2" }],
	spotAvailableAfterMaintenance: [],
	withdrawable: "100",
	hasAllDexsSnapshot: true,
	hasSpotStateSnapshot: true,
	hasError: false,
};

vi.mock("@/hooks/trade/use-account-balances", () => ({
	useDefaultDexBalances: () => accountBalances,
	useSelectedDexBalances: () => accountBalances,
}));

vi.mock("@/hooks/trade/use-spot-token-usd-prices", () => ({
	useSpotTokenUsdPrices: () => null,
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({ address: "0x1234", isConnected: true }),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useMarkets: () => ({
		builderPerp: [],
		getMarket: () => ({ shortName: "GOOGL" }),
		getToken: () => ({ index: 0 }),
	}),
	useSelectedMarketInfo: () => ({ data: { name: "xyz:GOOGL", kind: "builderPerp", dex: "xyz" } }),
	useSubscription: (name: string) =>
		name === "openOrders"
			? { data: { orders: [{ oid: 1 }, { oid: 2 }] }, status: "active", isStale: false }
			: { data: { states: [[45, {}]] }, status: "active", isStale: false },
	useUserPositions: () => ({ positions: [{ coin: "xyz:GOOGL", dex: "xyz" }], isLoading: false, hasError: false }),
}));

vi.mock("@/lib/lazy", () => ({
	createLazyComponent: (_loader: unknown, name: string) => () => <div data-lazy-component={name} />,
}));

vi.mock("@/lib/performance/render-profile", () => ({
	useRenderCommitTrack: () => undefined,
}));

vi.mock("@/stores/use-global-modal-store", () => ({
	useDepositModalActions: () => ({ open: testState.openDepositModal }),
}));

vi.mock("@/stores/use-global-settings-store", () => ({
	useGlobalSettingsActions: () => ({ setPositionsActiveTab: testState.setPositionsActiveTab }),
	usePositionsActiveTab: () => testState.activeTab,
}));

import { PositionFilterToolbar } from "@/components/trade/positions/position-filter-toolbar";
import { PositionsPanel } from "@/components/trade/positions/positions-panel";

describe("desktop positions panel shell", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		testState.activeTab = "positions";
		testState.openDepositModal.mockReset();
		testState.setPositionsActiveTab.mockReset();
		i18n.load("en", {});
		i18n.activate("en");
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	function renderNode(node: ReactNode) {
		act(() => {
			root.render(<I18nProvider i18n={i18n}>{node}</I18nProvider>);
		});
	}

	function render() {
		renderNode(<PositionsPanel />);
	}

	it("keeps the canonical seven tabs and their live counts", () => {
		render();

		const tabs = Array.from(container.querySelectorAll<HTMLElement>('[role="tab"]'));
		expect(tabs.map((tab) => tab.textContent)).toEqual([
			"Balances(2)",
			"Positions(1)",
			"Open Orders(2)",
			"TWAP(1)",
			"Trade History",
			"Funding History",
			"Order History",
		]);
		expect(tabs.find((tab) => tab.getAttribute("aria-selected") === "true")?.textContent).toBe("Positions(1)");
	});

	it("matches the 1a tab rhythm and wires the real funds actions beside the position filter", () => {
		render();

		const header = container.querySelector<HTMLElement>('[data-testid="positions-toolbar-header"]');
		expect(header?.className).toContain("h-[45px]");
		expect(header?.className).toContain("px-5");
		expect(header?.className).toContain("border-market-close-stroke-card");

		const tabList = container.querySelector<HTMLElement>('[role="tablist"]');
		expect(tabList?.className).toContain("gap-0.5");
		const tabs = Array.from(container.querySelectorAll<HTMLElement>('[role="tab"]'));
		for (const tab of tabs) {
			expect(tab.className).toContain("text-[13px]");
			expect(tab.className).toContain("px-3");
			expect(tab.className).toContain("duration-[120ms]");
			expect(tab.className).toContain("data-active:font-bold");
		}

		const indicator = Array.from(tabList?.children ?? []).find((element) =>
			element.className.includes("bg-market-close-fg"),
		) as HTMLElement | undefined;
		expect(indicator?.className).toContain("h-0.5");
		expect(indicator?.className).toContain("duration-[120ms]");
		expect(indicator?.className).toContain("ease-linear");

		const filterToolbar = container.querySelector<HTMLElement>('[data-testid="position-filter-toolbar"]');
		expect(filterToolbar?.className).toContain("gap-2");
		expect(header?.lastElementChild?.lastElementChild).toBe(filterToolbar);
		const depositButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
			(button) => button.textContent === "Deposit",
		);
		const withdrawButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
			(button) => button.textContent === "Withdraw",
		);
		expect(depositButton?.className).toContain("h-[25px]");
		expect(depositButton?.className).toContain("bg-market-close-control");
		expect(withdrawButton?.className).toContain("border-market-close-stroke-input");
		act(() => depositButton?.click());
		act(() => withdrawButton?.click());
		expect(testState.openDepositModal).toHaveBeenNthCalledWith(1, "deposit");
		expect(testState.openDepositModal).toHaveBeenNthCalledWith(2, "withdraw");
		const directionFilter = container.querySelector<HTMLButtonElement>(
			'button[aria-label^="Filter positions by direction:"]',
		);
		const marketFilter = container.querySelector<HTMLButtonElement>(
			'button[aria-label^="Filter positions by market:"]',
		);
		expect(directionFilter).toBeNull();
		expect(marketFilter?.textContent).toContain("Asset: All");
		for (const filter of [marketFilter]) {
			expect(filter?.className).toContain("h-[27px]");
			expect(filter?.className).toContain("rounded-[7px]");
			expect(filter?.className).toContain("border-market-close-stroke-card");
		}
	});

	it("does not apply the desktop chip labels or dimensions to the mobile filter", () => {
		renderNode(
			<PositionFilterToolbar
				direction="all"
				margin="all"
				market={{ type: "all" }}
				marketOptions={[]}
				onDirectionChange={vi.fn()}
				onMarginChange={vi.fn()}
				onMarketChange={vi.fn()}
				mobile
			/>,
		);

		const directionFilter = container.querySelector<HTMLButtonElement>(
			'button[aria-label^="Filter positions by direction:"]',
		);
		const marginFilter = container.querySelector<HTMLButtonElement>(
			'button[aria-label^="Filter positions by margin mode:"]',
		);
		expect(directionFilter?.textContent).toContain("Direction");
		expect(directionFilter?.textContent).not.toContain("Direction: All");
		expect(marginFilter?.textContent).toContain("Margin");
		for (const filter of [directionFilter, marginFilter]) {
			expect(filter?.className).toContain("py-1");
			expect(filter?.className).toContain("after:h-11");
			expect(filter?.className).not.toContain("h-[27px]");
		}
	});
});
