// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { act, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PortfolioPage } from "@/components/portfolio/portfolio-page";
import { createI18nRoot } from "./harness/react";

const { FUNDS_REASON } = vi.hoisted(() => ({
	FUNDS_REASON:
		"This phone uses a desktop-approved trading key. Deposits, withdrawals and transfers need the master wallet on desktop.",
}));

const testState = vi.hoisted(() => ({
	isMobile: true,
	openDeposit: vi.fn(),
	openTransfer: vi.fn(),
	openSend: vi.fn(),
	openSwap: vi.fn(),
}));

vi.mock("@/components/dashboard/dashboard-chrome", () => ({
	DashboardHeader: () => null,
	FooterBar: () => null,
	GlobalModals: () => null,
}));
vi.mock("@/components/dashboard/dashboard-frame-view", () => ({
	DashboardFrameView: ({ main }: { main: ReactNode }) => <div>{main}</div>,
}));
vi.mock("@/components/trade/account-activity-feed-owner", () => ({ AccountActivityFeedOwner: () => null }));
vi.mock("@/components/trade/mobile/mobile-account-transfers-tab", () => ({ MobileAccountTransfersTab: () => null }));
vi.mock("@/components/trade/mobile/mobile-balances-tab", () => ({ MobileBalancesTab: () => null }));
vi.mock("@/components/trade/mobile/mobile-positions-view", () => ({ MobilePositionsView: () => null }));
vi.mock("@/components/trade/tradebox/account-mode-modal", () => ({ AccountModeModal: () => null }));
vi.mock("@/components/portfolio/portfolio-overview", () => ({ PortfolioOverview: () => null }));
vi.mock("@/lib/lazy", () => ({ createLazyComponent: () => () => null }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => testState.isMobile }));
vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({ hasWalletAccess: false, isConnected: true, sessionMode: "agent-only" }),
	useReconnectWallet: () => ({ reconnectWallet: vi.fn(), isReconnecting: false }),
}));
vi.mock("@/hooks/trade/use-account-balances", () => ({
	isSupportedAccountAbstraction: () => true,
	useDefaultDexBalances: () => ({
		accountAbstraction: "disabled",
		hasError: false,
		isDataStale: false,
		perpStateStatus: "success",
		spotStateStatus: "success",
	}),
}));
vi.mock("@/hooks/trade/use-account-abstraction-control", () => ({
	useAccountAbstractionControl: () => ({
		canSet: false,
		isLoading: false,
		isUpdating: false,
		portfolioMarginActivationEnabled: false,
		setAccountAbstraction: vi.fn(),
	}),
}));
vi.mock("@/hooks/trade/use-deposit-availability", () => ({
	useDepositAvailability: () => ({
		available: false,
		path: "external",
		reason: "agent-only-session",
		unavailableLabel: "Deposit unavailable",
		unavailableReason: FUNDS_REASON,
	}),
}));
vi.mock("@/hooks/trade/use-funds-action-availability", () => {
	const unavailable = { available: false, reason: "agent-only-session", unavailableReason: FUNDS_REASON };
	return {
		useFundsActionAvailability: () => ({
			assertFreshGeoAllowed: vi.fn(),
			internalTransfer: unavailable,
			withdrawal: unavailable,
		}),
	};
});
vi.mock("@/stores/use-global-modal-store", () => ({
	useDepositModalActions: () => ({ open: testState.openDeposit }),
	useSendModalActions: () => ({ open: testState.openSend }),
	useSwapModalActions: () => ({ openStablecoins: testState.openSwap }),
	useTransferModalActions: () => ({ open: testState.openTransfer }),
}));
vi.mock("@/stores/use-global-settings-store", () => ({ useIsTestnet: () => false }));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("PortfolioPage in an Agent-only session", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it.each([true, false])("shows every funds action disabled with one visible reason (mobile: %s)", (isMobile) => {
		testState.isMobile = isMobile;
		act(() => root.render(<PortfolioPage />));

		const labels = [
			"Swap Stablecoins",
			"Perps / Spot",
			"Send",
			"Withdraw",
			isMobile ? "Deposit" : "Deposit unavailable",
		];
		const actions = [...container.querySelectorAll<HTMLButtonElement>("button")].filter((button) =>
			labels.includes(button.textContent ?? ""),
		);
		expect(actions.map((button) => button.textContent)).toEqual(labels);
		for (const action of actions) {
			expect(action.disabled || action.getAttribute("aria-disabled") === "true").toBe(true);
			const reasonId = action.getAttribute("aria-describedby");
			const reason = reasonId ? document.getElementById(reasonId) : null;
			expect(reason?.textContent).toContain(FUNDS_REASON);
			act(() => action.click());
		}
		expect(container.textContent?.split(FUNDS_REASON).length).toBe(2);
		expect(testState.openDeposit).not.toHaveBeenCalled();
		expect(testState.openTransfer).not.toHaveBeenCalled();
		expect(testState.openSend).not.toHaveBeenCalled();
		expect(testState.openSwap).not.toHaveBeenCalled();
	});
});
