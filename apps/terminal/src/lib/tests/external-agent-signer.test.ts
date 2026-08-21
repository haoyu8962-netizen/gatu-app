import { ExchangeClient, type IRequestTransport } from "@nktkas/hyperliquid";
import type { WalletClient } from "viem";
import { describe, expect, it, vi } from "vitest";
import { createExternalAgentSigner } from "@/lib/wallet/external-agent-signer";

const EXPECTED_ADDRESS = "0x1111111111111111111111111111111111111111";
const OTHER_ADDRESS = "0x2222222222222222222222222222222222222222";
const RAW_SIGNATURE = `0x${"11".repeat(64)}1b` as const;

interface Deferred<T> {
	promise: Promise<T>;
	resolve: (value: T) => void;
}

function createDeferred<T>(): Deferred<T> {
	let resolve = (_value: T) => {};
	const promise = new Promise<T>((promiseResolve) => {
		resolve = promiseResolve;
	});
	return { promise, resolve };
}

function createWalletClient(
	signTypedData: (typedData: unknown) => Promise<`0x${string}`>,
	address = EXPECTED_ADDRESS,
): WalletClient {
	return {
		account: { address },
		getChainId: vi.fn().mockResolvedValue(42161),
		signTypedData,
	} as unknown as WalletClient;
}

function createClient(walletClient: WalletClient, beforeSubmit: () => void | Promise<void>) {
	const request = vi.fn().mockResolvedValue({ status: "ok", response: { type: "default" } });
	const signer = createExternalAgentSigner({
		expectedAddress: EXPECTED_ADDRESS,
		walletClient,
		beforeSubmit,
	});
	const client = new ExchangeClient({
		transport: { isTestnet: false, request } as IRequestTransport,
		wallet: signer,
		nonceManager: () => 1_722_000_000_000,
	});
	return { client, request };
}

describe("createExternalAgentSigner", () => {
	it("signs with the exact active Wagmi account and revalidates before returning the signature", async () => {
		const signTypedData = vi.fn().mockResolvedValue(RAW_SIGNATURE);
		const beforeSubmit = vi.fn();
		const signer = createExternalAgentSigner({
			expectedAddress: EXPECTED_ADDRESS,
			walletClient: createWalletClient(signTypedData),
			beforeSubmit,
		});

		await signer.signTypedData({
			domain: {
				name: "HyperliquidSignTransaction",
				version: "1",
				chainId: 42161,
				verifyingContract: "0x0000000000000000000000000000000000000000",
			},
			types: {},
			primaryType: "HyperliquidTransaction:ApproveAgent",
			message: {},
		});

		expect(signTypedData).toHaveBeenCalledWith(
			expect.objectContaining({ account: expect.objectContaining({ address: EXPECTED_ADDRESS }) }),
		);
		expect(beforeSubmit).toHaveBeenCalledOnce();
		expect(signTypedData.mock.invocationCallOrder[0]).toBeLessThan(beforeSubmit.mock.invocationCallOrder[0] ?? 0);
	});

	it("blocks the real SDK transport when identity changes after external-wallet signing", async () => {
		const signature = createDeferred<typeof RAW_SIGNATURE>();
		const signTypedData = vi.fn(async (_typedData: unknown) => signature.promise);
		let activeOwner = EXPECTED_ADDRESS;
		const beforeSubmit = vi.fn(() => {
			if (activeOwner !== EXPECTED_ADDRESS) throw new Error("Approval owner changed after signing");
		});
		const { client, request } = createClient(createWalletClient(signTypedData), beforeSubmit);

		const approval = client.approveAgent({ agentAddress: OTHER_ADDRESS, agentName: "Mobile" });
		await vi.waitFor(() => expect(signTypedData).toHaveBeenCalledOnce());
		activeOwner = OTHER_ADDRESS;
		signature.resolve(RAW_SIGNATURE);

		await expect(approval).rejects.toMatchObject({
			message: "Failed to sign the typed data using the wallet",
			cause: expect.objectContaining({ message: "Approval owner changed after signing" }),
		});
		expect(beforeSubmit).toHaveBeenCalledOnce();
		expect(request).not.toHaveBeenCalled();
	});

	it("blocks the real SDK transport when the post-signature legal check fails", async () => {
		const signTypedData = vi.fn().mockResolvedValue(RAW_SIGNATURE);
		const beforeSubmit = vi.fn().mockRejectedValue(new Error("Legal access changed after signing"));
		const { client, request } = createClient(createWalletClient(signTypedData), beforeSubmit);

		await expect(client.approveAgent({ agentAddress: OTHER_ADDRESS, agentName: "Mobile" })).rejects.toMatchObject({
			message: "Failed to sign the typed data using the wallet",
			cause: expect.objectContaining({ message: "Legal access changed after signing" }),
		});
		expect(signTypedData).toHaveBeenCalledOnce();
		expect(beforeSubmit).toHaveBeenCalledOnce();
		expect(request).not.toHaveBeenCalled();
	});

	it("fails closed before signing when the active Wagmi account does not match", () => {
		expect(() =>
			createExternalAgentSigner({
				expectedAddress: EXPECTED_ADDRESS,
				walletClient: createWalletClient(vi.fn(), OTHER_ADDRESS),
				beforeSubmit: vi.fn(),
			}),
		).toThrow(/does not match/);
	});
});
