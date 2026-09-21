// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Toaster, toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	clearFundsActionMarkersForTests,
	FUNDS_ACTION_MARKER_STORAGE_KEY,
	type FundsActionReference,
	getFundsActionMarkers,
	persistFundsActionMarker,
} from "@/components/funds-action/funds-action-marker";
import { getFundsActionHistoryStartTime } from "@/components/funds-action/funds-action-reconciliation";
import { FundsActionRecoveryHost } from "@/components/funds-action/funds-action-recovery-host";
import { formatDateTime } from "@/lib/format";

const WALLET_OWNER = "0x1111111111111111111111111111111111111111" as const;
const AGENT_OWNER = "0x2222222222222222222222222222222222222222" as const;
const VAULT = "0x4444444444444444444444444444444444444444" as const;
const OLD_HASH = `0x${"aa".repeat(32)}`;
const NEW_HASH = `0x${"bb".repeat(32)}`;

const mocks = vi.hoisted(() => ({
	clientKey: "0x1111111111111111111111111111111111111111" as string,
	env: "Mainnet" as "Mainnet" | "Testnet",
	sessionMode: "wallet" as "wallet" | "agent-only" | "disconnected",
	activeAgentOwner: null as { env: "Mainnet" | "Testnet"; address: `0x${string}` } | null,
	infoCalls: [] as Array<{ method: string; params: Record<string, unknown> }>,
	isMobile: false,
	vaultHistory: [] as unknown[],
	stakingHistory: [] as unknown[],
}));

