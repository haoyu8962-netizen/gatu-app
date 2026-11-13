import { ExchangeClient, type IRequestTransport } from "@nktkas/hyperliquid";
import { ApproveAgentTypes } from "@nktkas/hyperliquid/api/exchange";
import { getWalletChainId, signUserSignedAction } from "@nktkas/hyperliquid/signing";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it, vi } from "vitest";
import { createPrivyAgentSigner } from "@/lib/wallet/privy-agent-signer";

const OWNER_ACCOUNT = privateKeyToAccount(`0x${"0".repeat(63)}1`);
const OTHER_ACCOUNT = privateKeyToAccount(`0x${"0".repeat(63)}2`);
const EXPECTED_ADDRESS = OWNER_ACCOUNT.address.toLowerCase() as `0x${string}`;
const OTHER_ADDRESS = "0x2222222222222222222222222222222222222222";
type TypedData = Parameters<typeof OWNER_ACCOUNT.signTypedData>[0];

async function signAsOwner(typedData: unknown) {
	return { signature: await OWNER_ACCOUNT.signTypedData(typedData as TypedData) };
}

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

const typedData = {
	domain: {
		name: "HyperliquidSignTransaction",
		version: "1",
		chainId: 42161,
		verifyingContract: "0x0000000000000000000000000000000000000000" as const,
	},
	types: {
		"HyperliquidTransaction:ApproveAgent": [
			{ name: "hyperliquidChain", type: "string" },
			{ name: "agentAddress", type: "address" },
		],
	},
	primaryType: "HyperliquidTransaction:ApproveAgent",
	message: {
		hyperliquidChain: "Mainnet",
		agentAddress: OTHER_ADDRESS,
	},
};

const REVIEW_COPY = {
	title: "批准手机交易权限",
	description: "请检查并批准此 Hyperliquid Agent 权限。",
	buttonText: "批准权限",
};

