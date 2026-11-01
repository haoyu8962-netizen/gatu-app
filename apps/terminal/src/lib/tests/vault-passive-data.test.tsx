// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const OWNER = "0x2222222222222222222222222222222222222222" as const;
const VAULT = "0x0000000000000000000000000000000000000001" as const;
const LEADER = "0x0000000000000000000000000000000000000002" as const;

const transport = vi.hoisted(() => ({
	answers: new Map<string, () => Promise<unknown>>(),
	requestAction: vi.fn(),
	actionInputs: [] as Array<{ detailCurrent?: boolean; owner: { status: string } }>,
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@tanstack/react-router", () => ({
	Link: ({ children, className }: { children?: ReactNode; className?: string }) => (
		<a href="/vaults" className={className}>
			{children}
		</a>
	),
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/stores/use-global-settings-store", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/stores/use-global-settings-store")>()),
	useIsTestnet: () => false,
}));
vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({ address: OWNER, sessionMode: "wallet", walletAddress: OWNER }),
}));
vi.mock("@/components/dashboard/dashboard-chrome", () => ({
	DashboardHeader: () => null,
	FooterBar: () => null,
	GlobalModals: () => null,
}));
vi.mock("@/components/dashboard/dashboard-frame-view", () => ({
	DashboardFrameView: ({ main }: { main: ReactNode }) => <main>{main}</main>,
}));
vi.mock("@/components/vaults/vault-action-modal", () => ({ VaultActionModal: () => null }));
vi.mock("@/components/vaults/vaults-fixture", () => ({
	getVaultDetailFixtureFromLocation: () => null,
	getVaultsFixtureFromLocation: () => null,
	VaultDetailFixture: () => null,
	VaultsFixture: () => null,
}));
vi.mock("@/components/vaults/use-vault-action-controller", async () => {
	const { deriveVaultActionsAvailability } = await import("@/components/vaults/domain/vaults");
	return {
		useVaultActionController: (input: Parameters<typeof deriveVaultActionsAvailability>[0]) => {
			transport.actionInputs.push(input);
			return {
				action: null,
				availableAmount: null,
				maxAmount: null,
				minimumAmount: null,
				belowMinimum: false,
				actionAvailability: deriveVaultActionsAvailability({
					...input,
					ownerAddress: OWNER,
					request: { available: true, reason: null },
					sessionMode: "wallet",
				}),
				canReview: false,
				canConfirm: false,
				requestAction: transport.requestAction,
				setAmount: vi.fn(),
				review: vi.fn(),
				back: vi.fn(),
				confirm: vi.fn(),
				retry: vi.fn(),
				verifyAgain: vi.fn(),
				close: vi.fn(),
			};
		},
	};
});
vi.mock("@/lib/hyperliquid", () => {
	function answer(method: string): Promise<unknown> {
		const next = transport.answers.get(method);
		if (!next) return Promise.reject(new Error(`No transport answer for ${method}`));
		return next();
	}
	return {
		getExplorerAddressUrl: (address: string) => `https://explorer.test/${address}`,
		getExplorerTxUrl: (hash: string) => `https://explorer.test/${hash}`,
		useActiveAgentOwner: () => null,
		useHyperliquid: () => ({ env: "Mainnet" }),
		useInfo: (method: string, params: unknown, options: { enabled?: boolean } = {}) =>
			useQuery({
				queryKey: ["hl", "Mainnet", method, params],
				queryFn: () => answer(method),
				enabled: options.enabled ?? true,
				retry: false,
				staleTime: Number.POSITIVE_INFINITY,
			}),
		usePublicVaults: (options: { retry?: boolean } = {}) =>
			useQuery({
				...options,
				queryKey: ["hl", "public-stats", "vaults", "Mainnet"],
				queryFn: () => answer("publicVaults"),
				retry: false,
				staleTime: Number.POSITIVE_INFINITY,
			}),
	};
});

import { VaultDetailPage, VaultsPage } from "@/components/vaults/vaults-page";

