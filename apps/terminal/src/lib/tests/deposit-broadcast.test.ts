import type { Hash, PublicClient } from "viem";
import { describe, expect, it, vi } from "vitest";
import { waitForBroadcastedTransaction, waitForWalletTransactionHash } from "@/lib/hyperliquid/use-deposit";

vi.mock("@lingui/core/macro", () => ({
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

	it("accepts a transaction visible through the wallet provider before public RPC propagation", async () => {
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

		await expect(
			waitForBroadcastedTransaction(publicClient, HASH, { provider, timeoutMs: 0 }),
		).resolves.toBeUndefined();
		expect(provider.request).toHaveBeenCalledWith({ method: "eth_getTransactionByHash", params: [HASH] });
		expect(publicClient.getTransactionReceipt).not.toHaveBeenCalled();
		expect(publicClient.getTransaction).not.toHaveBeenCalled();
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
});
