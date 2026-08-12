import type { Hash, PublicClient, TransactionReceipt } from "viem";
import { encodeAbiParameters, encodeEventTopics, erc20Abi } from "viem";
import { describe, expect, it, vi } from "vitest";
import { BRIDGE2_ABI, DEPOSIT_NETWORKS } from "@/config/contracts";
import {
	DefinitiveDepositSourceFailureError,
	isDefinitiveDepositSourceFailure,
} from "@/lib/hyperliquid/deposit-source-error";
import {
	assertSmartBridge2DepositReceipt,
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
const USER = "0x1111111111111111111111111111111111111111" as const;
const AMOUNT_RAW = 5_000_000n;

function createReceipt(
	logs: Array<{ address: `0x${string}`; data: `0x${string}`; topics: readonly `0x${string}`[] }>,
): TransactionReceipt {
	return { logs } as unknown as TransactionReceipt;
}

function createUsdcTransferLog() {
	return {
		address: DEPOSIT_NETWORKS.mainnet.usdc,
		data: encodeAbiParameters([{ type: "uint256" }], [AMOUNT_RAW]),
		topics: encodeEventTopics({
			abi: erc20Abi,
			eventName: "Transfer",
			args: { from: USER, to: DEPOSIT_NETWORKS.mainnet.bridge2 },
		}) as readonly `0x${string}`[],
	};
}

function createFailedPermitLog() {
	return {
		address: DEPOSIT_NETWORKS.mainnet.bridge2,
		data: encodeAbiParameters([{ type: "address" }, { type: "uint64" }, { type: "uint32" }], [USER, AMOUNT_RAW, 1]),
		topics: encodeEventTopics({
			abi: BRIDGE2_ABI,
			eventName: "FailedPermitDeposit",
		}) as readonly `0x${string}`[],
	};
}

function createPublicClientMock(overrides: Partial<PublicClient>): PublicClient {
	return overrides as PublicClient;
}

describe("deposit broadcast confirmation", () => {
	it("classifies definitive failures by structured code instead of localized wording", () => {
		expect(
			isDefinitiveDepositSourceFailure(
				new DefinitiveDepositSourceFailureError("source-transaction-reverted", "交易已在 Arbitrum 上回滚"),
			),
		).toBe(true);
		expect(isDefinitiveDepositSourceFailure(new Error("交易已在 Arbitrum 上回滚"))).toBe(false);
		expect(isDefinitiveDepositSourceFailure(new Error("Transaction reverted on Arbitrum"))).toBe(false);
		expect(isDefinitiveDepositSourceFailure(new Error("HTTP request failed"))).toBe(false);
	});

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

	it("keeps waiting after the wallet response threshold without enabling an unsafe retry", async () => {
		let resolveHash: ((hash: Hash) => void) | undefined;
		const walletResponse = new Promise<Hash>((resolve) => {
			resolveHash = resolve;
		});
		const onDelayed = vi.fn();
		const result = waitForWalletTransactionHash(walletResponse, 0, onDelayed);

		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(onDelayed).toHaveBeenCalledOnce();

		resolveHash?.(HASH);
		await expect(result).resolves.toBe(HASH);
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

		const failure = await waitForConfirmedReceipt(publicClient, HASH, { provider, timeoutMs: 0 }).catch(
			(error: unknown) => error,
		);
		expect(failure).toBeInstanceOf(DefinitiveDepositSourceFailureError);
		expect(failure).toMatchObject({
			code: "source-transaction-reverted",
			message: "Transaction reverted on Arbitrum",
		});
		expect(publicClient.getTransactionReceipt).toHaveBeenCalledWith({ hash: HASH });
	});
});

describe("smart Bridge2 receipt validation", () => {
	it("accepts the matching USDC transfer emitted by transferFrom", () => {
		expect(() =>
			assertSmartBridge2DepositReceipt({
				amountRaw: AMOUNT_RAW,
				config: DEPOSIT_NETWORKS.mainnet,
				receipt: createReceipt([createUsdcTransferLog()]),
				user: USER,
			}),
		).not.toThrow();
	});

	it("rejects a matching FailedPermitDeposit even if a transfer log is present", () => {
		expect(() =>
			assertSmartBridge2DepositReceipt({
				amountRaw: AMOUNT_RAW,
				config: DEPOSIT_NETWORKS.mainnet,
				receipt: createReceipt([createUsdcTransferLog(), createFailedPermitLog()]),
				user: USER,
			}),
		).toThrow("Bridge2 deposit was not credited");
	});

	it("rejects a successful receipt without the expected USDC transfer", () => {
		expect(() =>
			assertSmartBridge2DepositReceipt({
				amountRaw: AMOUNT_RAW,
				config: DEPOSIT_NETWORKS.mainnet,
				receipt: createReceipt([]),
				user: USER,
			}),
		).toThrow("Bridge2 deposit was not credited");
	});
});
