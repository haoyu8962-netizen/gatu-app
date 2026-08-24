/** @vitest-environment jsdom */

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
	activeTab: "positions",
	depositAvailable: true,
	depositUnavailableReason: null as string | null,
	geoStatus: "allowed" as "allowed" | "restricted" | "unresolved",
	openDepositModal: vi.fn(),
	setPositionsActiveTab: vi.fn(),
	snapshotsReady: true,
}));

const accountBalances = {
	accountAbstraction: "disabled" as const,
	allDexClearinghouseStates: [],
	crossMaintenanceMarginUsed: "2",
	dex: "",
	marginSummary: { accountValue: "100", totalNtlPos: "0", totalMarginUsed: "0", totalRawUsd: "100" },
	perpPositions: [],
	perpSummary: { accountValue: "100", totalMarginUsed: "0", totalNtlPos: "0", totalRawUsd: "100" },
	spotBalances: [{ total: "2" }],
	spotAvailableAfterMaintenance: [],
	withdrawable: "100",
	hasAllDexsSnapshot: true,
	hasSpotStateSnapshot: true,
	hasError: false,
	isDataStale: false,
	isLoading: false,
	isPerpStateStale: false,
	isSpotStateStale: false,
	perpStateStatus: "success",
	perpStateReceivedAt: Date.now(),
	spotStateStatus: "success",
	spotStateReceivedAt: Date.now(),
	portfolioMarginRatio: null,
};

vi.mock("@/hooks/trade/use-account-balances", () => ({
	isSupportedAccountAbstraction: (value: unknown) =>
		value === "disabled" || value === "unifiedAccount" || value === "portfolioMargin",
	useDefaultDexBalances: () => ({
		...accountBalances,
		hasAllDexsSnapshot: testState.snapshotsReady,
		hasSpotStateSnapshot: testState.snapshotsReady,
		isLoading: !testState.snapshotsReady,
		perpStateStatus: testState.snapshotsReady ? "success" : "pending",
		spotStateStatus: testState.snapshotsReady ? "success" : "pending",
	}),
	useSelectedDexBalances: () => ({
		...accountBalances,
		hasAllDexsSnapshot: testState.snapshotsReady,
		hasSpotStateSnapshot: testState.snapshotsReady,
		isLoading: !testState.snapshotsReady,
		perpStateStatus: testState.snapshotsReady ? "success" : "pending",
		spotStateStatus: testState.snapshotsReady ? "success" : "pending",
	}),
}));

vi.mock("@/hooks/trade/use-spot-token-usd-prices", () => ({
	useSpotTokenUsdPriceState: () => ({ prices: {}, status: "success" }),
	useSpotTokenUsdPrices: () => null,
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({ address: "0x1234", hasWalletAccess: true, isConnected: true }),
}));

vi.mock("@/hooks/trade/use-deposit-availability", () => ({
	useDepositAvailability: () => ({
		available: testState.depositAvailable && testState.geoStatus === "allowed",
		unavailableLabel: "Deposit unavailable",
		unavailableReason:
			testState.geoStatus === "allowed"
				? testState.depositUnavailableReason
				: "Funds actions are unavailable in this region.",
	}),
}));

vi.mock("@/hooks/use-geo-restriction", () => ({
	useGeoRestriction: () => ({
		actionsBlocked: testState.geoStatus !== "allowed",
		country: testState.geoStatus === "unresolved" ? null : "GB",
		isError: false,
		isResolved: testState.geoStatus !== "unresolved",
		proxy: false,
		retry: vi.fn().mockResolvedValue({
			data: { country: "GB", proxy: false, tradeRestricted: testState.geoStatus === "restricted" },
			isError: false,
		}),
		tradeRestricted: testState.geoStatus === "restricted",
	}),
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
			? {
					data: { orders: [{ oid: 1 }, { oid: 2 }] },
					status: testState.snapshotsReady ? "active" : "subscribing",
					isStale: false,
				}
			: {
					data: { states: [[45, {}]] },
					status: testState.snapshotsReady ? "active" : "subscribing",
					isStale: false,
				},
	useUserPositions: () => ({
		positions: [{ coin: "xyz:GOOGL", dex: "xyz" }],
		isLoading: !testState.snapshotsReady,
		hasError: false,
	}),
}));

