import type { AbstractViemJsonRpcAccount, AbstractWallet } from "@nktkas/hyperliquid/signing";
import { type Account, recoverTypedDataAddress, type WalletClient } from "viem";
import { WalletAccountMismatchError } from "./errors";

type SignTypedDataParams = Parameters<AbstractViemJsonRpcAccount["signTypedData"]>[0];

type FullWalletClient = WalletClient & {
	getAddresses: () => Promise<`0x${string}`[]>;
	getChainId: () => Promise<number>;
};

type WalletClientLike = Pick<WalletClient, "signTypedData"> & {
	account?: Account | null;
	getAddresses?: () => Promise<`0x${string}`[]>;
	getChainId?: () => Promise<number>;
};

function isFullWalletClient(value: unknown): value is FullWalletClient {
	if (!value || typeof value !== "object") return false;
	const obj = value as Record<string, unknown>;
	return (
		typeof obj.signTypedData === "function" &&
		typeof obj.getAddresses === "function" &&
		typeof obj.getChainId === "function"
	);
}

function isWalletClientLike(value: unknown): value is WalletClientLike {
	if (!value || typeof value !== "object") return false;
	return "signTypedData" in value && typeof (value as WalletClientLike).signTypedData === "function";
}

function normalizeAddress(address: string | null | undefined): string | null {
	return address?.toLowerCase() ?? null;
}

export function walletClientMatchesAddress(walletClient: unknown, expectedAddress: string): boolean {
	if (!isWalletClientLike(walletClient)) return false;
	const walletAddress = normalizeAddress(walletClient.account?.address);
	const expected = normalizeAddress(expectedAddress);
	return !!walletAddress && !!expected && walletAddress === expected;
}

/**
 * Hyperliquid executes an owner action for the address it recovers from the signature, so a wallet that signed
 * with another account (or returned a contract-wallet signature) must never reach the exchange.
 */
export async function assertTypedDataSignedBy(
	typedData: SignTypedDataParams,
	signature: `0x${string}`,
	expectedAddress: string,
): Promise<void> {
	let recovered: string;
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
	if (normalizeAddress(recovered) !== normalizeAddress(expectedAddress)) throw new WalletAccountMismatchError();
}

export function toHyperliquidWallet(
	walletClient: unknown,
	expectedAddress?: `0x${string}` | null,
): AbstractWallet | null {
	if (isFullWalletClient(walletClient)) {
		const client = walletClient;
		if (expectedAddress && !walletClientMatchesAddress(client, expectedAddress)) return null;
		const account = client.account?.address;
		if (!account) return null;
		return {
			signTypedData: async (params: SignTypedDataParams) => {
				const signature = await client.signTypedData({
					account,
					domain: params.domain as Parameters<WalletClient["signTypedData"]>[0]["domain"],
					types: params.types as Parameters<WalletClient["signTypedData"]>[0]["types"],
					primaryType: params.primaryType,
					message: params.message,
				});
				await assertTypedDataSignedBy(params, signature, account);
				return signature;
			},
			getAddresses: () => Promise.resolve([account]),
			getChainId: () => client.getChainId(),
		} satisfies AbstractViemJsonRpcAccount;
	}

	if (!isWalletClientLike(walletClient)) return null;

	const client = walletClient;
	if (expectedAddress && !walletClientMatchesAddress(client, expectedAddress)) return null;
	const accountAddress = client.account?.address;

	if (!accountAddress) return null;

	return {
		address: accountAddress,
		signTypedData: async (params: SignTypedDataParams) => {
			const signature = await client.signTypedData({
				account: client.account ?? accountAddress,
				domain: params.domain as Parameters<WalletClient["signTypedData"]>[0]["domain"],
				types: params.types as Parameters<WalletClient["signTypedData"]>[0]["types"],
				primaryType: params.primaryType,
				message: params.message,
			});
			await assertTypedDataSignedBy(params, signature, accountAddress);
			return signature;
		},
	};
}
