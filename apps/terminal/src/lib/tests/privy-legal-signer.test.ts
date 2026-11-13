import { getWalletChainId } from "@nktkas/hyperliquid/signing";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it, vi } from "vitest";
import { createPrivyLegalSigner } from "@/lib/wallet/privy-legal-signer";
import { acceptHyperliquidTerms } from "../../../../../packages/hl-react/src/legal";

const OWNER = privateKeyToAccount(`0x${"0".repeat(63)}1`);
const OTHER_ACCOUNT = privateKeyToAccount(`0x${"0".repeat(63)}2`);
const EXPECTED_ADDRESS = OWNER.address;
const OTHER_ADDRESS = OTHER_ACCOUNT.address;

function signedBy(account: typeof OWNER) {
	return vi.fn(async (typedData: unknown, _options?: unknown) => ({
		signature: await account.signTypedData(typedData as never),
	}));
}

describe("createPrivyLegalSigner", () => {
	it("signs for the exact embedded wallet after application review without another Privy prompt", async () => {
		const signTypedData = signedBy(OWNER);
		const request = vi.fn().mockResolvedValue(null);
		const beforeSubmit = vi.fn();
		const signer = createPrivyLegalSigner({
			expectedAddress: EXPECTED_ADDRESS,
			activeAddress: EXPECTED_ADDRESS.toUpperCase() as `0x${string}`,
			embeddedWalletAddress: EXPECTED_ADDRESS,
			chainId: 42161,
			signTypedData,
			beforeSubmit,
		});

		expect(await signer.getAddresses()).toEqual([EXPECTED_ADDRESS]);
		expect(await getWalletChainId(signer)).toBe("0xa4b1");

		await acceptHyperliquidTerms({
			wallet: signer,
			transport: { isTestnet: false, request },
			env: "Mainnet",
			user: EXPECTED_ADDRESS,
			beforeSubmit: () => {},
			time: 1_722_000_000_000,
		});
		await signer.signTypedData({
			domain: {
				name: "HyperliquidSignTransaction",
				version: "1",
				chainId: 42161,
				verifyingContract: "0x0000000000000000000000000000000000000000",
			},
			types: { Example: [{ name: "value", type: "uint64" }] },
			primaryType: "Example",
			message: { value: 1 },
		});

		expect(signTypedData).toHaveBeenCalledTimes(2);
		expect(beforeSubmit).toHaveBeenCalledTimes(4);
		for (const [, options] of signTypedData.mock.calls) {
			expect(options).toEqual(
				expect.objectContaining({
					address: EXPECTED_ADDRESS,
					uiOptions: expect.objectContaining({
						showWalletUIs: false,
					}),
				}),
			);
		}
		expect(request).toHaveBeenCalledWith(
			"info",
			expect.objectContaining({ type: "acceptTerms2" }),
			expect.any(AbortSignal),
		);
		expect(String(request.mock.calls[0]?.[1]?.user).toLowerCase()).toBe(EXPECTED_ADDRESS.toLowerCase());
	});

	it("does not release a Privy signature when the post-sign wallet guard fails", async () => {
		const beforeSubmit = vi
			.fn()
			.mockImplementationOnce(() => {})
			.mockImplementation(() => {
				throw new Error("wallet changed");
			});
		const signer = createPrivyLegalSigner({
			expectedAddress: EXPECTED_ADDRESS,
			activeAddress: EXPECTED_ADDRESS,
			embeddedWalletAddress: EXPECTED_ADDRESS,
			chainId: 42161,
			signTypedData: signedBy(OWNER),
			beforeSubmit,
		});

		await expect(
			signer.signTypedData({
				domain: {
					name: "HyperliquidSignTransaction",
					version: "1",
					chainId: 42161,
					verifyingContract: "0x0000000000000000000000000000000000000000",
				},
				types: { Example: [{ name: "value", type: "uint64" }] },
				primaryType: "Example",
				message: { value: 1 },
			}),
		).rejects.toThrow("wallet changed");
	});

	it("fails closed when the active or embedded wallet does not match", () => {
		expect(() =>
			createPrivyLegalSigner({
				expectedAddress: EXPECTED_ADDRESS,
				activeAddress: OTHER_ADDRESS,
				embeddedWalletAddress: EXPECTED_ADDRESS,
				chainId: 42161,
				signTypedData: vi.fn(),
				beforeSubmit: vi.fn(),
			}),
		).toThrow(/does not match/);

		expect(() =>
			createPrivyLegalSigner({
				expectedAddress: EXPECTED_ADDRESS,
				activeAddress: EXPECTED_ADDRESS,
				embeddedWalletAddress: undefined,
				chainId: 42161,
				signTypedData: vi.fn(),
				beforeSubmit: vi.fn(),
			}),
		).toThrow(/does not match/);
	});

	it("rejects an invalid signing chain before creating an adapter", () => {
		expect(() =>
			createPrivyLegalSigner({
				expectedAddress: EXPECTED_ADDRESS,
				activeAddress: EXPECTED_ADDRESS,
				embeddedWalletAddress: EXPECTED_ADDRESS,
				chainId: 0,
				signTypedData: vi.fn(),
				beforeSubmit: vi.fn(),
			}),
		).toThrow(/valid terms-signing chain/);
	});

	it.each([
		["another account of the same wallet", () => signedBy(OTHER_ACCOUNT)],
		["an unrecoverable signature", () => vi.fn().mockResolvedValue({ signature: `0x${"11".repeat(64)}1b` })],
	])("does not release a signature made by %s", async (_, createSign) => {
		const beforeSubmit = vi.fn();
		const signer = createPrivyLegalSigner({
			expectedAddress: EXPECTED_ADDRESS,
			activeAddress: EXPECTED_ADDRESS,
			embeddedWalletAddress: EXPECTED_ADDRESS,
			chainId: 42161,
			signTypedData: createSign(),
			beforeSubmit,
		});

		await expect(
			signer.signTypedData({
				domain: {
					name: "HyperliquidSignTransaction",
					version: "1",
					chainId: 42161,
					verifyingContract: "0x0000000000000000000000000000000000000000",
				},
				types: { Example: [{ name: "value", type: "uint64" }] },
				primaryType: "Example",
				message: { value: 1 },
			}),
		).rejects.toMatchObject({ name: "WalletAccountMismatchError" });
		expect(beforeSubmit).toHaveBeenCalledOnce();
	});
});