function snapshotWindow() {
	return {
		accountValueHistory: [
			[1, "100"],
			[2, "110"],
		],
		pnlHistory: [
			[1, "0"],
			[2, "10"],
		],
		vlm: "1000",
	};
}

function rawDetail() {
	return {
		name: "Alpha Vault",
		vaultAddress: VAULT,
		leader: LEADER,
		description: "Market-making Vault",
		portfolio: [
			["day", snapshotWindow()],
			["week", snapshotWindow()],
			["month", snapshotWindow()],
			["allTime", snapshotWindow()],
		],
		apr: 0.1,
		followerState: null,
		leaderFraction: 0.1,
		leaderCommission: 0.1,
		followers: [],
		maxDistributable: 100,
		maxWithdrawable: 50,
		isClosed: false,
		relationship: { type: "normal" },
		allowDeposits: true,
		alwaysCloseOnWithdraw: false,
	};
}

function rawPublicVault() {
	const series = ["0", "1"];
	return {
		vaultAddress: VAULT,
		leader: LEADER,
		name: "Alpha Vault",
		tvl: "1000",
		apr: 0.1,
		isClosed: false,
		createTimeMillis: 1_786_000_000_000,
		relationship: { type: "normal" },
		pnlHistory: { day: series, week: series, month: series, allTime: series },
	};
}

function answerAll(overrides: Record<string, () => Promise<unknown>> = {}) {
	const defaults: Record<string, () => Promise<unknown>> = {
		vaultDetails: async () => rawDetail(),
		userVaultEquities: async () => [{ vaultAddress: VAULT, equity: "25", lockedUntilTimestamp: 1 }],
		leadingVaults: async () => [],
		publicVaults: async () => [rawPublicVault()],
	};
	for (const [method, next] of Object.entries({ ...defaults, ...overrides })) transport.answers.set(method, next);
}

function fail(): () => Promise<unknown> {
	return () => Promise.reject(new Error("upstream unavailable"));
}

