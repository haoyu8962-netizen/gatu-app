// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileAccountView } from "@/components/trade/mobile/mobile-account-view";

vi.mock("boneyard-js/react", () => ({
	Skeleton: ({ children }: { children: ReactNode }) => children,
}));

const balanceSnapshot = {
	allDexClearinghouseStates: [
		[
			"",
			{
				marginSummary: { totalMarginUsed: "170.25", totalNtlPos: "1702.5" },
				crossMaintenanceMarginUsed: "85.125",
				assetPositions: [{ position: { leverage: { type: "cross" }, marginUsed: "170.25", unrealizedPnl: "-64.5" } }],
			},
		],
		[
			"xyz",
			{
				marginSummary: { totalMarginUsed: "290.75", totalNtlPos: "8722.5" },
				crossMaintenanceMarginUsed: "145.375",
				assetPositions: [{ position: { leverage: { type: "cross" }, marginUsed: "290.75", unrealizedPnl: "120.5" } }],
			},
		],
	],
	dex: "",
	hasAllDexsSnapshot: true,
	hasError: false,
	hasSpotStateSnapshot: true,
	isLoading: false,
	isSpotStateStale: false,
	marginSummary: {
		accountValue: "115.75",
		totalMarginUsed: "170.25",
		totalNtlPos: "1702.5",
		totalRawUsd: "-1586.75",
	},
	perpSummary: {
		accountValue: "115.75",
		totalMarginUsed: "170.25",
		totalNtlPos: "1702.5",
	},
	perpPositions: [{ position: { leverage: { type: "cross" }, marginUsed: "170.25", unrealizedPnl: "-64.5" } }],
	crossMaintenanceMarginUsed: "85.125",
	spotAvailableAfterMaintenance: [[0, "122.75"]],
	spotBalances: [{ coin: "USDC", token: 0, total: "353.5", hold: "353.5", entryNtl: "0" }],
	withdrawable: "0",
};

const testState = {
	accountAbstraction: "unifiedAccount",
	snapshotsReady: true,
};

const bridgeState = vi.hoisted(() => ({
	hasExistingExecution: false,
}));

const modalActions = vi.hoisted(() => ({
	openDeposit: vi.fn(),
	openTransfer: vi.fn(),
}));

vi.mock("@/hooks/trade/use-account-balances", () => ({
	isSupportedAccountAbstraction: (value: unknown) =>
		value === "disabled" || value === "unifiedAccount" || value === "portfolioMargin",
	useDefaultDexBalances: () => ({
		...balanceSnapshot,
		accountAbstraction: testState.accountAbstraction,
		hasAllDexsSnapshot: testState.snapshotsReady,
		hasSpotStateSnapshot: testState.snapshotsReady,
	}),
	useSelectedDexBalances: () => ({
		...balanceSnapshot,
		accountAbstraction: testState.accountAbstraction,
		hasAllDexsSnapshot: testState.snapshotsReady,
		hasSpotStateSnapshot: testState.snapshotsReady,
	}),
}));

vi.mock("@/hooks/trade/use-spot-token-usd-prices", () => ({
	useSpotTokenUsdPrices: () => undefined,
}));

vi.mock("@/lib/hyperliquid", () => ({
	useMarkets: () => ({
		builderPerp: [{ dex: "xyz", quoteToken: { index: 0 } }],
		getToken: () => ({ index: 0 }),
	}),
}));

vi.mock("@/hooks/use-geo-restriction", () => ({
	useGeoRestriction: () => ({ tradeRestricted: false }),
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({
		isConnected: true,
		sessionMode: "wallet",
		walletAddress: "0x1111111111111111111111111111111111111111",
	}),
}));

vi.mock("@/lib/lifi/bridge-execution-state", () => ({
	useHasExistingBridgeExecution: () => bridgeState.hasExistingExecution,
}));

