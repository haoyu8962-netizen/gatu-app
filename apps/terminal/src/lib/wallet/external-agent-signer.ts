import type { AbstractViemJsonRpcAccount } from "@nktkas/hyperliquid/signing";
import type { WalletClient } from "viem";
import { hasSameWalletAddress } from "./privy-wagmi";

type HyperliquidTypedData = Parameters<AbstractViemJsonRpcAccount["signTypedData"]>[0];

interface CreateExternalAgentSignerOptions {
	expectedAddress: `0x${string}`;
	walletClient: WalletClient;
	beforeSubmit: () => void | Promise<void>;
}

export function createExternalAgentSigner({
	expectedAddress,
	walletClient,
	beforeSubmit,
}: CreateExternalAgentSignerOptions): AbstractViemJsonRpcAccount {
	assertExpectedWallet(walletClient, expectedAddress);
	const account = walletClient.account;
	if (!account) throw new Error("The active external wallet does not match the selected Hyperliquid account.");

	return {
		async signTypedData(typedData: HyperliquidTypedData): Promise<`0x${string}`> {
			assertExpectedWallet(walletClient, expectedAddress);
			const signature = await walletClient.signTypedData({
				account,
				domain: typedData.domain as Parameters<WalletClient["signTypedData"]>[0]["domain"],
				types: typedData.types as Parameters<WalletClient["signTypedData"]>[0]["types"],
				primaryType: typedData.primaryType,
				message: typedData.message,
			});
			await beforeSubmit();
			return signature;
		},
		async getAddresses(): Promise<`0x${string}`[]> {
			assertExpectedWallet(walletClient, expectedAddress);
			return [expectedAddress];
		},
		async getChainId(): Promise<number> {
			assertExpectedWallet(walletClient, expectedAddress);
			return walletClient.getChainId();
		},
	};
}

function assertExpectedWallet(walletClient: WalletClient, expectedAddress: `0x${string}`): void {
	if (!hasSameWalletAddress(walletClient.account?.address, expectedAddress)) {
		throw new Error("The active external wallet does not match the selected Hyperliquid account.");
	}
}
