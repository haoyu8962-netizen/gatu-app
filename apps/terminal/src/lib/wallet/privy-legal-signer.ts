import type { AbstractViemJsonRpcAccount } from "@nktkas/hyperliquid/signing";
import type { SignTypedDataParams } from "@privy-io/react-auth";
import type { PrivySignTypedData } from "./privy-agent-signer";
import { hasSameWalletAddress } from "./privy-wagmi";

interface CreatePrivyLegalSignerOptions {
	expectedAddress: `0x${string}`;
	activeAddress: `0x${string}` | undefined;
	embeddedWalletAddress: `0x${string}` | undefined;
	chainId: number;
	signTypedData: PrivySignTypedData;
	beforeSubmit: () => void | Promise<void>;
}

type HyperliquidTypedData = Parameters<AbstractViemJsonRpcAccount["signTypedData"]>[0];

/**
 * Creates the narrow wallet adapter used only for explicit Hyperliquid terms
 * acceptance. Every signature is bound to the exact active embedded wallet
 * and forces Privy's per-call confirmation UI.
 */
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
			const result = await signTypedData(typedData as SignTypedDataParams, {
				address: expectedAddress,
				uiOptions: {
					showWalletUIs: true,
					title: "Accept Hyperliquid terms",
					description: "Review and accept the Hyperliquid terms for this account.",
					buttonText: "Accept terms",
					isCancellable: true,
				},
			});
			await beforeSubmit();
			return result.signature as `0x${string}`;
		},
		async getAddresses(): Promise<`0x${string}`[]> {
			return [expectedAddress];
		},
		async getChainId(): Promise<number> {
			return chainId;
		},
	};
}
