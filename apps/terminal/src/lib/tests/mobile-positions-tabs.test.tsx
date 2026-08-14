/** @vitest-environment jsdom */

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	type MobileDisclosureSetState,
	useMobilePositionsDisclosureStates,
} from "@/components/trade/mobile/use-mobile-disclosure-set";
import { MOBILE_POSITIONS_TABS } from "@/config/trade";

const storeState = vi.hoisted(() => ({
	activeTab: "positions",
	address: "0x1234",
	env: "Mainnet" as "Mainnet" | "Testnet",
	isConnected: true,
	positions: [] as Array<{ coin: string; dex: string; szi: string }>,
	snapshotsReady: true,
}));
const setPositionsActiveTab = vi.hoisted(() => vi.fn<(tab: string) => void>());

function MockDisclosureTab({
	disclosureState,
	tabValue,
}: {
	disclosureState: MobileDisclosureSetState;
	tabValue: string;
}) {
	const ownerKey = storeState.address.toLowerCase();
	const keys =
		tabValue === "positions"
			? storeState.positions.map((position) => `${ownerKey}:${position.dex}:${position.coin}`)
			: [`${ownerKey}:${tabValue}:first`];
	const { expandedKeys, setExpanded } = disclosureState.createController(keys);
	const firstKey = keys[0];

	return (
		<div data-tab-content={tabValue} data-disclosure-keys={keys.join(",")}>
			<output data-testid={`expanded-${tabValue}-keys`}>{[...expandedKeys].join(",")}</output>
			{firstKey ? (
				<button
					type="button"
					data-testid={`toggle-${tabValue}-first`}
					aria-expanded={expandedKeys.has(firstKey)}
					onClick={() => setExpanded(firstKey, !expandedKeys.has(firstKey))}
				>
					Toggle {tabValue} first card
				</button>
			) : null}
		</div>
	);
}

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({
		address: storeState.isConnected ? storeState.address : null,
		isConnected: storeState.isConnected,
	}),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useHyperliquid: () => ({ env: storeState.env }),
	useSubscription: (type: string) => ({
		data: type === "twapStates" ? { states: [] } : { orders: [] },
		isStale: false,
		status: storeState.snapshotsReady ? "active" : "subscribing",
	}),
	useUserPositions: () => ({
		positions: storeState.positions,
		isLoading: !storeState.snapshotsReady,
		hasError: false,
	}),
}));