vi.mock("@gatu/ui", () => ({
	AdaptiveModal: ({ children, open, presentation }: { children: ReactNode; open: boolean; presentation?: string }) =>
		open ? (
			<section data-presentation={presentation} data-testid="recovery-modal">
				{children}
			</section>
		) : null,
	Button: ({ children, disabled, onClick }: { children: ReactNode; disabled?: boolean; onClick?: () => void }) => (
		<button type="button" disabled={disabled} onClick={onClick}>
			{children}
		</button>
	),
	ModalContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	ModalFooter: ({ children }: { children: ReactNode }) => <footer>{children}</footer>,
	ModalHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
	ModalTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("@/hooks/use-mobile", () => ({
	useIsMobile: () => mocks.isMobile,
}));

vi.mock("@tanstack/react-router", () => ({
	Link: ({ children }: { children: ReactNode }) => <a href="/related">{children}</a>,
}));

vi.mock("@/lib/hyperliquid", () => ({
	useActiveAgentOwner: () => mocks.activeAgentOwner,
	useHyperliquid: () => ({ clientKey: mocks.clientKey, env: mocks.env, sessionMode: mocks.sessionMode }),
	useInfo: (method: string, params: Record<string, unknown>) => {
		mocks.infoCalls.push({ method, params });
		return {
			data: method === "userNonFundingLedgerUpdates" ? mocks.vaultHistory : mocks.stakingHistory,
			error: null,
			isLoading: false,
			refetch: vi.fn(),
		};
	},
}));

describe("FundsActionRecoveryHost", async () => {
	let container: HTMLDivElement;
	let root: Root;
	let originalLocks: PropertyDescriptor | undefined;

	beforeEach(() => {
		vi.useFakeTimers();
		i18n.loadAndActivate({ locale: "en", messages: {} });
		mocks.clientKey = WALLET_OWNER;
		mocks.env = "Mainnet";
		mocks.sessionMode = "wallet";
		mocks.activeAgentOwner = null;
		mocks.infoCalls = [];
		mocks.isMobile = false;
		mocks.vaultHistory = [];
		mocks.stakingHistory = [];
		clearFundsActionMarkersForTests();
		originalLocks = Object.getOwnPropertyDescriptor(navigator, "locks");
		Object.defineProperty(navigator, "locks", {
			configurable: true,
			value: {
				request: vi.fn(
					async (
						_name: string,
						_options: { mode: "exclusive" },
						callback: (lock: { name: string; mode: "exclusive" }) => unknown,
					) => callback({ name: _name, mode: "exclusive" }),
				),
			},
		});
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(async () => {
		act(() => root.unmount());
		toast.dismiss();
		await vi.runAllTimersAsync();
		vi.useRealTimers();
		clearFundsActionMarkersForTests();
		container.remove();
		if (originalLocks) Object.defineProperty(navigator, "locks", originalLocks);
		else Reflect.deleteProperty(navigator, "locks");
	});

	it("shows only the exact wallet owner and ignores an unrelated active Agent owner", async () => {
		mocks.activeAgentOwner = { env: "Mainnet", address: AGENT_OWNER };
		expect(persistFundsActionMarker(createVaultMarker({ owner: WALLET_OWNER, displayAmount: "12.34" }))).toBe(true);
		expect(persistFundsActionMarker(createStakingMarker({ owner: AGENT_OWNER, displayAmount: "98" }))).toBe(true);
		expect(
			persistFundsActionMarker(
				createVaultMarker({
					id: `Testnet:${WALLET_OWNER}:vaultTransfer:1786000000000:testnet-test`,
					env: "Testnet",
					owner: WALLET_OWNER,
					displayAmount: "55",
				}),
			),
		).toBe(true);

		await renderHost();

		expect(container.textContent).toContain("Vault deposit");
		expect(container.textContent).toContain("12.34 USDC");
		expect(container.textContent).not.toContain("Staking deposit");
		expect(container.textContent).not.toContain("98 HYPE");
		expect(container.textContent).not.toContain("55 USDC");
	});

	it("fails closed in Agent-only mode unless the exact active owner and environment match", async () => {
		mocks.clientKey = AGENT_OWNER;
		mocks.sessionMode = "agent-only";
		mocks.activeAgentOwner = { env: "Testnet", address: AGENT_OWNER };
		expect(persistFundsActionMarker(createStakingMarker({ owner: AGENT_OWNER, displayAmount: "7.5" }))).toBe(true);

		await renderHost();
		expect(container.textContent).toBe("");

		mocks.activeAgentOwner = { env: "Mainnet", address: AGENT_OWNER };
		await renderHost();
		expect(container.textContent).toContain("Staking deposit");
		expect(container.textContent).toContain("7.5 HYPE");

		mocks.activeAgentOwner = { env: "Mainnet", address: WALLET_OWNER };
		await renderHost();
		expect(container.textContent).toBe("");
	});

	it("refreshes from a cross-tab storage event", async () => {
		await renderHost();
		expect(container.textContent).toBe("");

		const marker = createVaultMarker({ owner: WALLET_OWNER, displayAmount: "3" });
		window.localStorage.setItem(FUNDS_ACTION_MARKER_STORAGE_KEY, JSON.stringify([marker]));
		act(() => {
			window.dispatchEvent(
				new StorageEvent("storage", {
					key: FUNDS_ACTION_MARKER_STORAGE_KEY,
					newValue: JSON.stringify([marker]),
					storageArea: window.localStorage,
				}),
			);
		});

		await act(() => vi.advanceTimersByTimeAsync(0));
		expect(container.textContent).toContain("Pending funds operation");
		expect(container.textContent).toContain("3 USDC");
	});

	it("keeps the record when history has not matched or authoritative state is still unverified", async () => {
		const marker = createVaultMarker({ owner: WALLET_OWNER });
		expect(persistFundsActionMarker(marker)).toBe(true);
		await renderHost();
		expect(mocks.infoCalls).toContainEqual({
			method: "userNonFundingLedgerUpdates",
			params: { user: WALLET_OWNER, startTime: getFundsActionHistoryStartTime(marker.startedAt) },
		});
		expect(getFundsActionMarkers()).toHaveLength(1);

		mocks.vaultHistory = [
			{ time: marker.startedAt + 1, hash: OLD_HASH, delta: { type: "vaultDeposit", vault: VAULT, usdc: "12.34" } },
		];
		await renderHost();
		expect(getFundsActionMarkers()).toHaveLength(1);

		mocks.vaultHistory = [
			{ time: marker.startedAt + 2, hash: NEW_HASH, delta: { type: "vaultDeposit", vault: VAULT, usdc: "12.34" } },
		];
		await renderHost();
		openDetails();

		expect(container.textContent).toContain("A new exact history event matches this request");
		expect(container.textContent).toContain("record remains locked until both checks pass");
		expect(getFundsActionMarkers()).toEqual([marker]);
	});

	it("uses the terminal mobile drawer for pending-operation details", async () => {
		mocks.isMobile = true;
		expect(persistFundsActionMarker(createVaultMarker({ owner: WALLET_OWNER }))).toBe(true);
		await renderHost();
		openDetails();

		expect(container.querySelector('[data-testid="recovery-modal"]')?.getAttribute("data-presentation")).toBe("drawer");
	});

	it("requires two explicit destructive clicks before clearing the recovery record", async () => {
		const marker = createVaultMarker({ owner: WALLET_OWNER });
		expect(persistFundsActionMarker(marker)).toBe(true);
		await renderHost();
		openDetails();

		clickButton("Clear record");
		expect(getFundsActionMarkers()).toEqual([marker]);
		expect(container.textContent).toContain("does not cancel the on-chain operation");
		expect(findButton("Confirm clear record")).toBeDefined();

		await act(async () => {
			findButton("Confirm clear record")?.click();
		});
		await act(() => vi.advanceTimersByTimeAsync(0));
		expect(getFundsActionMarkers()).toEqual([]);
		expect(container.textContent).toBe("");
	});

	it("does not inherit a clear confirmation when another tab replaces the marker", async () => {
		const marker = createVaultMarker({ owner: WALLET_OWNER });
		expect(persistFundsActionMarker(marker)).toBe(true);
		await renderHost();
		openDetails();
		clickButton("Clear record");
		expect(findButton("Confirm clear record")).toBeDefined();

		const replacement = createVaultMarker({
			id: `Mainnet:${WALLET_OWNER}:vaultTransfer:1786000000001:replacement`,
			owner: WALLET_OWNER,
			displayAmount: "99",
			atomicAmount: "99000000",
			startedAt: 1_786_000_000_001,
		});
		window.localStorage.setItem(FUNDS_ACTION_MARKER_STORAGE_KEY, JSON.stringify([replacement]));
		act(() => {
			window.dispatchEvent(
				new StorageEvent("storage", {
					key: FUNDS_ACTION_MARKER_STORAGE_KEY,
					newValue: JSON.stringify([replacement]),
					storageArea: window.localStorage,
				}),
			);
		});

		await act(() => vi.advanceTimersByTimeAsync(500));
		expect(container.querySelectorAll('[data-sonner-toast][data-removed="false"]')).toHaveLength(1);
		expect(container.textContent).toContain("99 USDC");
		expect(findButton("Confirm clear record")).toBeUndefined();
		clickButton("Clear record");
		expect(getFundsActionMarkers()).toEqual([replacement]);
		expect(findButton("Confirm clear record")).toBeDefined();
	});

	it("surfaces corrupt storage globally and requires two explicit clicks to clear it", async () => {
		mocks.clientKey = "disconnected";
		mocks.sessionMode = "disconnected";
		mocks.isMobile = true;
		await renderHost();
		window.localStorage.setItem(FUNDS_ACTION_MARKER_STORAGE_KEY, '{"not":"a valid marker list"}');
		act(() => {
			window.dispatchEvent(
				new StorageEvent("storage", {
					key: FUNDS_ACTION_MARKER_STORAGE_KEY,
					newValue: '{"not":"a valid marker list"}',
					storageArea: window.localStorage,
				}),
			);
		});

		await act(() => vi.advanceTimersByTimeAsync(0));
		expect(container.textContent).toContain("Funds operation record unreadable");
		expect(container.textContent).toContain("New funds actions are locked until this record is resolved");
		openDetails();
		expect(container.querySelector('[data-testid="recovery-modal"]')?.getAttribute("data-presentation")).toBe("drawer");
		expect(container.textContent).toContain("will not overwrite it or enable another funds action");

		clickButton("Clear unreadable record");
		expect(window.localStorage.getItem(FUNDS_ACTION_MARKER_STORAGE_KEY)).not.toBeNull();
		expect(container.textContent).toContain("does not cancel any on-chain operation");

		await act(async () => {
			findButton("Confirm clear unreadable record")?.click();
		});
		await act(() => vi.advanceTimersByTimeAsync(0));
		expect(window.localStorage.getItem(FUNDS_ACTION_MARKER_STORAGE_KEY)).toBeNull();
		expect(container.textContent).toBe("");
	});

	it("shows the complete public operation tuple without fabricating a transaction hash", async () => {
		const marker = createVaultMarker({ owner: WALLET_OWNER });
		expect(persistFundsActionMarker(marker)).toBe(true);
		await renderHost();
		openDetails();

		const text = container.textContent ?? "";
		expect(text).toContain("The prior request may have reached Hyperliquid. Do not submit it again.");
		for (const expected of [
			"NetworkMainnet",
			`Owner${WALLET_OWNER}`,
			"SDK methodvaultTransfer",
			"DirectionDeposit",
			`Target${VAULT}`,
			"Amount12.34 USDC",
			"Atomic amount12340000",
			"Atomic decimals6",
			`Started${formatDateTime(marker.startedAt)}`,
			"Identity epochvault-submit-epoch-7",
		]) {
			expect(text).toContain(expected);
		}
		expect(text).not.toContain("Transaction hash");
		expect(text).not.toContain(NEW_HASH);
		expect(container.querySelector('a[href*="/tx/"]')).toBeNull();
	});

	it("uses the shared Sonner host and hides the old account notification without clearing its marker", async () => {
		const marker = createVaultMarker({ owner: WALLET_OWNER });
		expect(persistFundsActionMarker(marker)).toBe(true);
		await renderHost();
		expect(container.querySelector("[data-sonner-toast]")?.textContent).toContain("Pending funds operation");
		expect(container.querySelector(".fixed")).toBeNull();
		openDetails();
		mocks.clientKey = AGENT_OWNER;
		await renderHost();
		expect(container.textContent).not.toContain("12.34");
		expect(container.querySelector('[data-testid="recovery-modal"]')).toBeNull();
		expect(getFundsActionMarkers()).toEqual([marker]);
	});

	it.each(["account", "network"] as const)(
		"keeps a recovery notification after a rapid %s switch away and back",
		async (change) => {
			const marker = createVaultMarker({ owner: WALLET_OWNER });
			expect(persistFundsActionMarker(marker)).toBe(true);
			await renderHost();
			await act(() => vi.advanceTimersByTimeAsync(50));
			expect(container.querySelector('[data-sonner-toast][data-removed="false"]')?.textContent).toContain("12.34 USDC");

			if (change === "account") mocks.clientKey = AGENT_OWNER;
			else mocks.env = "Testnet";
			await renderHost();
			await act(() => vi.advanceTimersByTimeAsync(50));
			mocks.clientKey = WALLET_OWNER;
			mocks.env = "Mainnet";
			await renderHost();
			await act(() => vi.advanceTimersByTimeAsync(500));

			const visible = container.querySelectorAll('[data-sonner-toast][data-removed="false"]');
			expect(visible).toHaveLength(1);
			expect(visible[0]?.textContent).toContain("12.34 USDC");
			expect(getFundsActionMarkers()).toEqual([marker]);
			openDetails();
			expect(findButton("Confirm clear record")).toBeUndefined();
		},
	);

	it("keeps a recovery marker when the notification is programmatically dismissed", async () => {
		const marker = createVaultMarker({ owner: WALLET_OWNER });
		expect(persistFundsActionMarker(marker)).toBe(true);
		await renderHost();
		const notification = toast
			.getToasts()
			.find((item) => String(item.id).startsWith(`funds-recovery:${marker.id}:presentation:`));
		expect(notification).toBeDefined();
		act(() => {
			if (notification) toast.dismiss(notification.id);
		});
		await act(() => vi.advanceTimersByTimeAsync(400));
		expect(getFundsActionMarkers()).toEqual([marker]);
	});

	async function renderHost() {
		act(() =>
			root.render(
				<I18nProvider i18n={i18n}>
					<FundsActionRecoveryHost />
					<Toaster />
				</I18nProvider>,
			),
		);
		await act(() => vi.advanceTimersByTimeAsync(0));
	}

	function findButton(label: string) {
		return [...container.querySelectorAll("button")].find((button) => button.textContent === label);
	}

	function clickButton(label: string) {
		const button = findButton(label);
		expect(button, `${label} button`).toBeDefined();
		act(() => button?.click());
	}

	function openDetails() {
		clickButton("Review");
		expect(container.querySelector('[data-testid="recovery-modal"]')).not.toBeNull();
	}
});

function createVaultMarker(
	overrides: Partial<FundsActionReference> & Pick<FundsActionReference, "owner">,
): FundsActionReference {
	const { owner, ...rest } = overrides;
	return {
		id: `Mainnet:${owner.toLowerCase()}:vaultTransfer:1786000000000:vault-test`,
		env: "Mainnet",
		owner,
		method: "vaultTransfer",
		target: VAULT,
		direction: "deposit",
		displayAmount: "12.34",
		atomicAmount: "12340000",
		atomicDecimals: 6,
		asset: "USDC",
		startedAt: 1_786_000_000_000,
		identityEpoch: "vault-submit-epoch-7",
		historyBaseline: { version: 1, observedAt: 1_786_000_000_000, hashes: [OLD_HASH] },
		stateBaseline: { kind: "vault", vaultEquity: "100", withdrawable: "900" },
		...rest,
	};
}

function createStakingMarker(
	overrides: Partial<FundsActionReference> & Pick<FundsActionReference, "owner">,
): FundsActionReference {
	const { owner, ...rest } = overrides;
	return {
		id: `Mainnet:${owner.toLowerCase()}:cDeposit:1786000000000:staking-test`,
		env: "Mainnet",
		owner,
		method: "cDeposit",
		target: "staking",
		direction: "deposit",
		displayAmount: "5",
		atomicAmount: "500000000",
		atomicDecimals: 8,
		asset: "HYPE",
		startedAt: 1_786_000_000_000,
		identityEpoch: "staking-submit-epoch-3",
		historyBaseline: { version: 1, observedAt: 1_786_000_000_000, hashes: [OLD_HASH] },
		stateBaseline: {
			kind: "staking",
			spotAvailable: "10",
			delegated: "2",
			undelegated: "3",
			totalPendingWithdrawal: "0",
			nPendingWithdrawals: 0,
			targetDelegation: "0",
		},
		...rest,
	};
}
