// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileAccountView } from "@/components/trade/mobile/mobile-account-view";

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
	hasAllDexsSnapshot: true,
	hasError: false,
	hasSpotStateSnapshot: true,
	isDataStale: false,
	isLoading: false,
	isPerpStateStale: false,
	isSpotStateStale: false,
	perpStateStatus: "success",
	perpStateReceivedAt: Date.now(),
	spotStateStatus: "success",
	spotStateReceivedAt: Date.now(),
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
	portfolioMarginRatio: "0.42",
	spotAvailableAfterMaintenance: [[0, "122.75"]],
	spotBalances: [{ coin: "USDC", token: 0, total: "353.5", hold: "353.5", entryNtl: "0" }],
	withdrawable: "0",
};

const testState = {
	accountAbstraction: "unifiedAccount" as string | null,
	depositAvailable: true,
	depositPath: "external" as "external" | "sponsored",
	depositUnavailableReason: null as string | null,
	geoStatus: "allowed" as "allowed" | "restricted" | "unresolved",
	hasError: false,
	hasWalletAccess: true,
	isConnected: true,
	isDataStale: false,
	isLoading: false,
	perpStateStatus: "success",
	snapshotsReady: true,
	spotStateStatus: "success",
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
		isDataStale: testState.isDataStale,
		hasError: testState.hasError,
		isLoading: testState.isLoading,
		isPerpStateStale: testState.perpStateStatus === "stale",
		isSpotStateStale: testState.spotStateStatus === "stale",
		perpStateStatus: testState.perpStateStatus,
		spotStateStatus: testState.spotStateStatus,
	}),
	useSelectedDexBalances: () => ({
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
		spotStateStatus: testState.spotStateStatus,
	}),
}));

vi.mock("@/hooks/trade/use-spot-token-usd-prices", () => ({
	useSpotTokenUsdPriceState: () => ({ prices: {}, status: "success" }),
	useSpotTokenUsdPrices: () => undefined,
}));

vi.mock("@/lib/hyperliquid", () => ({
	useMarkets: () => ({
		builderPerp: [{ dex: "xyz", quoteToken: { index: 0, name: "USDC" } }],
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
		sessionMode: "wallet",
		walletAddress: "0x1111111111111111111111111111111111111111",
	}),
}));

