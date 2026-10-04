// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { i18n } from "@lingui/core";
import { act, createContext, useContext } from "react";
import type { Root } from "react-dom/client";
import { Toaster, toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmbeddedDepositAutoBridge } from "@/components/trade/tradebox/embedded-deposit-auto-bridge";
import { createI18nRoot } from "./harness/react";

const OWNER_A = "0x1111111111111111111111111111111111111111";
const OWNER_B = "0x2222222222222222222222222222222222222222";
const state = vi.hoisted(() => ({
	owner: "0x1111111111111111111111111111111111111111",
	status: "pending",
	deposit: vi.fn(),
	refreshBalance: vi.fn(),
	reset: vi.fn(),
}));

const StateContext = createContext(state);

vi.mock("@/hooks/wallet/use-email-embedded-wallet", () => ({
	useEmailEmbeddedWallet: () => ({
		emailAddress: "user@example.com",
		embeddedWalletAddress: useContext(StateContext).owner,
		shouldUseEmbeddedWallet: true,
		needsEmbeddedWallet: false,
		isCreatingEmbeddedWallet: false,
		embeddedWalletError: null,
	}),
}));
vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({ embeddedWalletAddress: useContext(StateContext).owner, walletIntent: "embedded" }),
}));
vi.mock("@/lib/wallet/privy-wagmi", () => ({ getPrivyEmailAddress: () => "user@example.com" }));
vi.mock("@/hooks/trade/use-cctp-deposit-tracking", () => ({
	useCctpDepositTracking: () => ({ recoveryRecord: null }),
}));
vi.mock("@/hooks/trade/use-usdc-routing", () => ({
	UsdcDepositRouteError: class extends Error {},
	useUsdcRouting: () => ({
		data: { depositRoute: "cctp", withdrawalRoute: "cctp" },
		isError: false,
		isFetching: false,
	}),
}));
vi.mock("@/stores/use-global-modal-store", () => ({ useDepositModalOpen: () => false }));
vi.mock("@/config/cctp-deposit", () => ({ isCctpSponsoredDepositEnabled: () => false }));
vi.mock("@/stores/use-global-settings-store", () => ({ useIsTestnet: () => true }));
vi.mock("@/hooks/trade/use-cctp-deposit-fee", () => {
	const data = {
		feeQuote: {
			finalityThreshold: 1000,
			minimumFeeBps: "0",
			forwardFeeRaw: { low: 200_000n, med: 200_000n, high: 200_000n },
		},
	};
	return {
		useCctpDepositFee: ({ amountRaw }: { amountRaw: bigint | undefined }) => ({
			data,
			calculation: amountRaw !== undefined && amountRaw >= 400_000n ? { maxFeeRaw: 200_000n } : null,
		}),
	};
});
vi.mock("@/lib/trade/cctp-deposit", () => ({
	meetsCctpDepositMinimum: (amountRaw: bigint) => amountRaw >= 400_000n,
}));
vi.mock("@/lib/hyperliquid/use-deposit", () => ({
	useDeposit: () => ({
		maxDepositRaw: 0n,
		status: useContext(StateContext).status,
		error: null,
		deposit: state.deposit,
		refreshBalance: state.refreshBalance,
		reset: state.reset,
		networkName: "Arbitrum",
		sponsoredCctpEnabled: false,
	}),
}));

function Harness({ snapshot }: { snapshot: typeof state }) {
	return (
		<StateContext.Provider value={snapshot}>
			<Toaster />
			<EmbeddedDepositAutoBridge />
		</StateContext.Provider>
	);
}

describe("embedded deposit notifications with real Sonner", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		vi.useFakeTimers();
		i18n.loadAndActivate({ locale: "en", messages: {} });
		state.owner = OWNER_A;
		state.status = "pending";
		vi.clearAllMocks();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
	});

	afterEach(async () => {
		await act(async () => {
			toast.dismiss();
			await vi.advanceTimersByTimeAsync(500);
			root.unmount();
		});
		container.remove();
		vi.useRealTimers();
	});

	async function render() {
		act(() => root.render(<Harness snapshot={{ ...state }} />));
		await act(() => vi.advanceTimersByTimeAsync(0));
	}

	it("keeps A's restored notification after rapidly switching A to B to A", async () => {
		await render();
		expect(container.textContent).toContain("Preparing automatic USDC deposit...");
		state.owner = OWNER_B;
		state.status = "idle";
		await render();
		await act(() => vi.advanceTimersByTimeAsync(50));
		state.owner = OWNER_A;
		state.status = "pending";
		await render();
		await act(() => vi.advanceTimersByTimeAsync(500));
		expect(container.querySelectorAll("[data-sonner-toast]")).toHaveLength(1);
		expect(container.textContent).toContain("Preparing automatic USDC deposit...");
		expect(state.deposit).not.toHaveBeenCalled();
	});

	it("keeps a new pending notification after idle dismisses the previous presentation", async () => {
		await render();
		state.status = "idle";
		await render();
		await act(() => vi.advanceTimersByTimeAsync(50));
		state.status = "pending";
		await render();
		await act(() => vi.advanceTimersByTimeAsync(500));
		expect(container.querySelectorAll("[data-sonner-toast]")).toHaveLength(1);
		expect(container.textContent).toContain("Preparing automatic USDC deposit...");
	});

	it("updates state and locale within the same visible presentation", async () => {
		await render();
		const notificationId = toast.getToasts()[0]?.id;
		state.status = "confirming";
		await render();
		expect(toast.getToasts()[0]?.id).toBe(notificationId);
		expect(container.textContent).toContain("Depositing USDC to Hyperliquid...");
		const message = "Depositing USDC to Hyperliquid...";
		const messageId = createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6);
		act(() => i18n.loadAndActivate({ locale: "zh", messages: { [messageId]: "正在向 Hyperliquid 存入 USDC…" } }));
		await act(() => vi.advanceTimersByTimeAsync(0));
		expect(toast.getToasts()[0]?.id).toBe(notificationId);
		expect(container.querySelectorAll("[data-sonner-toast]")).toHaveLength(1);
		expect(container.textContent).toContain("正在向 Hyperliquid 存入 USDC…");
	});
});
