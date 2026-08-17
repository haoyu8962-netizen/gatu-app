// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileBalancesTab } from "@/components/trade/mobile/mobile-balances-tab";
import { BalancesTab } from "@/components/trade/positions/balances-tab";

const testState = vi.hoisted(() => ({
	depositAvailable: true,
	depositPath: "external" as "external" | "sponsored",
	depositUnavailableReason: null as string | null,
	isConnected: true,
	openDeposit: vi.fn(),
}));

vi.mock("@/hooks/trade/use-balance-rows", () => ({
	useBalanceRows: () => ({
		accountDataReady: true,
		accountModeReady: true,
		balances: [],
		hasError: false,
		internalTransfersEnabled: true,
		isConnected: testState.isConnected,
		isDataStale: false,
		isLoading: false,
		perpBalances: [],
		perpFundsActionsEnabled: true,
		showBalanceAccountType: false,
		spotBalanceRows: [],
	}),
}));

vi.mock("@/hooks/trade/use-deposit-availability", () => ({
	useDepositAvailability: () => ({
		available: testState.depositAvailable,
		path: testState.depositPath,
		unavailableLabel: "Deposit unavailable",
		unavailableReason: testState.depositUnavailableReason,
	}),
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
});
