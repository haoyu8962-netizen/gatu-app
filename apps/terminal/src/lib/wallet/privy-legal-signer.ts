import type { AbstractViemJsonRpcAccount } from "@nktkas/hyperliquid/signing";
import type { SignTypedDataParams } from "@privy-io/react-auth";
import { assertTypedDataSignedBy } from "./external-agent-signer";
import type { PrivySignTypedData } from "./privy-agent-signer";
import { hasSameWalletAddress } from "./privy-wagmi";

interface CreatePrivyLegalSignerOptions {
	expectedAddress: `0x${string}`;
	activeAddress: `0x${string}` | undefined;
	embeddedWalletAddress: `0x${string}` | undefined;
	chainId: number;
	signTypedData: PrivySignTypedData;
	beforeSubmit: () => void;
}

type HyperliquidTypedData = Parameters<AbstractViemJsonRpcAccount["signTypedData"]>[0];

export function createPrivyLegalSigner({
	expectedAddress,
	activeAddress,
	embeddedWalletAddress,
	chainId,
	signTypedData,
	beforeSubmit,
}: CreatePrivyLegalSignerOptions): AbstractViemJsonRpcAccount {
	if (
		!hasSameWalletAddress(expectedAddress, activeAddress) ||
		!hasSameWalletAddress(expectedAddress, embeddedWalletAddress)
	) {
		throw new Error("The active embedded wallet does not match the selected Hyperliquid account.");
	}
	if (!Number.isSafeInteger(chainId) || chainId <= 0) {
		throw new Error("A valid terms-signing chain is required.");
	}

	return {
		async signTypedData(typedData: HyperliquidTypedData): Promise<`0x${string}`> {
			beforeSubmit();
			const result = await signTypedData(typedData as SignTypedDataParams, {
				address: expectedAddress,
				uiOptions: { showWalletUIs: false },
			});
			const signature = result.signature as `0x${string}`;
			await assertTypedDataSignedBy(typedData, signature, expectedAddress);
			beforeSubmit();
			return signature;
		},
		async getAddresses(): Promise<`0x${string}`[]> {
			return [expectedAddress];
		},
		async getChainId(): Promise<number> {
			return chainId;
		},
	};
}
