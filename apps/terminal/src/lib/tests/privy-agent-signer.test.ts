import { ApproveAgentTypes } from "@nktkas/hyperliquid/api/exchange";
import { getWalletChainId, signUserSignedAction } from "@nktkas/hyperliquid/signing";
import { describe, expect, it, vi } from "vitest";
import { createPrivyAgentSigner } from "@/lib/wallet/privy-agent-signer";

const EXPECTED_ADDRESS = "0x1111111111111111111111111111111111111111";
const OTHER_ADDRESS = "0x2222222222222222222222222222222222222222";

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

describe("createPrivyAgentSigner", () => {
	it("targets the exact embedded wallet and forces an explicit approval UI", async () => {
		const signTypedData = vi.fn().mockResolvedValue({ signature: `0x${"1".repeat(130)}` });
		const signer = createPrivyAgentSigner({
			expectedAddress: EXPECTED_ADDRESS,
			activeAddress: EXPECTED_ADDRESS.toUpperCase() as `0x${string}`,
			embeddedWalletAddress: EXPECTED_ADDRESS,
			chainId: 42161,
			signTypedData,
		});

		await signer.signTypedData(typedData);

		expect(await signer.getAddresses()).toEqual([EXPECTED_ADDRESS]);
		expect(await signer.getChainId()).toBe(42161);
		expect(signTypedData).toHaveBeenCalledWith(
			typedData,
			expect.objectContaining({
				address: EXPECTED_ADDRESS,
				uiOptions: expect.objectContaining({
					showWalletUIs: true,
					isCancellable: true,
				}),
			}),
		);
	});

	it("is selected by SDK 0.33.3 as a JSON-RPC wallet with the expected approval chain", async () => {
		const rawSignature = `0x${"11".repeat(64)}1b` as const;
		const signTypedData = vi.fn().mockResolvedValue({ signature: rawSignature });
		const signer = createPrivyAgentSigner({
			expectedAddress: EXPECTED_ADDRESS,
			activeAddress: EXPECTED_ADDRESS,
			embeddedWalletAddress: EXPECTED_ADDRESS,
			chainId: 42161,
			signTypedData,
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
			r: `0x${"11".repeat(32)}`,
			s: `0x${"11".repeat(32)}`,
			v: 27,
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

	it("fails closed when the active wallet does not match", () => {
		expect(() =>
			createPrivyAgentSigner({
				expectedAddress: EXPECTED_ADDRESS,
				activeAddress: OTHER_ADDRESS,
				embeddedWalletAddress: EXPECTED_ADDRESS,
				chainId: 42161,
				signTypedData: vi.fn(),
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
			}),
		).toThrow(/does not match/);
	});
});
