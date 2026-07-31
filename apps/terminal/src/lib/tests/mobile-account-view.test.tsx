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
				assetPositions: [{ position: { unrealizedPnl: "-64.5" } }],
			},
		],
		[
			"xyz",
			{
				marginSummary: { totalMarginUsed: "290.75", totalNtlPos: "8722.5" },
				crossMaintenanceMarginUsed: "145.375",
				assetPositions: [{ position: { unrealizedPnl: "120.5" } }],
			},
		],
	],
	dex: "",
	hasError: false,
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
	spotAvailableAfterMaintenance: [[0, "122.75"]],
	spotBalances: [{ coin: "USDC", token: 0, total: "353.5", hold: "353.5", entryNtl: "0" }],
	withdrawable: "0",
};

const testState = {
	accountAbstraction: "unifiedAccount",
};

const bridgeState = vi.hoisted(() => ({
	hasExistingExecution: false,
}));

vi.mock("@/hooks/trade/use-account-balances", () => ({
	useDefaultDexBalances: () => ({ ...balanceSnapshot, accountAbstraction: testState.accountAbstraction }),
	useSelectedDexBalances: () => ({ ...balanceSnapshot, accountAbstraction: testState.accountAbstraction }),
}));

vi.mock("@/hooks/trade/use-spot-token-usd-prices", () => ({
	useSpotTokenUsdPrices: () => undefined,
}));

vi.mock("@/hooks/ui/use-copy-to-clipboard", () => ({
	useCopyToClipboard: () => ({ copied: false, copy: vi.fn() }),
}));

vi.mock("@/hooks/use-geo-restriction", () => ({
	useGeoRestriction: () => ({ tradeRestricted: false }),
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useDisconnectWallet: () => ({ disconnectWallet: vi.fn() }),
	useWalletSession: () => ({
		address: "0x1111111111111111111111111111111111111111",
		isConnected: true,
		sessionMode: "wallet",
		walletAddress: "0x1111111111111111111111111111111111111111",
	}),
}));

vi.mock("@/lib/lifi/bridge-execution-state", () => ({
	useHasExistingBridgeExecution: () => bridgeState.hasExistingExecution,
}));

vi.mock("@/stores/use-global-modal-store", () => ({
	useDepositModalActions: () => ({ open: vi.fn() }),
	useTransferModalActions: () => ({ open: vi.fn() }),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function getStatCardText(container: HTMLElement, label: string): string | null {
	const labelElement = Array.from(container.querySelectorAll("div")).find((element) => element.textContent === label);
	return labelElement?.parentElement?.textContent ?? null;
}

describe("mobile account view", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		testState.accountAbstraction = "unifiedAccount";
		bridgeState.hasExistingExecution = false;
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

	it("shows unheld unified collateral and aggregates margin across perp DEXs", () => {
		act(() => {
			root.render(
				<I18nProvider i18n={i18n}>
					<MobileAccountView />
				</I18nProvider>,
			);
		});

		expect(getStatCardText(container, "Available")).toContain("$0.00");
		expect(getStatCardText(container, "Available")).not.toContain("$122.75");
		expect(getStatCardText(container, "Margin Used")).toContain("$461.00");
	});

	it("preserves maintenance-adjusted availability for portfolio margin", () => {
		testState.accountAbstraction = "portfolioMargin";

		act(() => {
			root.render(
				<I18nProvider i18n={i18n}>
					<MobileAccountView />
				</I18nProvider>,
			);
		});

		expect(getStatCardText(container, "Available")).toContain("$122.75");
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
});
