import { i18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { Hash, PublicClient } from "viem";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatTransferError } from "@/lib/errors/format";
import { LocalizedActionError } from "@/lib/errors/localized-action-error";
import {
	DefinitiveDepositSourceFailureError,
	isDefinitiveDepositSourceFailure,
} from "@/lib/hyperliquid/deposit-source-error";
import {
	fetchCctpDepositTerms,
	waitForBroadcastedTransaction,
	waitForConfirmedReceipt,
	waitForWalletTransactionHash,
} from "@/lib/hyperliquid/use-deposit";
import type { Translate } from "@/lib/translate";

const HASH = "0x0000000000000000000000000000000000000000000000000000000000000001" as Hash;
const CONFIRMATION_TIMED_OUT = msg`Deposit transaction was broadcast but confirmation timed out. Check Arbiscan before retrying.`;
const translate: Translate = (descriptor) => i18n._(descriptor);
function createPublicClientMock(overrides: Partial<PublicClient>): PublicClient {
	return overrides as PublicClient;
}

describe("deposit broadcast confirmation", () => {
	afterEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
	});

	it("fails a hanging Circle terms request at its deadline instead of holding the funds lock", async () => {
		vi.useFakeTimers();
		try {
			const fetcher = vi.fn(
				(_input: RequestInfo | URL, init?: RequestInit) =>
					new Promise<Response>((_resolve, reject) => {
						init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
					}),
			);
			const config = { feeApiUrl: "https://circle.test/fees", fastAllowanceApiUrl: "https://circle.test/fast" };
			const pending = fetchCctpDepositTerms(config as Parameters<typeof fetchCctpDepositTerms>[0], {
				fetcher: fetcher as unknown as typeof fetch,
				timeoutMs: 1_000,
			});
			const outcome = pending.then(
				() => "resolved",
				(error: unknown) => error,
			);

			await vi.advanceTimersByTimeAsync(999);
			expect(fetcher).toHaveBeenCalledTimes(2);
			await vi.advanceTimersByTimeAsync(1);
			const error = await outcome;

			expect(error).toBeInstanceOf(LocalizedActionError);
			expect(translate((error as LocalizedActionError).descriptor)).toBe(
				"Unable to verify the current Circle CCTP fee and Fast Transfer capacity.",
			);
		} finally {
			vi.useRealTimers();
		}
	});

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

	it("reports a confirmation timeout in the language active when it is displayed", async () => {
		const publicClient = createPublicClientMock({
			getTransactionReceipt: vi.fn().mockResolvedValue(null),
			getTransaction: vi.fn().mockResolvedValue(null),
		});

		const failure = await waitForConfirmedReceipt(publicClient, HASH, { timeoutMs: 0 }).catch(
			(error: unknown) => error,
		);

		expect(failure).toBeInstanceOf(LocalizedActionError);
		expect(formatTransferError(failure as Error, translate, "Deposit failed")).toBe(
			"Deposit transaction was broadcast but confirmation timed out. Check Arbiscan before retrying.",
		);
		i18n.loadAndActivate({
			locale: "zh",
			messages: { [CONFIRMATION_TIMED_OUT.id]: "存款交易已广播，但确认超时。重试前请先在 Arbiscan 上检查。" },
		});
		expect(formatTransferError(failure as Error, translate, "存款失败")).toBe(
			"存款交易已广播，但确认超时。重试前请先在 Arbiscan 上检查。",
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