vi.mock("@/hooks/trade/use-account-balances", () => ({
	isSupportedAccountAbstraction: (value: unknown) =>
		value === "disabled" || value === "unifiedAccount" || value === "portfolioMargin",
	useDefaultDexBalances: () => ({
		accountAbstraction: "disabled",
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
	MobileFundingTab: ({ disclosureState }: { disclosureState: MobileDisclosureSetState }) => (
		<MockDisclosureTab disclosureState={disclosureState} tabValue="funding" />
	),
}));

vi.mock("@/components/trade/mobile/mobile-history-tab", () => ({
	MobileHistoryTab: ({ disclosureState }: { disclosureState: MobileDisclosureSetState }) => (
		<MockDisclosureTab disclosureState={disclosureState} tabValue="history" />
	),
}));

vi.mock("@/components/trade/mobile/mobile-orders-history-tab", () => ({
	MobileOrdersHistoryTab: ({ disclosureState }: { disclosureState: MobileDisclosureSetState }) => (
		<MockDisclosureTab disclosureState={disclosureState} tabValue="orders-history" />
	),
}));

vi.mock("@/components/trade/mobile/mobile-orders-tab", () => ({
	MobileOrdersTab: ({ disclosureState }: { disclosureState: MobileDisclosureSetState }) => (
		<MockDisclosureTab disclosureState={disclosureState} tabValue="orders" />
	),
}));

vi.mock("@/components/trade/mobile/mobile-positions-tab", () => ({
	MobilePositionsTab: ({ disclosureState }: { disclosureState: MobileDisclosureSetState }) => (
		<MockDisclosureTab disclosureState={disclosureState} tabValue="positions" />
	),
}));

vi.mock("@/components/trade/mobile/mobile-twap-tab", () => ({
	MobileTwapTab: () => <div data-tab-content="twap" />,
}));

import { MobilePositionsView } from "@/components/trade/mobile/mobile-positions-view";

function SharedDisclosurePositionsView({ visible, identity }: { visible: boolean; identity: string | null }) {
	const disclosureStates = useMobilePositionsDisclosureStates(identity);
	return visible ? (
		<MobilePositionsView
			includeBottomNavSpacer={false}
			balancesContent={<div data-testid="shared-balances" />}
			disclosureStates={disclosureStates}
		/>
	) : null;
}

describe("MobilePositionsView tabs", () => {
	let container: HTMLDivElement;
	let root: Root;
	let scrollIntoView: ReturnType<typeof vi.fn>;
	let scrollByDescriptor: PropertyDescriptor | undefined;
	let scrollIntoViewDescriptor: PropertyDescriptor | undefined;

	beforeEach(() => {
		storeState.activeTab = "positions";
		storeState.address = "0x1234";
		storeState.env = "Mainnet";
		storeState.isConnected = true;
		storeState.positions = [];
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
		vi.unstubAllGlobals();
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
		const tabList = scroller?.querySelector<HTMLElement>('[role="tablist"]');
		expect(tabList?.className).toContain("h-[47px]");
		const indicator = Array.from(tabList?.children ?? []).find((element) =>
			element.className.includes("bg-market-close-fg"),
		) as HTMLElement | undefined;
		expect(indicator?.className).toContain("transition-[left]");
		expect(indicator?.className).not.toContain("transition-[left,width]");
		expect(indicator?.className).toContain("duration-[120ms]");

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
			expect(tab.className).toContain("font-medium");
			expect(tab.className).not.toContain("data-active:font-bold");
			expect(tab.className).toContain("text-market-close-subtle");
			expect(tab.className).toContain("data-active:text-market-close-fg");
		}
	});

	it("rechecks the selected tab when the horizontal viewport changes", () => {
		const observe = vi.fn();
		vi.stubGlobal(
			"ResizeObserver",
			class {
				observe = observe;
				disconnect = vi.fn();
				unobserve = vi.fn();
			},
		);
		render();

		const scroller = container.querySelector<HTMLElement>('[data-testid="mobile-account-tabs-scroll"]');
		expect(scroller).not.toBeNull();
		expect(observe).toHaveBeenCalledWith(scroller);
		for (const tab of container.querySelectorAll<HTMLElement>("[data-mobile-account-tab]")) {
			expect(observe).toHaveBeenCalledWith(tab);
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

	it("starts positions collapsed and preserves explicit state while the inactive panel is unmounted", () => {
		storeState.positions = [
			{ coin: "AAVE", dex: "", szi: "1" },
			{ coin: "ETH", dex: "", szi: "2" },
		];
		render();
		expect(container.querySelector('[data-mobile-account-tab="positions"]')?.textContent).toBe("Positions(2)");
		expect(container.querySelector('[data-tab-content="positions"]')?.getAttribute("data-disclosure-keys")).toBe(
			"0x1234::AAVE,0x1234::ETH",
		);
		expect(container.querySelector('[data-testid="expanded-positions-keys"]')?.textContent).toBe("");

		const firstPosition = container.querySelector<HTMLButtonElement>('[data-testid="toggle-positions-first"]');
		act(() => firstPosition?.click());
		expect(firstPosition?.getAttribute("aria-expanded")).toBe("true");
		expect(container.querySelector('[data-testid="expanded-positions-keys"]')?.textContent).toBe("0x1234::AAVE");

		const ordersTab = container.querySelector<HTMLButtonElement>('[data-mobile-account-tab="orders"]');
		act(() => ordersTab?.click());
		expect(container.querySelector('[data-tab-content="positions"]')).toBeNull();

		storeState.positions = [
			{ coin: "ETH", dex: "", szi: "2" },
			{ coin: "AAVE", dex: "", szi: "1" },
			{ coin: "SOL", dex: "", szi: "3" },
		];
		const positionsTab = container.querySelector<HTMLButtonElement>('[data-mobile-account-tab="positions"]');
		act(() => positionsTab?.click());
		expect(container.querySelector('[data-tab-content="positions"]')).not.toBeNull();
		expect(container.querySelector('[data-tab-content="positions"]')?.getAttribute("data-disclosure-keys")).toBe(
			"0x1234::ETH,0x1234::AAVE,0x1234::SOL",
		);
		expect(container.querySelector('[data-testid="expanded-positions-keys"]')?.textContent).toBe("0x1234::AAVE");

		storeState.address = "0xABCD";
		render();
		expect(container.querySelector('[data-testid="expanded-positions-keys"]')?.textContent).toBe("");
	});

	it("keeps every collapsible tab state independent across unmounts and resets it for a new environment", () => {
		vi.useFakeTimers();
		storeState.positions = [{ coin: "AAVE", dex: "", szi: "1" }];
		render();

		const collapsibleTabs = ["positions", "orders", "history", "funding", "orders-history"] as const;
		for (const tabValue of collapsibleTabs) {
			const tab = container.querySelector<HTMLButtonElement>(`[data-mobile-account-tab="${tabValue}"]`);
			act(() => tab?.click());
			const content = container.querySelector(`[data-tab-content="${tabValue}"]`);
			const firstKey = content?.getAttribute("data-disclosure-keys")?.split(",")[0];
			const toggle = container.querySelector<HTMLButtonElement>(`[data-testid="toggle-${tabValue}-first"]`);
			expect(toggle?.getAttribute("aria-expanded")).toBe("false");
			expect(container.querySelector(`[data-testid="expanded-${tabValue}-keys"]`)?.textContent).toBe("");
			act(() => toggle?.click());
			expect(toggle?.getAttribute("aria-expanded")).toBe("true");
			expect(container.querySelector(`[data-testid="expanded-${tabValue}-keys"]`)?.textContent).toBe(firstKey);

			const balancesTab = container.querySelector<HTMLButtonElement>('[data-mobile-account-tab="balances"]');
			act(() => balancesTab?.click());
			expect(container.querySelector(`[data-tab-content="${tabValue}"]`)).toBeNull();
			act(() => tab?.click());
			expect(
				container
					.querySelector<HTMLButtonElement>(`[data-testid="toggle-${tabValue}-first"]`)
					?.getAttribute("aria-expanded"),
			).toBe("true");
			expect(container.querySelector(`[data-testid="expanded-${tabValue}-keys"]`)?.textContent).toBe(firstKey);
		}

		storeState.env = "Testnet";
		render();
		for (const tabValue of collapsibleTabs) {
			act(() => container.querySelector<HTMLButtonElement>(`[data-mobile-account-tab="${tabValue}"]`)?.click());
			expect(container.querySelector(`[data-testid="expanded-${tabValue}-keys"]`)?.textContent).toBe("");
		}

		storeState.env = "Mainnet";
		render();
		for (const tabValue of collapsibleTabs) {
			act(() => container.querySelector<HTMLButtonElement>(`[data-mobile-account-tab="${tabValue}"]`)?.click());
			expect(container.querySelector(`[data-testid="expanded-${tabValue}-keys"]`)?.textContent).toBe("");
		}

		act(() => container.querySelector<HTMLButtonElement>('[data-testid="toggle-orders-history-first"]')?.click());
		storeState.isConnected = false;
		render();
		storeState.isConnected = true;
		render();
		expect(
			container
				.querySelector<HTMLButtonElement>('[data-testid="toggle-orders-history-first"]')
				?.getAttribute("aria-expanded"),
		).toBe("false");
	});

	it("restores every shared disclosure state after the entire account view remounts", () => {
		vi.useFakeTimers();
		storeState.positions = [{ coin: "AAVE", dex: "", szi: "1" }];

		function renderSharedView(visible: boolean) {
			const identity = storeState.isConnected ? `${storeState.env}:${storeState.address.toLowerCase()}` : null;
			act(() => {
				root.render(
					<I18nProvider i18n={i18n}>
						<SharedDisclosurePositionsView visible={visible} identity={identity} />
					</I18nProvider>,
				);
			});
		}

		const collapsibleTabs = ["positions", "orders", "history", "funding", "orders-history"] as const;
		renderSharedView(true);
		for (const tabValue of collapsibleTabs) {
			act(() => container.querySelector<HTMLButtonElement>(`[data-mobile-account-tab="${tabValue}"]`)?.click());
			act(() => container.querySelector<HTMLButtonElement>(`[data-testid="toggle-${tabValue}-first"]`)?.click());
			expect(container.querySelector(`[data-testid="expanded-${tabValue}-keys"]`)?.textContent).not.toBe("");
		}

		renderSharedView(false);
		expect(container.querySelector("[data-mobile-account-tab]")).toBeNull();
		renderSharedView(true);
		for (const tabValue of collapsibleTabs) {
			act(() => container.querySelector<HTMLButtonElement>(`[data-mobile-account-tab="${tabValue}"]`)?.click());
			expect(container.querySelector(`[data-testid="expanded-${tabValue}-keys"]`)?.textContent).not.toBe("");
		}

		storeState.env = "Testnet";
		renderSharedView(true);
		for (const tabValue of collapsibleTabs) {
			act(() => container.querySelector<HTMLButtonElement>(`[data-mobile-account-tab="${tabValue}"]`)?.click());
			expect(container.querySelector(`[data-testid="expanded-${tabValue}-keys"]`)?.textContent).toBe("");
		}
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