describe("Vault pages passive data", () => {
	let client: QueryClient;
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
		client = new QueryClient({ defaultOptions: { queries: { gcTime: Number.POSITIVE_INFINITY } } });
		transport.answers.clear();
		transport.requestAction.mockReset();
		transport.actionInputs = [];
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
		for (let step = 0; step < 6; step += 1) {
			await act(async () => {
				await new Promise((resolve) => setTimeout(resolve, 0));
			});
		}
	}

	async function render(page: ReactNode) {
		await act(async () =>
			root.render(
				<QueryClientProvider client={client}>
					<I18nProvider i18n={i18n}>{page}</I18nProvider>
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
		expect(container.querySelector('[role="alert"]')).toBeNull();
		expect(container.textContent).not.toContain("unavailable");
		expect(container.textContent).not.toContain("could not be verified");
		expect(container.textContent).not.toContain("Refreshing Vault data");
		expect(container.textContent).not.toContain("Verifying the owner Vault balance");
	}

	describe("detail", () => {
		it("offers only a neutral Retry when the first detail request fails", async () => {
			answerAll({ vaultDetails: fail() });
			await render(<VaultDetailPage vaultAddress={VAULT} />);

			expectNoFailureCopy();
			expect(container.textContent).not.toContain("Vault details are unavailable");
			expect(retryButtons()).toHaveLength(1);

			answerAll();
			await act(async () => retryButtons()[0]?.click());
			await flush();
			expect(container.textContent).toContain("Alpha Vault");
			expect(button("Deposit")?.disabled).toBe(false);
		});

		it("keeps the page and its values through a failed detail refresh and disables both actions until one succeeds", async () => {
			await render(<VaultDetailPage vaultAddress={VAULT} />);
			expect(button("Deposit")?.disabled).toBe(false);
			expect(button("Withdraw")?.disabled).toBe(false);

			answerAll({ vaultDetails: fail() });
			await refetch("vaultDetails");
			expectNoFailureCopy();
			expect(container.querySelector("h1")?.textContent).toBe("Alpha Vault");
			expect(container.textContent).toContain("$25.00");
			expect(button("Deposit")?.disabled).toBe(true);
			expect(button("Withdraw")?.disabled).toBe(true);
			expect(transport.actionInputs.at(-1)?.detailCurrent).toBe(false);
			expect(retryButtons()).toHaveLength(1);

			answerAll();
			await act(async () => retryButtons()[0]?.click());
			await flush();
			expect(button("Deposit")?.disabled).toBe(false);
			expect(retryButtons()).toHaveLength(0);
		});

		it("keeps both actions enabled and shows no refresh text while a background refresh runs", async () => {
			await render(<VaultDetailPage vaultAddress={VAULT} />);
			answerAll({
				vaultDetails: () => new Promise(() => undefined),
				userVaultEquities: () => new Promise(() => undefined),
			});
			await refetch("vaultDetails");
			await refetch("userVaultEquities");

			expectNoFailureCopy();
			expect(button("Deposit")?.disabled).toBe(false);
			expect(button("Withdraw")?.disabled).toBe(false);
		});

		it("shows an unknown equity and a neutral Retry when the owner balance never loads", async () => {
			answerAll({ userVaultEquities: fail() });
			await render(<VaultDetailPage vaultAddress={VAULT} />);

			expectNoFailureCopy();
			expect(container.textContent).not.toContain("Your Vault balance could not be verified");
			expect(container.textContent).not.toContain("$0.00");
			expect(container.textContent).toContain("--");
			expect(button("Deposit")?.disabled).toBe(false);
			expect(button("Withdraw")?.disabled).toBe(true);
			expect(retryButtons()).toHaveLength(1);
		});

		it("keeps the owner balance received on this page through a failed refresh and disables only the withdrawal", async () => {
			await render(<VaultDetailPage vaultAddress={VAULT} />);
			answerAll({ userVaultEquities: fail() });
			await refetch("userVaultEquities");

			expectNoFailureCopy();
			expect(container.textContent).toContain("$25.00");
			expect(button("Deposit")?.disabled).toBe(false);
			expect(button("Withdraw")?.disabled).toBe(true);
			expect(transport.actionInputs.at(-1)?.owner.status).toBe("error");
			expect(retryButtons()).toHaveLength(1);
		});

		it("does not keep a detail cached before the page mounted when the page's own request fails", async () => {
			client.setQueryData(["hl", "Mainnet", "vaultDetails", { vaultAddress: VAULT, user: OWNER }], rawDetail());
			await render(<VaultDetailPage vaultAddress={VAULT} />);
			expect(container.querySelector("h1")?.textContent).toBe("Alpha Vault");

			answerAll({ vaultDetails: fail() });
			await refetch("vaultDetails");
			expectNoFailureCopy();
			expect(container.textContent).not.toContain("Alpha Vault");
			expect(button("Deposit")).toBeUndefined();
			expect(retryButtons()).toHaveLength(1);

			answerAll();
			await act(async () => retryButtons()[0]?.click());
			await flush();
			expect(container.querySelector("h1")?.textContent).toBe("Alpha Vault");
			expect(button("Deposit")?.disabled).toBe(false);
		});

		it("does not keep an owner balance cached before the page mounted when the page's own request fails", async () => {
			client.setQueryData(
				["hl", "Mainnet", "userVaultEquities", { user: OWNER }],
				[{ vaultAddress: VAULT, equity: "25", lockedUntilTimestamp: 1 }],
			);
			await render(<VaultDetailPage vaultAddress={VAULT} />);
			expect(container.textContent).toContain("$25.00");

			answerAll({ userVaultEquities: fail() });
			await refetch("userVaultEquities");
			expectNoFailureCopy();
			expect(container.textContent).not.toContain("$25.00");
			expect(container.textContent).toContain("--");
			expect(button("Withdraw")?.disabled).toBe(true);
			expect(retryButtons()).toHaveLength(1);

			answerAll();
			await act(async () => retryButtons()[0]?.click());
			await flush();
			expect(container.textContent).toContain("$25.00");
			expect(button("Withdraw")?.disabled).toBe(false);
		});

		it("keeps the owner-loading wait silent", async () => {
			answerAll({ userVaultEquities: () => new Promise(() => undefined) });
			await render(<VaultDetailPage vaultAddress={VAULT} />);

			expectNoFailureCopy();
			expect(button("Withdraw")?.disabled).toBe(true);
			expect(button("Withdraw")?.hasAttribute("aria-describedby")).toBe(false);
			expect(container.textContent).not.toContain("No withdrawable Vault equity");
			expect(retryButtons()).toHaveLength(0);
		});
	});

	describe("list", () => {
		it("offers only a neutral Retry when the public feed never loads", async () => {
			answerAll({ publicVaults: fail() });
			await render(<VaultsPage />);

			expectNoFailureCopy();
			expect(container.textContent).not.toContain("Vault data is unavailable");
			expect(retryButtons()).toHaveLength(1);
		});

		it("keeps the rows from this page when a refresh fails", async () => {
			await render(<VaultsPage />);
			expect(container.textContent).toContain("Alpha Vault");

			answerAll({ publicVaults: fail() });
			await act(async () => button("Refresh")?.click());
			await flush();
			expectNoFailureCopy();
			expect(container.textContent).toContain("Alpha Vault");
		});

		it("draws no definitive empty Vault list from a feed whose refresh failed", async () => {
			answerAll({ publicVaults: async () => [] });
			await render(<VaultsPage />);
			expect(container.textContent).toContain("No Vaults were returned");

			answerAll({ publicVaults: fail() });
			await act(async () => button("Refresh")?.click());
			await flush();
			expect(container.textContent).not.toContain("No Vaults were returned");
			expectNoFailureCopy();
			expect(retryButtons()).toHaveLength(1);
		});

		it("offers only a neutral Retry when an account filter's snapshots fail", async () => {
			answerAll({ userVaultEquities: fail() });
			await render(<VaultsPage />);
			await act(async () => button("Deposited")?.click());
			await flush();

			expectNoFailureCopy();
			expect(container.textContent).not.toContain("Account Vault data could not be verified");
			expect(retryButtons()).toHaveLength(1);
		});

		it("draws no definitive empty filter result from account snapshots whose refresh failed", async () => {
			answerAll({ userVaultEquities: async () => [] });
			await render(<VaultsPage />);
			await act(async () => button("Deposited")?.click());
			await flush();
			expect(container.textContent).toContain("No Vaults in this filter");

			answerAll({ userVaultEquities: fail() });
			await refetch("userVaultEquities");
			expect(container.textContent).not.toContain("No Vaults in this filter");
			expectNoFailureCopy();
			expect(retryButtons()).toHaveLength(1);
		});

		it("draws no definitive empty filter result from a public list kept after a failed refresh", async () => {
			answerAll({ userVaultEquities: async () => [] });
			await render(<VaultsPage />);
			await act(async () => button("Deposited")?.click());
			await flush();
			expect(container.textContent).toContain("No Vaults in this filter");

			answerAll({
				publicVaults: fail(),
				userVaultEquities: async () => [
					{ vaultAddress: "0x0000000000000000000000000000000000000003", equity: "5", lockedUntilTimestamp: 1 },
				],
			});
			await act(async () => button("Refresh")?.click());
			await flush();
			expect(container.textContent).not.toContain("No Vaults in this filter");
			expectNoFailureCopy();
			expect(retryButtons()).toHaveLength(1);
		});

		it("does not keep a public list cached before the page mounted when the page's own request fails", async () => {
			client.setQueryData(["hl", "public-stats", "vaults", "Mainnet"], [rawPublicVault()]);
			await render(<VaultsPage />);
			expect(container.textContent).toContain("Alpha Vault");

			answerAll({ publicVaults: fail() });
			await act(async () => button("Refresh")?.click());
			await flush();
			expectNoFailureCopy();
			expect(container.textContent).not.toContain("Alpha Vault");
			expect(retryButtons()).toHaveLength(1);
		});
	});
});
