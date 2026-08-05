// @vitest-environment jsdom

import { act, createElement, Fragment } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmbeddedDepositAutoBridge } from "@/components/trade/tradebox/embedded-deposit-auto-bridge";

const USER_ADDRESS = "0x1111111111111111111111111111111111111111" as const;
const HASH = "0x0000000000000000000000000000000000000000000000000000000000000001" as const;

const testState = vi.hoisted(() => ({
	deposit: vi.fn(),
	depositError: null as Error | null,
	depositHash: undefined as `0x${string}` | undefined,
	depositStatus: "idle" as "idle" | "pending" | "confirming" | "success" | "error",
	maxDepositRaw: 9_000_000n as bigint | undefined,
	refreshBalance: vi.fn(),
	resetDeposit: vi.fn(),
	toastDismiss: vi.fn(),
	toastError: vi.fn(),
	toastLoading: vi.fn(),
	toastSuccess: vi.fn(),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock("@lingui/core/macro", () => ({
	t: (strings: TemplateStringsArray, ...values: unknown[]) =>
		strings.reduce((message, part, index) => `${message}${part}${values[index] ?? ""}`, ""),
}));

vi.mock("sonner", () => ({
	toast: {
		dismiss: testState.toastDismiss,
		error: testState.toastError,
		loading: testState.toastLoading,
		success: testState.toastSuccess,
	},
}));

vi.mock("@/hooks/wallet/use-email-embedded-wallet", () => ({
	useEmailEmbeddedWallet: () => ({
		emailAddress: "user@example.com",
		embeddedWalletAddress: USER_ADDRESS,
		shouldUseEmbeddedWallet: true,
		needsEmbeddedWallet: false,
		isCreatingEmbeddedWallet: false,
		embeddedWalletError: null,
		ensureEmailEmbeddedWallet: vi.fn(),
	}),
}));

vi.mock("@/hooks/wallet/use-wallet-session", () => ({
	useWalletSession: () => ({
		user: { email: { address: "user@example.com" } },
		embeddedWalletAddress: USER_ADDRESS,
	}),
}));

vi.mock("@/lib/wallet/privy-wagmi", () => ({
	getPrivyEmailAddress: () => "user@example.com",
	shouldUsePrivyEmbeddedWallet: () => true,
}));

vi.mock("@/lib/hyperliquid/use-deposit", () => ({
	useDeposit: () => ({
		maxDepositRaw: testState.maxDepositRaw,
		status: testState.depositStatus,
		error: testState.depositError,
		hash: testState.depositHash,
		deposit: testState.deposit,
		refreshBalance: testState.refreshBalance,
		reset: testState.resetDeposit,
		networkName: "Arbitrum",
		smartDepositEnabled: true,
	}),
}));

describe("EmbeddedDepositAutoBridge", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		vi.useFakeTimers();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		testState.deposit.mockReset();
		testState.deposit.mockResolvedValue(undefined);
		testState.refreshBalance.mockReset();
		testState.refreshBalance.mockResolvedValue(9_000_000n);
		testState.resetDeposit.mockReset();
		testState.toastDismiss.mockReset();
		testState.toastError.mockReset();
		testState.toastLoading.mockReset();
		testState.toastSuccess.mockReset();
		testState.depositError = null;
		testState.depositHash = undefined;
		testState.depositStatus = "idle";
		testState.maxDepositRaw = 9_000_000n;
		Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.useRealTimers();
		vi.clearAllMocks();
	});

	it("does not retry an automatic deposit after a transaction hash exists", async () => {
		await act(async () => {
			root.render(createElement(EmbeddedDepositAutoBridge));
		});
		expect(testState.deposit).toHaveBeenCalledTimes(1);

		testState.depositStatus = "error";
		testState.depositError = new Error("confirmation failed");
		testState.depositHash = HASH;
		await act(async () => {
			root.render(createElement(EmbeddedDepositAutoBridge));
		});

		await act(() => vi.advanceTimersByTimeAsync(10 * 60_000));

		expect(testState.deposit).toHaveBeenCalledTimes(1);
		expect(testState.resetDeposit).not.toHaveBeenCalled();
	});

	it("uses the balance refreshed inside the exclusive section", async () => {
		testState.refreshBalance.mockResolvedValue(6_000_000n);

		await act(async () => {
			root.render(createElement(EmbeddedDepositAutoBridge));
		});

		expect(testState.refreshBalance).toHaveBeenCalledTimes(1);
		expect(testState.deposit).toHaveBeenCalledWith("6");
	});

	it("skips an automatic deposit when the refreshed balance is below the minimum", async () => {
		testState.refreshBalance.mockResolvedValue(4_000_000n);

		await act(async () => {
			root.render(createElement(EmbeddedDepositAutoBridge));
		});

		expect(testState.refreshBalance).toHaveBeenCalledTimes(1);
		expect(testState.deposit).not.toHaveBeenCalled();
	});

	it("backs off when the balance cannot be refreshed inside the exclusive section", async () => {
		testState.refreshBalance.mockResolvedValue(undefined);

		await act(async () => {
			root.render(createElement(EmbeddedDepositAutoBridge));
		});

		expect(testState.deposit).not.toHaveBeenCalled();
		expect(testState.resetDeposit).not.toHaveBeenCalled();

		await act(() => vi.advanceTimersByTimeAsync(30_000));

		expect(testState.resetDeposit).toHaveBeenCalledTimes(1);
	});

	it("serializes automatic deposits across mounted tabs and rechecks the balance", async () => {
		let queue = Promise.resolve<unknown>(undefined);
		const request = vi.fn(
			(_name: string, _options: LockOptions, callback: (lock: Lock) => Promise<unknown>): Promise<unknown> => {
				const current = queue.then(() => callback({ mode: "exclusive", name: _name }));
				queue = current.catch(() => undefined);
				return current;
			},
		);
		Object.defineProperty(navigator, "locks", {
			configurable: true,
			value: { query: vi.fn(), request },
		});
		testState.refreshBalance.mockResolvedValueOnce(9_000_000n).mockResolvedValueOnce(0n);

		await act(async () => {
			root.render(
				createElement(
					Fragment,
					null,
					createElement(EmbeddedDepositAutoBridge, { key: "first" }),
					createElement(EmbeddedDepositAutoBridge, { key: "second" }),
				),
			);
		});

		expect(request).toHaveBeenCalledTimes(2);
		expect(testState.refreshBalance).toHaveBeenCalledTimes(2);
		expect(testState.deposit).toHaveBeenCalledTimes(1);
	});

	it("reconciles smart-wallet nonce conflicts without exposing provider payloads", async () => {
		await act(async () => {
			root.render(createElement(EmbeddedDepositAutoBridge));
		});

		testState.depositStatus = "error";
		testState.depositError = new Error(
			"RPC Request failed. URL: https://rpc.zerodev.app/private Details: AA25 invalid account nonce callData: 0xdeadbeef",
		);

		await act(async () => {
			root.render(createElement(EmbeddedDepositAutoBridge));
		});

		expect(testState.refreshBalance).toHaveBeenCalledTimes(2);
		expect(testState.toastError).toHaveBeenCalledWith(
			"Smart wallet deposit state is syncing. Do not submit another deposit while the balance is being checked.",
			{ id: "embedded-deposit-auto-bridge" },
		);
		expect(testState.toastError.mock.calls.flat().join(" ")).not.toContain("rpc.zerodev.app");
		expect(testState.toastError.mock.calls.flat().join(" ")).not.toContain("callData");
	});

	it("dismisses an active loading toast when the deposit returns to idle", async () => {
		testState.depositStatus = "pending";

		await act(async () => {
			root.render(createElement(EmbeddedDepositAutoBridge));
		});

		expect(testState.toastLoading).toHaveBeenCalledWith("Preparing automatic USDC deposit...", {
			id: "embedded-deposit-auto-bridge",
		});

		testState.depositStatus = "idle";
		await act(async () => {
			root.render(createElement(EmbeddedDepositAutoBridge));
		});

		expect(testState.toastDismiss).toHaveBeenCalledWith("embedded-deposit-auto-bridge");
	});

	it("keeps a completed deposit toast available for normal auto-dismiss", async () => {
		testState.depositStatus = "pending";
		await act(async () => {
			root.render(createElement(EmbeddedDepositAutoBridge));
		});

		testState.depositStatus = "success";
		await act(async () => {
			root.render(createElement(EmbeddedDepositAutoBridge));
		});

		testState.depositStatus = "idle";
		await act(async () => {
			root.render(createElement(EmbeddedDepositAutoBridge));
		});

		expect(testState.toastSuccess).toHaveBeenCalledWith("USDC deposit submitted to Hyperliquid", {
			id: "embedded-deposit-auto-bridge",
		});
		expect(testState.toastDismiss).not.toHaveBeenCalled();
	});
});
