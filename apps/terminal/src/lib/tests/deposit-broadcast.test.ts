import type { Hash, PublicClient } from "viem";
import { describe, expect, it, vi } from "vitest";
import {
	waitForBroadcastedTransaction,
	waitForConfirmedReceipt,
	waitForWalletTransactionHash,
} from "@/lib/hyperliquid/use-deposit";

vi.mock("@lingui/core/macro", () => ({
	msg: (strings: TemplateStringsArray, ...values: unknown[]) =>
		strings.reduce((result, part, index) => `${result}${part}${values[index] ?? ""}`, ""),
	t: (strings: TemplateStringsArray, ...values: unknown[]) =>
		strings.reduce((result, part, index) => `${result}${part}${values[index] ?? ""}`, ""),
}));

const HASH = "0x0000000000000000000000000000000000000000000000000000000000000001" as Hash;

function createPublicClientMock(overrides: Partial<PublicClient>): PublicClient {
	return overrides as PublicClient;
}

describe("deposit broadcast confirmation", () => {
	it("accepts a visible transaction receipt", async () => {
		const publicClient = createPublicClientMock({
			getTransactionReceipt: vi.fn().mockResolvedValue({ status: "success" }),
			getTransaction: vi.fn(),
		});

		await expect(waitForBroadcastedTransaction(publicClient, HASH, { timeoutMs: 0 })).resolves.toBeUndefined();
		expect(publicClient.getTransactionReceipt).toHaveBeenCalledWith({ hash: HASH });
		expect(publicClient.getTransaction).not.toHaveBeenCalled();
	});

	it("accepts a visible pending transaction when the receipt is not available yet", async () => {
		const publicClient = createPublicClientMock({
			getTransactionReceipt: vi.fn().mockRejectedValue(new Error("not found")),
			getTransaction: vi.fn().mockResolvedValue({ hash: HASH, blockNumber: null }),
		});

		await expect(waitForBroadcastedTransaction(publicClient, HASH, { timeoutMs: 0 })).resolves.toBeUndefined();
		expect(publicClient.getTransaction).toHaveBeenCalledWith({ hash: HASH });
	});

	it("does not accept a wallet-provider receipt as publicly broadcast", async () => {
		const publicClient = createPublicClientMock({
			getTransactionReceipt: vi.fn().mockRejectedValue(new Error("not found")),
			getTransaction: vi.fn().mockRejectedValue(new Error("not found")),
		});
		const provider = {
			request: vi.fn().mockResolvedValue({ status: "0x1", blockNumber: "0x1", logs: [] }),
		};

		await expect(waitForBroadcastedTransaction(publicClient, HASH, { provider, timeoutMs: 0 })).rejects.toThrow(
			"Wallet returned a transaction hash, but it is not visible on Arbitrum yet. Check your wallet activity or Arbiscan before retrying to avoid sending the deposit twice.",
		);
		expect(provider.request).not.toHaveBeenCalled();
	});

	it("does not accept a wallet-local pending transaction as publicly broadcast", async () => {
		const publicClient = createPublicClientMock({
			getTransactionReceipt: vi.fn().mockRejectedValue(new Error("not found")),
			getTransaction: vi.fn().mockRejectedValue(new Error("not found")),
		});
		const provider = {
			request: vi.fn().mockImplementation(({ method }: { method: string }) => {
				if (method === "eth_getTransactionReceipt") return Promise.resolve(null);
				if (method === "eth_getTransactionByHash") return Promise.resolve({ hash: HASH, blockNumber: null });
				return Promise.reject(new Error("unexpected method"));
			}),
		};

		await expect(waitForBroadcastedTransaction(publicClient, HASH, { provider, timeoutMs: 0 })).rejects.toThrow(
			"Wallet returned a transaction hash, but it is not visible on Arbitrum yet. Check your wallet activity or Arbiscan before retrying to avoid sending the deposit twice.",
		);
		expect(provider.request).not.toHaveBeenCalled();
	});

	it("fails with a retry-safe message when the wallet hash is not visible on Arbitrum", async () => {
		const publicClient = createPublicClientMock({
			getTransactionReceipt: vi.fn().mockRejectedValue(new Error("not found")),
			getTransaction: vi.fn().mockRejectedValue(new Error("not found")),
		});

		await expect(waitForBroadcastedTransaction(publicClient, HASH, { timeoutMs: 0 })).rejects.toThrow(
			"Wallet returned a transaction hash, but it is not visible on Arbitrum yet. Check your wallet activity or Arbiscan before retrying to avoid sending the deposit twice.",
		);
	});

	it("times out when the wallet does not return a transaction hash", async () => {
		const never = new Promise<Hash>(() => {});

		await expect(waitForWalletTransactionHash(never, 0)).rejects.toThrow(
			"Wallet did not return a transaction hash. Check your wallet activity before retrying to avoid sending the deposit twice.",
		);
	});

	it("does not confirm through the wallet provider when the public RPC fails", async () => {
		const publicClient = createPublicClientMock({
			getTransactionReceipt: vi.fn().mockRejectedValue(new Error("HTTP request failed.")),
			getTransaction: vi.fn(),
		});
		const provider = {
			request: vi.fn().mockResolvedValue({ status: "0x1", blockNumber: "0x1", logs: [] }),
		};

		await expect(waitForConfirmedReceipt(publicClient, HASH, { provider, timeoutMs: 0 })).rejects.toThrow(
			"Deposit transaction was broadcast, but Arbitrum RPC confirmation failed. Check Arbiscan before retrying.",
		);
		expect(provider.request).toHaveBeenCalledWith({ method: "eth_getTransactionReceipt", params: [HASH] });
		expect(publicClient.getTransactionReceipt).toHaveBeenCalledWith({ hash: HASH });
	});

	it("reports RPC confirmation failures after a broadcasted transaction", async () => {
		const publicClient = createPublicClientMock({
			getTransactionReceipt: vi.fn().mockRejectedValue(new Error("HTTP request failed.")),
			getTransaction: vi.fn().mockRejectedValue(new Error("HTTP request failed.")),
		});

		await expect(waitForConfirmedReceipt(publicClient, HASH, { timeoutMs: 0 })).rejects.toThrow(
			"Deposit transaction was broadcast, but Arbitrum RPC confirmation failed. Check Arbiscan before retrying.",
		);
	});

	it("reports reverted receipts from the wallet provider", async () => {
		const publicClient = createPublicClientMock({
			getTransactionReceipt: vi.fn(),
			getTransaction: vi.fn(),
		});
		const provider = {
			request: vi.fn().mockResolvedValue({ status: "0x0", blockNumber: "0x1", logs: [] }),
		};

		await expect(waitForConfirmedReceipt(publicClient, HASH, { provider, timeoutMs: 0 })).rejects.toThrow(
			"Transaction reverted on Arbitrum",
		);
		expect(publicClient.getTransactionReceipt).toHaveBeenCalledWith({ hash: HASH });
	});
});
