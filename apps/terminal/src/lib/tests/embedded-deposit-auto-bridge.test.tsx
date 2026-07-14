// @vitest-environment jsdom

import { act, createElement } from "react";
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
	resetDeposit: vi.fn(),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock("@lingui/core/macro", () => ({
	t: (strings: TemplateStringsArray, ...values: unknown[]) =>
		strings.reduce((message, part, index) => `${message}${part}${values[index] ?? ""}`, ""),
}));

vi.mock("sonner", () => ({
	toast: {
		error: vi.fn(),
		loading: vi.fn(),
		success: vi.fn(),
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
		maxDepositRaw: 9_000_000n,
		status: testState.depositStatus,
		error: testState.depositError,
		hash: testState.depositHash,
		deposit: testState.deposit,
		reset: testState.resetDeposit,
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
		testState.resetDeposit.mockReset();
		testState.depositError = null;
		testState.depositHash = undefined;
		testState.depositStatus = "idle";
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
});
