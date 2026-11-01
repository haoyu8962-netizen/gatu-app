// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReferralDashboard } from "@/components/referrals/referral-dashboard";
import { createI18nRoot } from "./harness/react";

const REASON = "This phone uses a desktop-approved trading key. This action needs the master wallet on desktop.";

const testState = vi.hoisted(() => ({
	sessionMode: "agent-only" as "wallet" | "agent-only" | "disconnected",
	hasWalletAccess: false,
	reconnectWallet: vi.fn(),
	refetchSigner: vi.fn(),
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({
		hasWalletAccess: testState.hasWalletAccess,
		isConnected: true,
		sessionMode: testState.sessionMode,
	}),
	useReconnectWallet: () => ({ reconnectWallet: testState.reconnectWallet, isReconnecting: false }),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useHyperliquid: () => ({ env: "Mainnet" }),
	useTradingStatus: () => ({ refetchSigner: testState.refetchSigner, signerMode: "agent" }),
}));

vi.mock("@/hooks/trade/use-referral-legal-gate", () => ({
	useReferralLegalGate: () => ({ state: "accepted", identity: "owner" }),
}));

vi.mock("@/hooks/trade/use-referral-actions", () => ({
	useReferralActions: () => ({
		identity: { clientKey: "0x1111111111111111111111111111111111111111", env: "Mainnet", walletAddress: undefined },
		isPending: false,
		submit: vi.fn(),
	}),
}));

vi.mock("@/hooks/trade/use-referrals", () => ({
	useReferrals: () => ({
		status: "ready",
		data: {
			cumVlm: "0",
			referredBy: null,
			referrerState: { stage: "needToCreateCode", data: {} },
			rewardHistory: [],
			tokenToState: [],
		},
		usdcRewardsEarned: "1",
		hasUnclaimedRewards: true,
		unclaimedRewardRows: [],
		rewardRows: [],
		claimHistory: [],
		claimHistoryCanConfirmEmpty: false,
		claimHistoryRefreshing: false,
		claimHistoryStatus: "idle",
		discountPercent: null,
		isCurrent: true,
		isRefreshing: false,
		retry: vi.fn(),
		retryClaimHistory: vi.fn(),
		tokenMetadata: new Map(),
	}),
}));

vi.mock("@/components/referrals/referral-summary-cards", () => ({ ReferralSummaryCards: () => null }));
vi.mock("@/components/referrals/referral-rewards-card", () => ({ ReferralRewardsCard: () => null }));
vi.mock("@/components/referrals/referral-activity", () => ({ ReferralActivity: () => null }));
vi.mock("@/components/referrals/referral-action-modal", () => ({
	ReferralActionModal: () => <div data-testid="referral-action-modal" />,
}));
vi.mock("@/components/trade/components/establish-connection-modal", () => ({ EstablishConnectionModal: () => null }));
vi.mock("@/components/trade/components/legal-acceptance-modal", () => ({ LegalAcceptanceModal: () => null }));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("ReferralDashboard in an Agent-only session", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		testState.sessionMode = "agent-only";
		testState.hasWalletAccess = false;
		testState.reconnectWallet.mockReset();
		testState.refetchSigner.mockReset();
		i18n.loadAndActivate({ locale: "en", messages: {} });
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("keeps claim, create and apply visible but disabled with the one desktop-required reason", () => {
		act(() => root.render(<ReferralDashboard initialReferralCode="FRIEND" />));

		const actions = [...container.querySelectorAll<HTMLButtonElement>("button")].filter((button) =>
			["Claim rewards", "Create referral code", "Review invitation"].includes(button.textContent ?? ""),
		);
		expect(actions.map((button) => button.textContent).sort()).toEqual([
			"Claim rewards",
			"Claim rewards",
			"Create referral code",
			"Review invitation",
		]);
		for (const action of actions) {
			expect(action.disabled || action.getAttribute("aria-disabled") === "true").toBe(true);
			const reasonId = action.getAttribute("aria-describedby");
			expect(reasonId ? document.getElementById(reasonId)?.textContent : null).toBe(REASON);
			act(() => action.click());
		}
		expect(testState.reconnectWallet).not.toHaveBeenCalled();
		expect(testState.refetchSigner).not.toHaveBeenCalled();
		expect(container.querySelector('[data-testid="referral-action-modal"]')).toBeNull();
		expect(container.textContent).not.toContain("Connect");
	});

	it("keeps the actions enabled in an ordinary wallet session", () => {
		testState.sessionMode = "wallet";
		testState.hasWalletAccess = true;
		act(() => root.render(<ReferralDashboard />));

		const claim = container.querySelector<HTMLButtonElement>('[data-referral-claim-surface="mobile"]');
		expect(claim?.disabled).toBe(false);
		expect(container.textContent).not.toContain(REASON);
	});
});
