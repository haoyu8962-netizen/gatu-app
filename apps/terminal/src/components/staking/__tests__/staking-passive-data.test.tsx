// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StakingView } from "../staking-view";
import { useStakingController } from "../use-staking-controller";

const OWNER = "0x1111111111111111111111111111111111111111" as const;
const VALIDATOR = "0x3333333333333333333333333333333333333333" as const;
const SIGNER = "0x4444444444444444444444444444444444444444" as const;
const HASH = `0x${"ab".repeat(32)}` as const;

type Method =
	| "validatorSummaries"
	| "delegatorSummary"
	| "delegations"
	| "delegatorRewards"
	| "delegatorHistory"
	| "spotClearinghouseState"
	| "userFees";

const transport = vi.hoisted(() => ({
	answers: new Map<string, () => Promise<unknown>>(),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@sairn/hl-react", () => ({ useActiveAgentOwner: () => null }));
vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useReconnectWallet: () => ({ reconnectWallet: vi.fn(), isReconnecting: false }),
	useWalletSession: () => ({
		address: OWNER,
		hasWalletAccess: true,
		sessionMode: "wallet",
		walletAddress: OWNER,
	}),
}));
vi.mock("@/lib/hyperliquid", () => ({
	getExplorerTxUrl: (hash: string) => `https://explorer.test/${hash}`,
	useHyperliquid: () => ({ env: "Mainnet" }),
	useInfo: (method: string, params: unknown, options: { enabled?: boolean; staleTime?: number } = {}) =>
		useQuery({
			queryKey: ["hl", "Mainnet", method, params],
			queryFn: () => {
				const answer = transport.answers.get(method);
				if (!answer) throw new Error(`No transport answer for ${method}`);
				return answer();
			},
			enabled: options.enabled ?? true,
			retry: false,
			staleTime: Number.POSITIVE_INFINITY,
		}),
}));

function validator() {
	return {
		validator: VALIDATOR,
		signer: SIGNER,
		name: "Verified Validator",
		description: "Fixture",
		nRecentBlocks: 10,
		stake: 100_000_000,
		isJailed: false,
		unjailableAfter: null,
		isActive: true,
		commission: "0.03",
		stats: [
			["day", { uptimeFraction: "1", predictedApr: "0.02", nSamples: 1 }],
			["week", { uptimeFraction: "1", predictedApr: "0.03", nSamples: 7 }],
			["month", { uptimeFraction: "1", predictedApr: "0.04", nSamples: 30 }],
		],
	};
}

const SUCCESS: Record<Method, unknown> = {
	validatorSummaries: [validator()],
	delegatorSummary: { delegated: "5", undelegated: "2", totalPendingWithdrawal: "1", nPendingWithdrawals: 1 },
	delegations: [{ validator: VALIDATOR, amount: "5", lockedUntilTimestamp: 1_700_000_000_000 }],
	delegatorRewards: [{ time: 1_700_000_000_000, source: "delegation", totalAmount: "0.1" }],
	delegatorHistory: [{ time: 1_700_000_000_000, hash: HASH, delta: { cDeposit: { amount: "7" } } }],
	spotClearinghouseState: { balances: [{ coin: "HYPE", token: 150, total: "9", hold: "1", entryNtl: "0" }] },
	userFees: { stakingLink: null },
};

function answerAll(overrides: Partial<Record<Method, () => Promise<unknown>>> = {}) {
	for (const method of Object.keys(SUCCESS) as Method[]) {
		transport.answers.set(method, overrides[method] ?? (async () => SUCCESS[method]));
	}
}

function fail(): () => Promise<unknown> {
	return async () => {
		throw new Error("upstream unavailable");
	};
}

function StakingProbe() {
	const controller = useStakingController();
	return <StakingView {...controller} onActionSubmit={vi.fn()} actionsEnabled />;
}

