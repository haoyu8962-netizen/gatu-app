// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountPanel } from "@/components/trade/tradebox/account-panel";

vi.mock("boneyard-js/react", () => ({
	Skeleton: ({ children, fallback, loading }: { children: ReactNode; fallback?: ReactNode; loading?: boolean }) =>
		loading ? fallback : children,
}));

const balanceSnapshot = {
	allDexClearinghouseStates: [
		[
			"",
			{
				marginSummary: { totalMarginUsed: "170.25", totalNtlPos: "1702.5" },
				crossMarginSummary: { accountValue: "115.75", totalMarginUsed: "170.25", totalNtlPos: "1702.5" },
				crossMaintenanceMarginUsed: "85.125",
				assetPositions: [{ position: { leverage: { type: "cross" }, marginUsed: "170.25", unrealizedPnl: "-64.5" } }],
			},
		],
		[
			"xyz",
			{
				marginSummary: { totalMarginUsed: "290.75", totalNtlPos: "8722.5" },
				crossMarginSummary: { accountValue: "237.75", totalMarginUsed: "290.75", totalNtlPos: "8722.5" },
				crossMaintenanceMarginUsed: "145.375",
				assetPositions: [{ position: { leverage: { type: "cross" }, marginUsed: "290.75", unrealizedPnl: "120.5" } }],
			},
		],
	],
	dex: "",
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
	withDrawable: "0",
};

const testState = {
	accountAbstraction: "disabled",
	builderCollateral: "USDC",
	depositAvailable: true,
	depositUnavailableReason: null as string | null,
	geoStatus: "allowed" as "allowed" | "restricted" | "unresolved",
	hasError: false,
	hasWalletAccess: true,
	isConnected: true,
	isDataStale: false,
	isLoading: false,
	perpStateStatus: "success",
	portfolioMarginRatio: "0.42" as string | null,
	priceStatus: "success",
	prices: {} as Record<string, string>,
	snapshotsReady: true,
	spotBalances: [{ coin: "USDC", token: 0, total: "353.5", hold: "353.5", entryNtl: "0" }],
	spotStateStatus: "success",
};

const modalActions = vi.hoisted(() => ({
	openDeposit: vi.fn(),
	openTransfer: vi.fn(),
}));

function getBalances() {
	return {
		...balanceSnapshot,
		accountAbstraction: testState.accountAbstraction,
		hasAllDexsSnapshot: testState.snapshotsReady,
		hasSpotStateSnapshot: testState.snapshotsReady,
		isDataStale: testState.isDataStale,
		hasError: testState.hasError,
		isLoading: testState.isLoading,
		isPerpStateStale: testState.perpStateStatus === "stale",
		isSpotStateStale: testState.spotStateStatus === "stale",
		perpStateStatus: testState.perpStateStatus,
		portfolioMarginRatio: testState.portfolioMarginRatio,
		spotBalances: testState.spotBalances,
		spotStateStatus: testState.spotStateStatus,
		withdrawable: balanceSnapshot.withDrawable,
	};
}

vi.mock("@/hooks/trade/use-account-balances", () => ({
	isSupportedAccountAbstraction: (value: unknown) =>
		value === "disabled" || value === "unifiedAccount" || value === "portfolioMargin",
	useDefaultDexBalances: () => getBalances(),
	useSelectedDexBalances: () => getBalances(),
}));