describe("createPrivyAgentSigner", () => {
	it("targets the exact embedded wallet and forces an explicit approval UI", async () => {
		const signTypedData = vi.fn(signAsOwner);
		const signer = createPrivyAgentSigner({
			expectedAddress: EXPECTED_ADDRESS,
			activeAddress: EXPECTED_ADDRESS.toUpperCase() as `0x${string}`,
			embeddedWalletAddress: EXPECTED_ADDRESS,
			chainId: 42161,
			signTypedData,
			beforeSubmit: vi.fn(),
			reviewCopy: REVIEW_COPY,
		});

		await signer.signTypedData(typedData);

		expect(await signer.getAddresses()).toEqual([EXPECTED_ADDRESS]);
		expect(await signer.getChainId()).toBe(42161);
		expect(signTypedData).toHaveBeenCalledWith(
			typedData,
			expect.objectContaining({
				address: EXPECTED_ADDRESS,
				uiOptions: { showWalletUIs: true, ...REVIEW_COPY, isCancellable: true },
			}),
		);
	});

	it("hides only the Privy confirmation after an application review is confirmed", async () => {
		const signTypedData = vi.fn(signAsOwner);
		const signer = createPrivyAgentSigner({
			applicationReview: "confirmed",
			expectedAddress: EXPECTED_ADDRESS,
			activeAddress: EXPECTED_ADDRESS,
			embeddedWalletAddress: EXPECTED_ADDRESS,
			chainId: 42161,
			signTypedData,
			beforeSubmit: vi.fn(),
			reviewCopy: REVIEW_COPY,
		});

		await signer.signTypedData(typedData);

		expect(signTypedData).toHaveBeenCalledWith(typedData, {
			address: EXPECTED_ADDRESS,
			uiOptions: { showWalletUIs: false },
		});
	});

	it("is selected by SDK 0.33.3 as a JSON-RPC wallet with the expected approval chain", async () => {
		let rawSignature = "";
		const signTypedData = vi.fn(async (typedData: unknown) => {
			const result = await signAsOwner(typedData);
			rawSignature = result.signature;
			return result;
		});
		const signer = createPrivyAgentSigner({
			expectedAddress: EXPECTED_ADDRESS,
			activeAddress: EXPECTED_ADDRESS,
			embeddedWalletAddress: EXPECTED_ADDRESS,
			chainId: 42161,
			signTypedData,
			beforeSubmit: vi.fn(),
			reviewCopy: REVIEW_COPY,
		});

		expect(signer.signTypedData.length).toBe(1);
		expect(await getWalletChainId(signer)).toBe("0xa4b1");

		const signature = await signUserSignedAction({
			wallet: signer,
			action: {
				type: "approveAgent",
				signatureChainId: "0xa4b1",
				hyperliquidChain: "Mainnet",
				agentAddress: OTHER_ADDRESS,
				agentName: "Mobile valid_until 1779364228000",
				nonce: 1_779_364_227_000,
			},
			types: ApproveAgentTypes,
		});

		expect(signature).toEqual({
			r: rawSignature.slice(0, 66),
			s: `0x${rawSignature.slice(66, 130)}`,
			v: Number.parseInt(rawSignature.slice(130), 16),
		});
		expect(signTypedData).toHaveBeenCalledWith(
			expect.objectContaining({
				domain: expect.objectContaining({ chainId: 42161 }),
				types: expect.objectContaining({
					EIP712Domain: expect.any(Array),
					"HyperliquidTransaction:ApproveAgent": ApproveAgentTypes["HyperliquidTransaction:ApproveAgent"],
				}),
				primaryType: "HyperliquidTransaction:ApproveAgent",
			}),
			expect.objectContaining({
				address: EXPECTED_ADDRESS,
				uiOptions: expect.objectContaining({ showWalletUIs: true }),
			}),
		);
	});

	it("revalidates after Privy signs and prevents the real SDK boundary from submitting a stale owner", async () => {
		const signature = createDeferred<void>();
		const signTypedData = vi.fn(async (typedData: unknown) => {
			await signature.promise;
			return signAsOwner(typedData);
		});
		let activeOwner = EXPECTED_ADDRESS;
		const beforeSubmit = vi.fn(() => {
			if (activeOwner !== EXPECTED_ADDRESS) throw new Error("Approval owner changed after signing");
		});
		const signer = createPrivyAgentSigner({
			expectedAddress: EXPECTED_ADDRESS,
			activeAddress: EXPECTED_ADDRESS,
			embeddedWalletAddress: EXPECTED_ADDRESS,
			chainId: 42161,
			signTypedData,
			beforeSubmit,
			reviewCopy: REVIEW_COPY,
		});
		const request = vi.fn().mockResolvedValue({ status: "ok", response: { type: "default" } });
		const client = new ExchangeClient({
			transport: { isTestnet: false, request } as IRequestTransport,
			wallet: signer,
			nonceManager: () => 1_722_000_000_000,
		});

		const approval = client.approveAgent({ agentAddress: OTHER_ADDRESS, agentName: "Mobile" });
		await vi.waitFor(() => expect(signTypedData).toHaveBeenCalledOnce());
		activeOwner = OTHER_ADDRESS;
		signature.resolve();

		await expect(approval).rejects.toMatchObject({
			message: "Failed to sign the typed data using the wallet",
			cause: expect.objectContaining({ message: "Approval owner changed after signing" }),
		});
		expect(beforeSubmit).toHaveBeenCalledOnce();
		expect(request).not.toHaveBeenCalled();
	});

	it("prevents the real SDK transport when the post-signature legal check fails", async () => {
		const signTypedData = vi.fn(signAsOwner);
		const beforeSubmit = vi.fn().mockRejectedValue(new Error("Legal access changed after signing"));
		const signer = createPrivyAgentSigner({
			expectedAddress: EXPECTED_ADDRESS,
			activeAddress: EXPECTED_ADDRESS,
			embeddedWalletAddress: EXPECTED_ADDRESS,
			chainId: 42161,
			signTypedData,
			beforeSubmit,
			reviewCopy: REVIEW_COPY,
		});
		const request = vi.fn().mockResolvedValue({ status: "ok", response: { type: "default" } });
		const client = new ExchangeClient({
			transport: { isTestnet: false, request } as IRequestTransport,
			wallet: signer,
			nonceManager: () => 1_722_000_000_001,
		});

		await expect(client.approveAgent({ agentAddress: OTHER_ADDRESS, agentName: "Mobile" })).rejects.toMatchObject({
			message: "Failed to sign the typed data using the wallet",
			cause: expect.objectContaining({ message: "Legal access changed after signing" }),
		});
		expect(signTypedData).toHaveBeenCalledOnce();
		expect(beforeSubmit).toHaveBeenCalledOnce();
		expect(signTypedData.mock.invocationCallOrder[0]).toBeLessThan(beforeSubmit.mock.invocationCallOrder[0] ?? 0);
		expect(request).not.toHaveBeenCalled();
	});

	it("submits an approval that recovers to the expected embedded owner through the real SDK", async () => {
		const beforeSubmit = vi.fn();
		const signer = createPrivyAgentSigner({
			expectedAddress: EXPECTED_ADDRESS,
			activeAddress: EXPECTED_ADDRESS,
			embeddedWalletAddress: EXPECTED_ADDRESS,
			chainId: 42161,
			signTypedData: vi.fn(signAsOwner),
			beforeSubmit,
			reviewCopy: REVIEW_COPY,
		});
		const request = vi.fn().mockResolvedValue({ status: "ok", response: { type: "default" } });
		const client = new ExchangeClient({
			transport: { isTestnet: false, request } as IRequestTransport,
			wallet: signer,
			nonceManager: () => 1_722_000_000_002,
		});

		await client.approveAgent({ agentAddress: OTHER_ADDRESS, agentName: "Mobile" });

		expect(beforeSubmit).toHaveBeenCalledOnce();
		expect(request).toHaveBeenCalledOnce();
	});

	it.each([
		[
			"another embedded wallet",
			async (typedData: unknown) => ({ signature: await OTHER_ACCOUNT.signTypedData(typedData as TypedData) }),
		],
		["an unrecoverable signature", async () => ({ signature: `0x${"11".repeat(64)}1b` })],
		["a contract-wallet signature", async () => ({ signature: `0x${"ab".repeat(130)}` })],
	])("never submits an approval signed by %s", async (_label, sign) => {
		const signTypedData = vi.fn(sign);
		const beforeSubmit = vi.fn();
		const signer = createPrivyAgentSigner({
			expectedAddress: EXPECTED_ADDRESS,
			activeAddress: EXPECTED_ADDRESS,
			embeddedWalletAddress: EXPECTED_ADDRESS,
			chainId: 42161,
			signTypedData,
			beforeSubmit,
			reviewCopy: REVIEW_COPY,
		});
		const request = vi.fn().mockResolvedValue({ status: "ok", response: { type: "default" } });
		const client = new ExchangeClient({
			transport: { isTestnet: false, request } as IRequestTransport,
			wallet: signer,
			nonceManager: () => 1_722_000_000_003,
		});

		await expect(client.approveAgent({ agentAddress: OTHER_ADDRESS, agentName: "Mobile" })).rejects.toMatchObject({
			cause: expect.objectContaining({ name: "WalletAccountMismatchError" }),
		});
		expect(signTypedData).toHaveBeenCalledOnce();
		expect(beforeSubmit).not.toHaveBeenCalled();
		expect(request).not.toHaveBeenCalled();
	});

	it("fails closed when the active wallet does not match", () => {
		expect(() =>
			createPrivyAgentSigner({
				expectedAddress: EXPECTED_ADDRESS,
				activeAddress: OTHER_ADDRESS,
				embeddedWalletAddress: EXPECTED_ADDRESS,
				chainId: 42161,
				signTypedData: vi.fn(),
				beforeSubmit: vi.fn(),
				reviewCopy: REVIEW_COPY,
			}),
		).toThrow(/does not match/);
	});

	it("fails closed when the expected embedded wallet is unavailable", () => {
		expect(() =>
			createPrivyAgentSigner({
				expectedAddress: EXPECTED_ADDRESS,
				activeAddress: EXPECTED_ADDRESS,
				embeddedWalletAddress: undefined,
				chainId: 42161,
				signTypedData: vi.fn(),
				beforeSubmit: vi.fn(),
				reviewCopy: REVIEW_COPY,
			}),
		).toThrow(/does not match/);
	});
});