vi.mock("@/hooks/trade/use-deposit-availability", () => ({
	useDepositAvailability: () => {
		const geoReason = testState.geoStatus === "allowed" ? null : `geo-${testState.geoStatus}`;
		return {
			available: testState.depositAvailable && geoReason === null,
			path: testState.depositPath,
			reason: geoReason ?? (testState.depositAvailable ? null : "external-deposit-disabled"),
			unavailableLabel: "Deposit unavailable",
			unavailableReason:
				geoReason === null ? testState.depositUnavailableReason : "Funds actions are unavailable in this region.",
		};
	},
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

function getDescriptionText(button: HTMLButtonElement): string {
	return (button.getAttribute("aria-describedby") ?? "")
		.split(/\s+/)
		.flatMap((id) => (id ? [document.getElementById(id)?.textContent ?? ""] : []))
		.join(" ");
}

describe("mobile account view", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		testState.accountAbstraction = "unifiedAccount";
		testState.depositAvailable = true;
		testState.depositPath = "external";
		testState.depositUnavailableReason = null;
		testState.geoStatus = "allowed";
		testState.hasError = false;
		testState.hasWalletAccess = true;
		testState.isConnected = true;
		testState.isDataStale = false;
		testState.isLoading = false;
		testState.perpStateStatus = "success";
		testState.snapshotsReady = true;
		testState.spotStateStatus = "success";
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
		expect(getMetricRowText(container, "Cross Maintenance Margin")).toContain("$230.50");
		expect(getMetricRowText(container, "Account Margin Ratio")).toContain("65.21%");
		expect(getMetricRowText(container, "Cross Account Leverage")).toContain("29.49x");
	});

	it.each([null, "unknown", "default", "dexAbstraction"])(
		"distinguishes unresolved and unsupported %s modes in funding controls",
		(mode) => {
			testState.accountAbstraction = mode;
			act(() =>
				root.render(
					<I18nProvider i18n={i18n}>
						<MobileAccountView />
					</I18nProvider>,
				),
			);
			const buttons = Array.from(
				container.querySelectorAll<HTMLButtonElement>('[data-slot="mobile-account-actions"] button'),
			);
			const transfer = buttons.find((button) => button.textContent === "Perps / Spot");
			const withdraw = buttons.find((button) => button.textContent === "Withdraw");
			expect(transfer?.getAttribute("aria-disabled")).toBe("true");
			expect(withdraw?.getAttribute("aria-disabled")).toBe("true");
			if (!transfer || !withdraw) throw new Error("Missing funding controls");
			const confirmed = mode === "default" || mode === "dexAbstraction";
			expect(getDescriptionText(transfer).includes("Select a supported account mode before moving funds.")).toBe(
				confirmed,
			);
			expect(getDescriptionText(withdraw).includes("Select a supported account mode before moving funds.")).toBe(
				confirmed,
			);
			act(() => {
				transfer?.click();
				withdraw?.click();
			});
			expect(modalActions.openTransfer).not.toHaveBeenCalled();
			expect(modalActions.openDeposit).not.toHaveBeenCalled();
		},
	);

	it("uses the SDK portfolio margin ratio when the account is in portfolio margin mode", () => {
		testState.accountAbstraction = "portfolioMargin";

		act(() => {
			root.render(
				<I18nProvider i18n={i18n}>
					<MobileAccountView />
				</I18nProvider>,
			);
		});

		expect(getMetricRowText(container, "Portfolio Value")).toContain("$353.50");
		expect(getMetricRowText(container, "Account Margin Ratio")).toContain("42.00%");
	});

	it("uses formatted zero placeholders before complete snapshots arrive", () => {
		testState.snapshotsReady = false;
		act(() => {
			root.render(
				<I18nProvider i18n={i18n}>
					<MobileAccountView />
				</I18nProvider>,
			);
		});

		expect(getMetricRowText(container, "Portfolio Value")).toContain("$0.00");
		expect(getMetricRowText(container, "Account Margin Ratio")).toContain("0.00%");
		expect(getMetricRowText(container, "Unrealized PNL")).toContain("$0.00");
		expect(getMetricRowText(container, "Cross Maintenance Margin")).toContain("$0.00");
		expect(getMetricRowText(container, "Cross Account Leverage")).toContain("0.00x");
		expect(container.querySelector("section")?.textContent).not.toContain("—");
	});

	it.each(["disabled", "unifiedAccount", "portfolioMargin"])(
		"keeps %s metrics quiet and funds actions blocked until current balances recover",
		(accountAbstraction) => {
			testState.accountAbstraction = accountAbstraction;
			const accountValueLabel = accountAbstraction === "disabled" ? "Account Value" : "Portfolio Value";
			const render = () => {
				act(() => {
					root.render(
						<I18nProvider i18n={i18n}>
							<MobileAccountView />
						</I18nProvider>,
					);
				});
			};

			render();
			expect(getMetricRowText(container, accountValueLabel)).toContain(
				accountAbstraction === "disabled" ? "$115.75" : "$353.50",
			);

			for (const status of ["loading", "stale", "error", "idle"]) {
				testState.isLoading = status === "loading";
				testState.isDataStale = status === "stale";
				testState.hasError = status === "error";
				testState.perpStateStatus = status;
				render();

				expect(getMetricRowText(container, accountValueLabel)).toContain("$0.00");
				expect(getMetricRowText(container, "Account Margin Ratio")).toContain("0.00%");
				expect(getMetricRowText(container, "Unrealized PNL")).toContain("$0.00");
				expect(getMetricRowText(container, "Cross Maintenance Margin")).toContain("$0.00");
				expect(getMetricRowText(container, "Cross Account Leverage")).toContain("0.00x");
				expect(container.querySelector("section")?.getAttribute("aria-busy")).toBe(String(status === "loading"));
				expect(container.querySelector('[role="alert"], output, [aria-label="Balance data is stale."]')).toBeNull();
				expect(container.textContent).not.toContain("Balance data is stale");
				expect(container.textContent).not.toContain("Failed to load balances");
				expect(container.textContent).not.toContain("Loading...");
				expect(container.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBeNull();

				const actions = container.querySelector('[data-slot="mobile-account-actions"]');
				if (!actions) throw new Error("Missing mobile account actions");
				const buttons = Array.from(actions.querySelectorAll("button"));
				const transfer = buttons.find((button) => button.textContent === "Perps / Spot");
				const withdraw = buttons.find((button) => button.textContent === "Withdraw");
				expect(transfer?.getAttribute("aria-disabled")).toBe("true");
				expect(transfer?.getAttribute("aria-label")).toBeNull();
				expect(transfer ? getDescriptionText(transfer) : "").toContain("Transfer between Perps and Spot");
				expect(transfer ? getDescriptionText(transfer) : "").not.toContain("Balance data is unavailable");
				expect(withdraw?.getAttribute("aria-disabled")).toBe("true");
				act(() => {
					transfer?.click();
					withdraw?.click();
				});
				expect(modalActions.openTransfer).not.toHaveBeenCalled();
				expect(modalActions.openDeposit).not.toHaveBeenCalled();
			}

			testState.perpStateStatus = "success";
			render();
			expect(getMetricRowText(container, accountValueLabel)).toContain(
				accountAbstraction === "disabled" ? "$115.75" : "$353.50",
			);
			const withdraw = container.querySelector('button[aria-label="Withdraw"]');
			expect(withdraw?.getAttribute("aria-disabled")).not.toBe("true");
		},
	);

	it("renders zero placeholders while the account mode is still resolving", () => {
		testState.accountAbstraction = null;
		testState.snapshotsReady = false;
		act(() => {
			root.render(
				<I18nProvider i18n={i18n}>
					<MobileAccountView />
				</I18nProvider>,
			);
		});

		expect(getMetricRowText(container, "Account Value")).toContain("$0.00");
		expect(getMetricRowText(container, "Account Margin Ratio")).toContain("0.00%");
		expect(container.querySelector('[role="alert"], output')).toBeNull();
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
		const bridgeButton = getBridgeButton();
		expect(bridgeButton).toBeDefined();
		expect(bridgeButton?.getAttribute("aria-label")).toBe(bridgeButton?.textContent);
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
		expect(buttons[0]?.getAttribute("aria-label")).toBe(buttons[0]?.textContent);
		expect(buttons[1]?.getAttribute("aria-label")).toBeNull();
		expect(buttons[2]?.getAttribute("aria-label")).toBe(buttons[2]?.textContent);

		act(() => buttons[0]?.click());
		act(() => buttons[1]?.click());
		act(() => buttons[2]?.click());
		expect(modalActions.openDeposit).toHaveBeenNthCalledWith(1, "deposit");
		expect(modalActions.openTransfer).toHaveBeenCalledWith("toPerp");
		expect(modalActions.openDeposit).toHaveBeenNthCalledWith(2, "withdraw");
	});

	it("keeps standard perp metrics available during an unrelated Spot-only failure", () => {
		testState.accountAbstraction = "disabled";
		testState.hasError = true;
		testState.spotStateStatus = "error";
		act(() => {
			root.render(
				<I18nProvider i18n={i18n}>
					<MobileAccountView />
				</I18nProvider>,
			);
		});

		expect(container.querySelector('[role="alert"]')).toBeNull();
		expect(getMetricRowText(container, "Account Value")).toContain("$115.75");
		const withdraw = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
			(button) => button.textContent === "Withdraw",
		);
		expect(withdraw?.getAttribute("aria-disabled")).toBe("true");
	});

	it("keeps an unavailable Deposit action inert and shows the release reason", () => {
		testState.accountAbstraction = "disabled";
		testState.depositAvailable = false;
		testState.depositUnavailableReason = "Deposits from external wallets are not enabled on Mainnet.";
		act(() => {
			root.render(
				<I18nProvider i18n={i18n}>
					<MobileAccountView />
				</I18nProvider>,
			);
		});

		const depositButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
			(button) => button.textContent === "Deposit",
		);
		expect(depositButton?.disabled).toBe(true);
		expect(container.textContent).toContain("Deposits from external wallets are not enabled on Mainnet.");
		act(() => depositButton?.click());
		expect(modalActions.openDeposit).not.toHaveBeenCalled();
	});

	it("does not invite an email deposit while its action is unavailable", () => {
		testState.isConnected = false;
		testState.hasWalletAccess = false;
		testState.depositPath = "sponsored";
		testState.geoStatus = "unresolved";
		function render() {
			act(() =>
				root.render(
					<I18nProvider i18n={i18n}>
						<MobileAccountView />
					</I18nProvider>,
				),
			);
		}
		render();
		expect(container.textContent).not.toContain("Open Deposit to prepare your email wallet.");
		const button = container.querySelector<HTMLButtonElement>("button");
		expect(button?.disabled).toBe(true);
		act(() => button?.click());
		expect(modalActions.openDeposit).not.toHaveBeenCalled();
		testState.geoStatus = "allowed";
		render();
		expect(container.textContent).toContain("Open Deposit to prepare your email wallet.");
		expect(container.querySelector("button")).toBe(button);
		act(() => button?.click());
		expect(modalActions.openDeposit).toHaveBeenCalledExactlyOnceWith("deposit");
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

	it.each(["restricted", "unresolved"] as const)(
		"blocks every Perps / Spot entry and withdrawal when geo is %s",
		(geoStatus) => {
			testState.accountAbstraction = "disabled";
			testState.geoStatus = geoStatus;
			act(() => {
				root.render(
					<I18nProvider i18n={i18n}>
						<MobileAccountView />
					</I18nProvider>,
				);
			});

			const transferButtons = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).filter(
				(button) => button.textContent === "Perps / Spot",
			);
			expect(transferButtons).toHaveLength(1);
			for (const button of transferButtons) {
				expect(button.getAttribute("aria-disabled")).toBe("true");
				act(() => button.click());
			}
			const withdraw = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
				(button) => button.textContent === "Withdraw",
			);
			expect(withdraw).toBeUndefined();
			act(() => withdraw?.click());

			expect(modalActions.openTransfer).not.toHaveBeenCalled();
			expect(modalActions.openDeposit).not.toHaveBeenCalledWith("withdraw");
		},
	);
});
