// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReferralDashboard } from "@/components/referrals/referral-dashboard";

const OWNER = "0x1111111111111111111111111111111111111111" as const;

const transport = vi.hoisted(() => ({
	referral: vi.fn(),
	ledger: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useReconnectWallet: () => ({ reconnectWallet: vi.fn(), isReconnecting: false }),
	useWalletSession: () => ({ address: OWNER, hasWalletAccess: true, isConnected: true, sessionMode: "wallet" }),
}));
vi.mock("@/hooks/trade/use-referral-legal-gate", () => ({
	useReferralLegalGate: () => ({ state: "accepted", identity: "owner" }),
}));
vi.mock("@/hooks/trade/use-referral-actions", () => ({
	useReferralActions: () => ({
		identity: { clientKey: OWNER, env: "Mainnet", walletAddress: OWNER },
		isPending: false,
		submit: vi.fn(),
	}),
}));
vi.mock("@/components/referrals/referral-action-modal", () => ({ ReferralActionModal: () => null }));
vi.mock("@/components/trade/components/establish-connection-modal", () => ({ EstablishConnectionModal: () => null }));
vi.mock("@/components/trade/components/legal-acceptance-modal", () => ({ LegalAcceptanceModal: () => null }));
vi.mock("@/lib/hyperliquid", () => ({
	useHyperliquid: () => ({
		env: "Mainnet",
		info: {
			subAccounts: async () => [],
			userNonFundingLedgerUpdates: (...args: unknown[]) => transport.ledger(...args),
		},
	}),
	useInfo: (
		method: string,
		params: unknown,
		options: { enabled?: boolean; select?: (value: unknown) => unknown } = {},
	) =>
		useQuery({
			queryKey: ["hl", "Mainnet", method, params],
			queryFn: async () => {
				if (method === "referral") return transport.referral();
				if (method === "userFees") return { activeReferralDiscount: "0.04" };
				return { tokens: [{ index: 0, name: "USDC", weiDecimals: 8 }] };
			},
			enabled: options.enabled ?? true,
			retry: false,
			select: options.select,
			staleTime: Number.POSITIVE_INFINITY,
		}),
	useSubscription: () => ({ data: undefined, error: null, isStale: false, status: "idle" }),
	useTradingStatus: () => ({ refetchSigner: vi.fn(), signerMode: "agent" }),
}));

function referralResponse({ unclaimed = "2" }: { unclaimed?: string } = {}) {
	return {
		referredBy: null,
		cumVlm: "100",
		unclaimedRewards: unclaimed,
		claimedRewards: "1",
		builderRewards: "0",
		referrerState: { stage: "ready", data: { code: "FRIEND", nReferrals: 0, referralStates: [] } },
		rewardHistory: [],
		tokenToState: [[0, { cumVlm: "100", unclaimedRewards: unclaimed, claimedRewards: "1", builderRewards: "0" }]],
	};
}

function fail() {
	return Promise.reject(new Error("upstream unavailable"));
}

