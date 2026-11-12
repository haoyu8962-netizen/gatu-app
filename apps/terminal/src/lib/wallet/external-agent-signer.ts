import type { AbstractViemJsonRpcAccount } from "@nktkas/hyperliquid/signing";
import { WalletAccountMismatchError } from "@sairn/hl-react";
import { recoverTypedDataAddress, type WalletClient } from "viem";
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
			await assertTypedDataSignedBy(typedData, signature, expectedAddress);
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

/**
 * Hyperliquid executes an owner action for the address it recovers from the signature, so a wallet that signed
 * with another account (or returned a contract-wallet signature) must never reach the exchange.
 */
export async function assertTypedDataSignedBy(
	typedData: HyperliquidTypedData,
	signature: `0x${string}`,
	expectedAddress: `0x${string}`,
): Promise<void> {
	let recovered: `0x${string}`;
	try {
		recovered = await recoverTypedDataAddress({
			domain: typedData.domain,
			types: typedData.types,
			primaryType: typedData.primaryType,
			message: typedData.message,
			signature,
		} as Parameters<typeof recoverTypedDataAddress>[0]);
	} catch {
		throw new WalletAccountMismatchError();
	}
	if (!hasSameWalletAddress(recovered, expectedAddress)) throw new WalletAccountMismatchError();
}