vi.mock("@/stores/use-global-modal-store", () => ({
	useDepositModalActions: () => ({ open: modalActions.openDeposit }),
	useTransferModalActions: () => ({ open: modalActions.openTransfer }),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function getMetricRowText(container: HTMLElement, label: string): string | null {
	const labelElement = Array.from(container.querySelectorAll("span")).find((element) => element.textContent === label);
	return labelElement?.parentElement?.textContent ?? null;
}

describe("mobile account view", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		testState.accountAbstraction = "unifiedAccount";
		testState.snapshotsReady = true;
		bridgeState.hasExistingExecution = false;
		modalActions.openDeposit.mockReset();
		modalActions.openTransfer.mockReset();
		Object.defineProperty(window, "matchMedia", {
			configurable: true,
			value: vi.fn().mockReturnValue({
				addEventListener: vi.fn(),
				matches: false,
				removeEventListener: vi.fn(),
			}),
		});
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	it("uses the canonical unified collateral ratio and aggregates risk across perp DEXs", () => {
		act(() => {
			root.render(
				<I18nProvider i18n={i18n}>
					<MobileAccountView />
				</I18nProvider>,
			);
		});

		expect(getMetricRowText(container, "Portfolio Value")).toContain("$353.50");
		expect(getMetricRowText(container, "Maintenance Margin")).toContain("$230.50");
		expect(getMetricRowText(container, "Account Margin Ratio")).toContain("65.21%");
		expect(getMetricRowText(container, "Cross Account Leverage")).toContain("29.49x");
	});

	it("does not invent a maintenance ratio for portfolio margin", () => {
		testState.accountAbstraction = "portfolioMargin";

		act(() => {
			root.render(
				<I18nProvider i18n={i18n}>
					<MobileAccountView />
				</I18nProvider>,
			);
		});

		expect(getMetricRowText(container, "Portfolio Value")).toContain("$353.50");
		expect(getMetricRowText(container, "Account Margin Ratio")).toContain("—");
	});

	it("shows unavailable metrics instead of false zeroes before complete snapshots arrive", () => {
		testState.snapshotsReady = false;
		act(() => {
			root.render(
				<I18nProvider i18n={i18n}>
					<MobileAccountView />
				</I18nProvider>,
			);
		});

		expect(getMetricRowText(container, "Portfolio Value")).toContain("—");
		expect(getMetricRowText(container, "Account Margin Ratio")).toContain("—");
		expect(getMetricRowText(container, "Account Margin Ratio")).not.toContain("0.00%");
	});

	it("hides the mobile bridge entry while creation is gated and restores it for an existing execution", () => {
		act(() => {
			root.render(
				<I18nProvider i18n={i18n}>
					<MobileAccountView />
				</I18nProvider>,
			);
		});
		const getBridgeButton = () =>
			Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Bridge");
		expect(getBridgeButton()).toBeUndefined();

		bridgeState.hasExistingExecution = true;
		act(() => {
			root.render(
				<I18nProvider i18n={i18n}>
					<MobileAccountView />
				</I18nProvider>,
			);
		});
		expect(getBridgeButton()).toBeDefined();
	});

	it("places the primary deposit action first and keeps each action wired to its existing store route", () => {
		testState.accountAbstraction = "disabled";
		act(() => {
			root.render(
				<I18nProvider i18n={i18n}>
					<MobileAccountView />
				</I18nProvider>,
			);
		});

		const actions = container.querySelector('[data-slot="mobile-account-actions"]');
		if (!actions) throw new Error("Missing mobile account actions");
		const buttons = Array.from(actions.querySelectorAll("button"));
		expect(buttons.map((button) => button.textContent)).toEqual(["Deposit", "Perps / Spot", "Withdraw"]);

		act(() => buttons[0]?.click());
		act(() => buttons[1]?.click());
		act(() => buttons[2]?.click());
		expect(modalActions.openDeposit).toHaveBeenNthCalledWith(1, "deposit");
		expect(modalActions.openTransfer).toHaveBeenCalledWith("toPerp");
		expect(modalActions.openDeposit).toHaveBeenNthCalledWith(2, "withdraw");
	});

	it("leaves wallet identity controls to the shared mobile header", () => {
		act(() => {
			root.render(
				<I18nProvider i18n={i18n}>
					<MobileAccountView />
				</I18nProvider>,
			);
		});

		expect(container.textContent).not.toContain("0x1111");
		expect(container.querySelector('button[aria-label="Disconnect wallet"]')).toBeNull();
	});
});