describe("referral passive data", () => {
	let client: QueryClient;
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
		client = new QueryClient({ defaultOptions: { queries: { gcTime: Number.POSITIVE_INFINITY } } });
		transport.referral.mockReset();
		transport.ledger.mockReset();
		transport.referral.mockImplementation(async () => referralResponse());
		transport.ledger.mockImplementation(async () => []);
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		client.clear();
	});

	async function flush() {
		for (let step = 0; step < 6; step += 1) {
			await act(async () => {
				await new Promise((resolve) => setTimeout(resolve, 0));
			});
		}
	}

	async function render() {
		await act(async () =>
			root.render(
				<QueryClientProvider client={client}>
					<I18nProvider i18n={i18n}>
						<ReferralDashboard />
					</I18nProvider>
				</QueryClientProvider>,
			),
		);
		await flush();
	}

	async function refetch(method: string) {
		await act(async () => {
			void client.refetchQueries({ queryKey: ["hl", "Mainnet", method] });
		});
		await flush();
	}

	async function refetchLedger() {
		await act(async () => {
			void client.refetchQueries({ queryKey: ["hl", "recent-history"] });
		});
		await flush();
	}

	function buttons(label: string): HTMLButtonElement[] {
		return [...container.querySelectorAll<HTMLButtonElement>("button")].filter(
			(candidate) => candidate.textContent?.trim() === label,
		);
	}

	async function openClaims() {
		const tab = [...container.querySelectorAll<HTMLElement>('[role="tab"]')].find((candidate) =>
			candidate.textContent?.includes("Recent reward claims"),
		);
		expect(tab).toBeDefined();
		await act(async () => tab?.click());
		await flush();
	}

	function expectNoFailureCopy() {
		expect(container.querySelector('[role="alert"]')).toBeNull();
		expect(container.textContent).not.toContain("Referral data unavailable");
		expect(container.textContent).not.toContain("could not be verified");
		expect(container.textContent).not.toContain("Refreshing referral data");
	}

	it("offers only a neutral Retry when the referral data never loads", async () => {
		transport.referral.mockImplementation(fail);
		await render();

		expectNoFailureCopy();
		expect(buttons("Retry")).toHaveLength(1);
		expect(container.textContent).not.toContain("Traders referred");

		transport.referral.mockImplementation(async () => referralResponse());
		await act(async () => buttons("Retry")[0]?.click());
		await flush();
		expect(container.textContent).toContain("Traders referred");
		expect(buttons("Retry")).toHaveLength(0);
	});

	it("keeps referral data from this page through a failed refresh and disables its actions until one succeeds", async () => {
		await render();
		expect(buttons("Claim rewards").every((button) => !button.disabled)).toBe(true);
		expect(container.textContent).toContain("No referred traders yet.");

		transport.referral.mockImplementation(fail);
		await refetch("referral");
		expectNoFailureCopy();
		expect(container.textContent).toContain("Traders referred");
		expect(container.textContent).toContain("Unclaimed USDC");
		expect(buttons("Claim rewards").length).toBeGreaterThan(0);
		expect(buttons("Claim rewards").every((button) => button.disabled)).toBe(true);
		expect(container.textContent).not.toContain("No referred traders yet.");
		expect(buttons("Retry").length).toBeGreaterThan(0);

		transport.referral.mockImplementation(async () => referralResponse());
		await act(async () => buttons("Retry")[0]?.click());
		await flush();
		expect(buttons("Claim rewards").every((button) => !button.disabled)).toBe(true);
		expect(buttons("Retry")).toHaveLength(0);
		expect(container.textContent).toContain("No referred traders yet.");
	});

	it("does not conclude that no rewards are claimable from a failed refresh", async () => {
		transport.referral.mockImplementation(async () => referralResponse({ unclaimed: "0" }));
		await render();
		expect(container.textContent).toContain("No unclaimed rewards are currently available.");

		transport.referral.mockImplementation(fail);
		await refetch("referral");
		expect(container.textContent).not.toContain("No unclaimed rewards are currently available.");
		expectNoFailureCopy();
	});

	it("shows no refresh text and keeps actions available while a background refresh runs", async () => {
		await render();
		transport.referral.mockImplementation(() => new Promise(() => undefined));
		await refetch("referral");

		expectNoFailureCopy();
		expect(buttons("Claim rewards").every((button) => !button.disabled)).toBe(true);
		expect(buttons("Retry")).toHaveLength(0);
	});

	it("keeps the claim history quiet while it loads and offers only a neutral Retry when it fails", async () => {
		let rejectLedger: ((error: Error) => void) | undefined;
		transport.ledger.mockImplementation(
			() =>
				new Promise((_resolve, reject) => {
					rejectLedger = reject;
				}),
		);
		await render();
		await openClaims();

		const loading = [...container.querySelectorAll<HTMLElement>("*")].find(
			(element) => element.children.length === 0 && element.textContent?.includes("Loading recent reward claims"),
		);
		expect(loading?.className).toContain("sr-only");
		expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();

		await act(async () => rejectLedger?.(new Error("ledger unavailable")));
		await flush();
		expectNoFailureCopy();
		expect(buttons("Retry")).toHaveLength(1);
	});

	it("draws no empty claim conclusion from a claim history whose refresh failed", async () => {
		await render();
		await openClaims();
		expect(container.textContent).toContain("No recent reward claims.");

		transport.ledger.mockImplementation(fail);
		await refetchLedger();
		expect(container.textContent).not.toContain("No recent reward claims.");
		expectNoFailureCopy();
		expect(buttons("Retry")).toHaveLength(1);
	});
});
