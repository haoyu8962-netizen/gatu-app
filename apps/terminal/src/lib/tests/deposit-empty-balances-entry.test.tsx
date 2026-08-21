// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileBalancesTab } from "@/components/trade/mobile/mobile-balances-tab";
import { BalancesTab } from "@/components/trade/positions/balances-tab";

vi.mock("@/components/trade/components/asset-display", () => ({
	AssetDisplay: ({ coin }: { coin: string }) => <span>{coin}</span>,
}));

vi.mock("@/components/ui/scroll-area", () => ({
	ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const testState = vi.hoisted(() => ({
	depositAvailable: true,
	depositPath: "external" as "external" | "sponsored",
	depositUnavailableReason: null as string | null,
	fundsActionAvailable: true,
	hasBalance: false,
	isConnected: true,
	openDeposit: vi.fn(),
}));

vi.mock("@/hooks/trade/use-balance-rows", () => ({
	useBalanceRows: () => {
		const rows = testState.hasBalance
			? [
					{
						asset: "USDC",
						available: "10",
						entryNtl: "0",
						inOrder: "0",
						total: "10",
						transferable: "10",
						type: "spot" as const,
						usdValue: "10",
					},
				]
			: [];
		return {
			accountDataReady: true,
			accountModeReady: true,
			balances: rows,
			hasError: false,
			internalTransfersEnabled: true,
			isConnected: testState.isConnected,
			isDataStale: false,
			isLoading: false,
			perpBalances: [],
			perpFundsActionsEnabled: true,
			showBalanceAccountType: false,
			spotBalanceRows: rows,
		};
	},
}));

vi.mock("@/hooks/trade/use-deposit-availability", () => ({
	useDepositAvailability: () => ({
		available: testState.depositAvailable,
		path: testState.depositPath,
		unavailableLabel: "Deposit unavailable",
		unavailableReason: testState.depositUnavailableReason,
	}),
}));

vi.mock("@/hooks/trade/use-funds-action-availability", () => ({
	useFundsActionAvailability: () => ({
		assertFreshGeoAllowed: vi.fn(),
		internalTransfer: {
			available: testState.fundsActionAvailable,
			reason: testState.fundsActionAvailable ? null : "geo-unresolved",
			unavailableReason: testState.fundsActionAvailable ? null : "Regional availability is unavailable.",
		},
		withdrawal: {
			available: testState.fundsActionAvailable,
			reason: testState.fundsActionAvailable ? null : "geo-unresolved",
			unavailableReason: testState.fundsActionAvailable ? null : "Regional availability is unavailable.",
		},
	}),
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({ hasWalletAccess: testState.isConnected }),
}));

vi.mock("@/lib/hyperliquid/markets/use-spot-tokens", () => ({
	useSpotTokens: () => ({ getToken: () => undefined }),
}));

vi.mock("@/lib/number-format-reactivity", () => ({
	useNumberFormatRevision: () => undefined,
}));

vi.mock("@/stores/use-global-modal-store", () => ({
	useDepositModalActions: () => ({ open: testState.openDeposit }),
	useSwapModalActions: () => ({ open: vi.fn() }),
}));

vi.mock("@/stores/use-global-settings-store", () => ({
	getResolvedFormatLocale: () => "en-US",
	useGlobalSettingsActions: () => ({ setHideSmallBalances: vi.fn() }),
	useHideSmallBalances: () => true,
}));

vi.mock("@/components/trade/positions/send-modal", () => ({ SendModal: () => null }));
vi.mock("@/components/trade/positions/transfer-modal", () => ({ TransferModal: () => null }));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("empty balance Deposit entries", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		testState.depositAvailable = true;
		testState.depositPath = "external";
		testState.depositUnavailableReason = null;
		testState.fundsActionAvailable = true;
		testState.hasBalance = false;
		testState.isConnected = true;
		testState.openDeposit.mockReset();
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	function renderEntries() {
		act(() => {
			root.render(
				<I18nProvider i18n={i18n}>
					<BalancesTab />
					<MobileBalancesTab />
				</I18nProvider>,
			);
		});
	}

	it("opens Deposit from both desktop and mobile when the path is available", () => {
		renderEntries();
		const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).filter(
			(button) => button.textContent === "Deposit",
		);
		expect(buttons).toHaveLength(2);
		for (const button of buttons) act(() => button.click());
		expect(testState.openDeposit).toHaveBeenCalledTimes(2);
	});

	it("shows a reason and cannot open Deposit when the release path is unavailable", () => {
		testState.depositAvailable = false;
		testState.depositUnavailableReason = "Deposits from external wallets are not enabled on Mainnet.";
		renderEntries();

		const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).filter(
			(button) => button.textContent === "Deposit unavailable",
		);
		expect(buttons).toHaveLength(2);
		for (const button of buttons) {
			expect(button.disabled).toBe(true);
			expect(button.getAttribute("aria-label") ?? button.textContent).toBe("Deposit unavailable");
			act(() => button.click());
		}
		expect(container.textContent?.match(/Deposits from external wallets are not enabled on Mainnet\./g)).toHaveLength(
			2,
		);
		expect(testState.openDeposit).not.toHaveBeenCalled();
	});

	it("offers the sponsored Deposit path before the email signer is connected", () => {
		testState.depositPath = "sponsored";
		testState.isConnected = false;
		renderEntries();

		const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).filter(
			(button) => button.textContent === "Deposit",
		);
		expect(buttons).toHaveLength(2);
		for (const button of buttons) act(() => button.click());
		expect(testState.openDeposit).toHaveBeenCalledTimes(2);
	});

	it("does not expose transfer or withdrawal entries while funds actions are blocked", () => {
		testState.fundsActionAvailable = false;
		testState.hasBalance = true;
		renderEntries();

		const labels = Array.from(container.querySelectorAll<HTMLButtonElement>("button"), (button) => button.textContent);
		expect(labels).not.toContain("Transfer");
		expect(labels).not.toContain("To Perp");
		expect(labels).not.toContain("Withdraw");
	});
});