describe("staking passive data", () => {
	let client: QueryClient;
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
		Object.defineProperty(window, "matchMedia", {
			configurable: true,
			value: vi.fn().mockReturnValue({ addEventListener: vi.fn(), matches: false, removeEventListener: vi.fn() }),
		});
		client = new QueryClient({ defaultOptions: { queries: { gcTime: Number.POSITIVE_INFINITY } } });
		transport.answers.clear();
		answerAll();
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
		for (let step = 0; step < 4; step += 1) {
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
						<StakingProbe />
					</I18nProvider>
				</QueryClientProvider>,
			),
		);
		await flush();
	}

	async function refetchAll() {
		await act(async () => {
			void client.refetchQueries();
		});
		await flush();
	}

	function button(label: string): HTMLButtonElement | undefined {
		return [...container.querySelectorAll<HTMLButtonElement>("button")].find(
			(candidate) => candidate.textContent?.trim() === label,
		);
	}

	function retryButtons(): HTMLButtonElement[] {
		return [...container.querySelectorAll<HTMLButtonElement>("button")].filter(
			(candidate) => candidate.textContent?.trim() === "Retry",
		);
	}

	function expectNoFailureCopy() {
		const alerts = [...container.querySelectorAll('[role="alert"]')].filter(
			(alert) => !alert.textContent?.includes("Rewards compound automatically"),
		);
		expect(alerts).toEqual([]);
		expect(container.textContent).not.toContain("unavailable");
		expect(container.textContent).not.toContain("could not be verified");
		expect(container.textContent).not.toContain("Balances remain unknown");
		expect(container.textContent).not.toContain("Refreshing staking data");
	}

	it("shows only a neutral Retry and unknown balances when the account data never loads", async () => {
		answerAll({ delegatorSummary: fail() });
		await render();

		expectNoFailureCopy();
		expect(container.textContent).not.toContain("0 HYPE");
		expect(container.textContent).toContain("--");
		expect(button("Spot to staking")?.disabled).toBe(true);
		expect(retryButtons()).toHaveLength(1);
		expect(container.textContent).toContain("Verified Validator");

		answerAll();
		await act(async () => retryButtons()[0]?.click());
		await flush();
		expect(button("Spot to staking")?.disabled).toBe(false);
		expect(retryButtons()).toHaveLength(0);
	});

	it("keeps balances received on this page through a failed refresh and disables the actions until one succeeds", async () => {
		await render();
		expect(container.textContent).toContain("8 HYPE");
		expect(button("Spot to staking")?.disabled).toBe(false);

		answerAll({ spotClearinghouseState: fail() });
		await refetchAll();
		expectNoFailureCopy();
		expect(container.textContent).toContain("8 HYPE");
		expect(container.textContent).toContain("Master wallet verified");
		expect(button("Spot to staking")?.disabled).toBe(true);
		expect(button("Staking to Spot")?.disabled).toBe(true);
		expect(button("Delegate")?.disabled).toBe(true);
		expect(retryButtons()).toHaveLength(1);

		answerAll();
		await act(async () => retryButtons()[0]?.click());
		await flush();
		expect(button("Spot to staking")?.disabled).toBe(false);
		expect(retryButtons()).toHaveLength(0);
	});

	it("keeps validators received on this page through a failed refresh and holds only delegation", async () => {
		await render();
		expect(button("Delegate")?.disabled).toBe(false);

		answerAll({ validatorSummaries: fail() });
		await refetchAll();
		expectNoFailureCopy();
		expect(container.textContent).toContain("Verified Validator");
		expect(button("Delegate")?.disabled).toBe(true);
		expect(button("Spot to staking")?.disabled).toBe(false);
		expect(retryButtons()).toHaveLength(1);
	});

	it("keeps actions available and shows no refresh text while a background refresh runs", async () => {
		await render();
		answerAll({ delegatorSummary: () => new Promise(() => undefined) });
		await refetchAll();

		expectNoFailureCopy();
		expect(button("Spot to staking")?.disabled).toBe(false);
		expect(container.textContent).toContain("8 HYPE");
	});

	it("does not keep account data cached before the page read it once a request fails", async () => {
		client.setQueryData(["hl", "Mainnet", "delegatorSummary", { user: OWNER }], SUCCESS.delegatorSummary);
		await render();
		expect(container.textContent).toContain("5 HYPE");

		answerAll({ delegatorSummary: fail() });
		await refetchAll();

		expect(container.textContent).not.toContain("5 HYPE");
		expect(container.textContent).not.toContain("Master wallet verified");
		expect(button("Spot to staking")?.disabled).toBe(true);
		expect(retryButtons()).toHaveLength(1);
		expectNoFailureCopy();
	});

	it("draws no empty conclusion from a reward list whose refresh failed", async () => {
		answerAll({ delegatorRewards: async () => [] });
		await render();
		act(() => button("Staking rewards")?.click());
		expect(container.textContent).toContain("No staking rewards");

		answerAll({ delegatorRewards: fail() });
		await refetchAll();
		expect(container.textContent).not.toContain("No staking rewards");
		expectNoFailureCopy();
		expect(retryButtons().length).toBeGreaterThanOrEqual(1);
	});

	it("shows only a neutral Retry in the validator table when validators never load", async () => {
		answerAll({ validatorSummaries: fail() });
		await render();

		expectNoFailureCopy();
		expect(container.textContent).not.toContain("Validator data unavailable");
		expect(container.textContent).not.toContain("≈ 0 HYPE");
		expect(container.textContent).not.toContain("0 HYPE");
		expect(retryButtons()).toHaveLength(1);
	});
});
