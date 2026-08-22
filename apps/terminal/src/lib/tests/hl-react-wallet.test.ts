import { describe, expect, it, vi } from "vitest";
import { toHyperliquidWallet, walletClientMatchesAddress } from "../../../../../packages/hl-react/src/wallet";

const ACCOUNT_ADDRESS = "0x1111111111111111111111111111111111111111" as const;
const OTHER_ADDRESS = "0x2222222222222222222222222222222222222222" as const;

function createWalletClient(address = ACCOUNT_ADDRESS) {
	return {
		account: { address },
		getAddresses: vi.fn().mockResolvedValue([address]),
		getChainId: vi.fn().mockResolvedValue(42161),
		signTypedData: vi.fn().mockResolvedValue(`0x${"ab".repeat(65)}`),
	};
}

describe("Hyperliquid wallet adapter", () => {
	it("matches the active wallet account case-insensitively", () => {
		const client = createWalletClient();

		expect(walletClientMatchesAddress(client, ACCOUNT_ADDRESS.toUpperCase())).toBe(true);
	});

	it("rejects an expected address that differs from the active signer", () => {
		const client = createWalletClient();

		expect(toHyperliquidWallet(client, OTHER_ADDRESS)).toBeNull();
		expect(client.signTypedData).not.toHaveBeenCalled();
	});

	it("uses the active account when the expected address matches", async () => {
		const client = createWalletClient();
		const wallet = toHyperliquidWallet(client, ACCOUNT_ADDRESS);

		expect(wallet).not.toBeNull();
		const typedDataWallet = wallet as unknown as {
			signTypedData: (params: {
				domain: Record<string, unknown>;
				message: Record<string, unknown>;
				primaryType: string;
				types: Record<string, unknown>;
			}) => Promise<unknown>;
		};
		await typedDataWallet.signTypedData({
			domain: {},
			types: {},
			primaryType: "Test",
			message: {},
		});

		expect(client.signTypedData).toHaveBeenCalledWith(expect.objectContaining({ account: ACCOUNT_ADDRESS }));
	});
});