vi.mock("@/hooks/trade/use-spot-token-usd-prices", () => ({
	useSpotTokenUsdPriceState: () => ({ prices: testState.prices, status: testState.priceStatus }),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useMarkets: () => ({
		builderPerp: [
			{
				dex: "xyz",
				quoteToken: { index: testState.builderCollateral === "USDC" ? 0 : 150, name: testState.builderCollateral },
			},
		],
		getToken: () => ({ index: 0 }),
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

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({
		hasWalletAccess: testState.hasWalletAccess,
		isConnected: testState.isConnected,
		walletAddress: "0x1111111111111111111111111111111111111111",
	}),
}));

vi.mock("@/hooks/trade/use-deposit-availability", () => ({
	useDepositAvailability: () => {
		const geoReason = testState.geoStatus === "allowed" ? null : `geo-${testState.geoStatus}`;
		return {
			available: testState.depositAvailable && geoReason === null,
			path: "external",
			reason: geoReason ?? (testState.depositAvailable ? null : "external-deposit-disabled"),
			unavailableLabel: "Deposit unavailable",
			unavailableReason:
				geoReason === null ? testState.depositUnavailableReason : "Funds actions are unavailable in this region.",
		};
	},
}));

vi.mock("@/lib/lifi/bridge-execution-state", () => ({
	useHasExistingBridgeExecution: () => false,
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

function findButton(container: HTMLElement, text: string): HTMLButtonElement {
	const button = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
		(candidate) => candidate.textContent === text,
	);
	if (!button) throw new Error(`Missing ${text} button`);
	return button;
}

describe("desktop account panel", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		testState.accountAbstraction = "disabled";
		testState.builderCollateral = "USDC";
		testState.depositAvailable = true;
		testState.depositUnavailableReason = null;
		testState.geoStatus = "allowed";
		testState.hasError = false;
		testState.hasWalletAccess = true;
		testState.isConnected = true;
		testState.isDataStale = false;
		testState.isLoading = false;
		testState.perpStateStatus = "success";
		testState.portfolioMarginRatio = "0.42";
		testState.priceStatus = "success";
		testState.prices = {};
		testState.snapshotsReady = true;
		testState.spotBalances = [{ coin: "USDC", token: 0, total: "353.5", hold: "353.5", entryNtl: "0" }];
		testState.spotStateStatus = "success";
		modalActions.openDeposit.mockReset();
		modalActions.openTransfer.mockReset();
		Object.defineProperty(window, "matchMedia", {
			configurable: true,
			value: vi.fn().mockReturnValue({ addEventListener: vi.fn(), matches: false, removeEventListener: vi.fn() }),
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

	function renderPanel() {
		act(() => {
			root.render(
				<I18nProvider i18n={i18n}>
					<AccountPanel />
				</I18nProvider>,
			);
		});
	}

	it("renders an actionable empty state without account metrics while disconnected", () => {
		testState.hasWalletAccess = false;
		testState.isConnected = false;
		renderPanel();

		const emptyState = container.querySelector('[data-slot="account-panel-empty"]');
		expect(emptyState?.textContent).toContain(
			"Connect your wallet to view your account, positions, and start trading.",
		);
		expect(emptyState?.querySelector("button")?.textContent).toBe("Connect Wallet");
		expect(container.querySelector('[data-slot="account-panel-actions"]')).toBeNull();
		expect(getMetricRowText(container, "Account Value")).toBeNull();
	});

	it("uses cross-only standard account fields and preserves the existing action routes", () => {
		renderPanel();

		expect(getMetricRowText(container, "Account Value")).toContain("$115.75");
		expect(getMetricRowText(container, "Unrealized PNL")).toContain("-$64.50");
		expect(getMetricRowText(container, "Cross Maintenance Margin")).toContain("$85.13");
		expect(getMetricRowText(container, "Account Margin Ratio")).toContain("73.54%");
		expect(getMetricRowText(container, "Cross Account Leverage")).toContain("14.71x");

		const deposit = findButton(container, "Deposit");
		const transfer = findButton(container, "Perps / Spot");
		const withdraw = findButton(container, "Withdraw");
		act(() => deposit.click());
		act(() => transfer.click());
		act(() => withdraw.click());
		expect(modalActions.openDeposit).toHaveBeenNthCalledWith(1, "deposit");
		expect(modalActions.openTransfer).toHaveBeenCalledWith("toPerp");
		expect(modalActions.openDeposit).toHaveBeenNthCalledWith(2, "withdraw");
	});

	it("uses the official unified ratio and USD-normalized multi-DEX risk", () => {
		testState.accountAbstraction = "unifiedAccount";
		renderPanel();

		expect(getMetricRowText(container, "Portfolio Value")).toContain("$353.50");
		expect(getMetricRowText(container, "Unrealized PNL")).toContain("+$56.00");
		expect(getMetricRowText(container, "Cross Maintenance Margin")).toContain("$230.50");
		expect(getMetricRowText(container, "Account Margin Ratio")).toContain("65.21%");
		expect(getMetricRowText(container, "Cross Account Leverage")).toContain("29.49x");

		const transfer = findButton(container, "Perps / Spot");
		expect(transfer.getAttribute("aria-disabled")).toBe("true");
		expect(transfer.disabled).toBe(false);
		const describedBy = transfer.getAttribute("aria-describedby");
		expect(describedBy).not.toBeNull();
		expect(document.getElementById(describedBy ?? "")?.textContent).toContain("shared-balance account modes");
		act(() => transfer.click());
		expect(modalActions.openTransfer).not.toHaveBeenCalled();
	});

	it("uses the SDK portfolio margin ratio and stays neutral when that optional field is absent", () => {
		testState.accountAbstraction = "portfolioMargin";
		renderPanel();
		expect(getMetricRowText(container, "Account Margin Ratio")).toContain("42.00%");

		testState.portfolioMarginRatio = null;
		renderPanel();
		const ratioRow = getMetricRowText(container, "Account Margin Ratio");
		expect(ratioRow).toContain("—");
		expect(container.querySelector('[role="progressbar"]')?.hasAttribute("aria-valuenow")).toBe(false);
		expect(container.querySelector('[role="progressbar"] .text-trading-panel-muted')).not.toBeNull();
		expect(container.querySelector('[role="progressbar"] .bg-trading-panel-success')).toBeNull();
	});

	it("renders loading, error, and stale states without exposing safe-looking old metrics", () => {
		testState.isLoading = true;
		testState.perpStateStatus = "loading";
		renderPanel();
		expect(container.textContent).toContain("Loading...");
		expect(container.textContent).not.toContain("$115.75");

		testState.isLoading = false;
		testState.hasError = true;
		testState.perpStateStatus = "error";
		renderPanel();
		expect(container.querySelector('[role="alert"]')?.textContent).toContain("Failed to load balances.");
		expect(getMetricRowText(container, "Account Value")).toContain("—");
		expect(findButton(container, "Withdraw").getAttribute("aria-disabled")).toBe("true");

		testState.hasError = false;
		testState.isDataStale = true;
		testState.perpStateStatus = "stale";
		renderPanel();
		expect(container.textContent).toContain("Balance data is stale. Actions are temporarily unavailable.");
		expect(getMetricRowText(container, "Account Value")).toContain("—");
		expect(findButton(container, "Withdraw").getAttribute("aria-disabled")).toBe("true");
	});

	it("keeps standard perp metrics available during an unrelated Spot-only failure", () => {
		testState.hasError = true;
		testState.spotStateStatus = "error";
		renderPanel();

		expect(container.querySelector('[role="alert"]')).toBeNull();
		expect(getMetricRowText(container, "Account Value")).toContain("$115.75");
		expect(findButton(container, "Withdraw").getAttribute("aria-disabled")).toBe("true");
	});

	it("explains shared-account valuation failures and never falls back to entry notional", () => {
		testState.accountAbstraction = "unifiedAccount";
		testState.builderCollateral = "HYPE";
		testState.spotBalances = [
			{ coin: "USDC", token: 0, total: "53.5", hold: "0", entryNtl: "0" },
			{ coin: "HYPE", token: 150, total: "10", hold: "0", entryNtl: "200" },
		];
		testState.prices = {};
		renderPanel();

		expect(container.textContent).toContain("Balance data is unavailable. Try again after the connection recovers.");
		expect(getMetricRowText(container, "Portfolio Value")).toContain("—");
		expect(container.textContent).not.toContain("$253.50");

		testState.priceStatus = "error";
		renderPanel();
		expect(container.querySelector('[role="alert"]')?.textContent).toContain("Failed to load balances.");
	});

	it("keeps disabled funds actions focusable and exposes their reason to assistive technology", () => {
		testState.hasError = true;
		testState.perpStateStatus = "error";
		renderPanel();

		for (const label of ["Perps / Spot", "Withdraw"]) {
			const button = findButton(container, label);
			expect(button.disabled).toBe(false);
			expect(button.getAttribute("aria-disabled")).toBe("true");
			expect(button.tabIndex).toBe(0);
			const describedBy = button.getAttribute("aria-describedby");
			expect(document.getElementById(describedBy ?? "")?.textContent).toContain("Balance data is unavailable");
		}
	});

	it.each(["restricted", "unresolved"] as const)(
		"removes withdrawal and internal transfer entries when geo is %s",
		(geoStatus) => {
			testState.geoStatus = geoStatus;
			renderPanel();

			const labels = Array.from(
				container.querySelectorAll<HTMLButtonElement>("button"),
				(button) => button.textContent,
			);
			expect(labels).not.toContain("Perps / Spot");
			expect(labels).not.toContain("Withdraw");
			expect(container.textContent).toContain("Funds actions are unavailable in this region.");
			expect(modalActions.openTransfer).not.toHaveBeenCalled();
			expect(modalActions.openDeposit).not.toHaveBeenCalledWith("withdraw");
		},
	);
});