vi.mock("@/lib/lazy", () => ({
	createLazyComponent:
		(_loader: unknown, name: string) =>
		({ toolbarTarget }: { toolbarTarget?: HTMLElement | null }) => (
			<>
				{toolbarTarget
					? createPortal(<div data-mock-toolbar={name} data-testid={`${name}-header-actions`} />, toolbarTarget)
					: null}
				<div data-lazy-component={name} />
			</>
		),
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
		testState.depositAvailable = true;
		testState.depositUnavailableReason = null;
		testState.geoStatus = "allowed";
		testState.openDepositModal.mockReset();
		testState.setPositionsActiveTab.mockReset();
		testState.snapshotsReady = true;
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

	function render(includeTransfers = false) {
		renderNode(<PositionsPanel includeTransfers={includeTransfers} />);
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
			"Funding Payments",
			"Order History",
		]);
		expect(tabs.find((tab) => tab.getAttribute("aria-selected") === "true")?.textContent).toBe("Positions(1)");
		expect(container.querySelectorAll("[data-position-tab-count]")).toHaveLength(4);
	});

	it("reserves count geometry while connected snapshots are loading without displaying stale values", () => {
		testState.snapshotsReady = false;
		render();

		const slots = Array.from(container.querySelectorAll<HTMLElement>("[data-position-tab-count]"));
		expect(slots).toHaveLength(4);
		for (const slot of slots) {
			expect(slot.className).toContain("min-w-[3ch]");
			expect(slot.textContent).toBe("");
		}
		expect(
			Array.from(container.querySelectorAll<HTMLElement>('[role="tab"]'), (tab) => tab.textContent).slice(0, 4),
		).toEqual(["Balances", "Positions", "Open Orders", "TWAP"]);
	});

	it("matches the 1a tab rhythm and keeps the position filter without funds actions", () => {
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
			expect(tab.className).toContain("font-medium");
			expect(tab.className).not.toContain("data-active:font-bold");
		}

		const indicator = Array.from(tabList?.children ?? []).find((element) =>
			element.className.includes("bg-market-close-fg"),
		) as HTMLElement | undefined;
		expect(indicator?.className).toContain("h-0.5");
		expect(indicator?.className).toContain("transition-[left]");
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
		expect(depositButton).toBeUndefined();
		expect(withdrawButton).toBeUndefined();
		expect(testState.openDepositModal).not.toHaveBeenCalled();
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

	it("reveals the selected tab without changing the page scroll axis", () => {
		testState.activeTab = "orders-history";
		const scrollByDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollBy");
		const scrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
		const scrollBy = vi.fn();
		const scrollIntoView = vi.fn();
		Object.defineProperty(HTMLElement.prototype, "scrollBy", { configurable: true, value: scrollBy });
		Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scrollIntoView });
		const getBoundingClientRect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect");
		getBoundingClientRect.mockImplementation(function (this: HTMLElement) {
			if (this.dataset.testid === "positions-tabs-scroll") {
				return { bottom: 45, height: 45, left: 0, right: 320, top: 0, width: 320, x: 0, y: 0, toJSON() {} };
			}
			if (this.dataset.positionsTab === "orders-history") {
				return {
					bottom: 45,
					height: 45,
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

		try {
			render();
			expect(scrollBy).toHaveBeenCalledWith({ behavior: "auto", left: 140, top: 0 });
			expect(scrollIntoView).not.toHaveBeenCalled();
		} finally {
			getBoundingClientRect.mockRestore();
			if (scrollByDescriptor) Object.defineProperty(HTMLElement.prototype, "scrollBy", scrollByDescriptor);
			else Reflect.deleteProperty(HTMLElement.prototype, "scrollBy");
			if (scrollIntoViewDescriptor) {
				Object.defineProperty(HTMLElement.prototype, "scrollIntoView", scrollIntoViewDescriptor);
			} else {
				Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
			}
		}
	});

	it.each(["balances", "positions", "twap", "history"])("does not show funds actions on the %s tab", (activeTab) => {
		testState.activeTab = activeTab;
		render();

		const actions = container.querySelector<HTMLElement>('[data-testid="positions-header-actions"]');
		expect(Array.from(actions?.querySelectorAll("button") ?? [], (button) => button.textContent)).not.toContain(
			"Deposit",
		);
		expect(Array.from(actions?.querySelectorAll("button") ?? [], (button) => button.textContent)).not.toContain(
			"Withdraw",
		);
		if (activeTab !== "balances" && activeTab !== "positions") expect(actions?.className).not.toContain("pl-3");
	});

	it("mounts the balance settings in the tab header", () => {
		testState.activeTab = "balances";
		render();

		const actions = container.querySelector<HTMLElement>('[data-testid="positions-header-actions"]');
		expect(actions?.className).toContain("pl-3");
		expect(actions?.querySelector('[data-testid="BalancesTab-header-actions"]')).not.toBeNull();
	});

	it("keeps funds actions on the account transfers tab", () => {
		testState.activeTab = "transfers";
		render(true);

		const actions = container.querySelector<HTMLElement>('[data-testid="positions-header-actions"]');
		const depositButton = Array.from(actions?.querySelectorAll<HTMLButtonElement>("button") ?? []).find(
			(button) => button.textContent === "Deposit",
		);
		const withdrawButton = Array.from(actions?.querySelectorAll<HTMLButtonElement>("button") ?? []).find(
			(button) => button.textContent === "Withdraw",
		);
		expect(depositButton).toBeDefined();
		expect(withdrawButton).toBeDefined();
		act(() => depositButton?.click());
		act(() => withdrawButton?.click());
		expect(testState.openDepositModal).toHaveBeenNthCalledWith(1, "deposit");
		expect(testState.openDepositModal).toHaveBeenNthCalledWith(2, "withdraw");
	});

	it.each(["restricted", "unresolved"] as const)(
		"keeps the transfers-tab withdrawal inert when geo is %s",
		(geoStatus) => {
			testState.activeTab = "transfers";
			testState.geoStatus = geoStatus;
			render(true);

			const withdrawButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
				(button) => button.textContent === "Withdraw",
			);
			expect(withdrawButton?.getAttribute("aria-disabled")).toBe("true");
			act(() => withdrawButton?.click());
			expect(testState.openDepositModal).not.toHaveBeenCalledWith("withdraw");
		},
	);

	it("keeps the transfers Deposit entry inert with an explicit reason when its path is unavailable", () => {
		testState.activeTab = "transfers";
		testState.depositAvailable = false;
		testState.depositUnavailableReason = "Deposits from external wallets are not enabled on Mainnet.";
		render(true);

		const actions = container.querySelector<HTMLElement>('[data-testid="positions-header-actions"]');
		const depositButton = Array.from(actions?.querySelectorAll<HTMLButtonElement>("button") ?? []).find(
			(button) => button.textContent === "Deposit",
		);
		expect(depositButton?.disabled).toBe(true);
		expect(depositButton?.getAttribute("aria-label")).toBe("Deposit unavailable");
		expect(depositButton?.title).toBe("Deposits from external wallets are not enabled on Mainnet.");
		act(() => depositButton?.click());
		expect(testState.openDepositModal).not.toHaveBeenCalled();
	});

	it.each([
		["orders", "OrdersTab"],
		["funding", "FundingTab"],
		["orders-history", "OrdersHistoryTab"],
	])("replaces the funds actions with the %s tab toolbar", (activeTab, componentName) => {
		testState.activeTab = activeTab;
		render();

		const actions = container.querySelector<HTMLElement>('[data-testid="positions-header-actions"]');
		expect(actions).not.toBeNull();
		expect(actions?.querySelector(`[data-mock-toolbar="${componentName}"]`)).not.toBeNull();
		expect(Array.from(actions?.querySelectorAll("button") ?? [], (button) => button.textContent)).not.toContain(
			"Deposit",
		);
		expect(Array.from(actions?.querySelectorAll("button") ?? [], (button) => button.textContent)).not.toContain(
			"Withdraw",
		);
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
