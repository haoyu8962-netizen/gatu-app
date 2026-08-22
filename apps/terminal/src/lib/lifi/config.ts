import { createConfig, EVM } from "@lifi/sdk";
import type { Config as WagmiConfig } from "@wagmi/core";
import { getAccount, getConnectorClient, switchChain } from "@wagmi/core";
import type { Client } from "viem";
import { LIFI_INTEGRATOR } from "@/config/app";
import { config as wagmiConfig } from "@/config/wagmi";

const wc = wagmiConfig as unknown as WagmiConfig;
let lifiInitialized = false;
let requiredExecutionIdentity: { walletAddress: `0x${string}`; sourceChainId: number } | null = null;

function hasSameAddress(left: string | undefined, right: string | undefined): boolean {
	return !!left && !!right && left.toLowerCase() === right.toLowerCase();
}

export function getActiveLiFiWalletAddress(): `0x${string}` | null {
	const account = getAccount(wc);
	return account.isConnected && account.address ? account.address : null;
}

function getRequiredExecutionIdentity() {
	if (!requiredExecutionIdentity) {
		throw new Error("LI.FI wallet access is unavailable outside a bound bridge execution.");
	}
	return requiredExecutionIdentity;
}

function getRequiredActiveWalletAddress(identity: { walletAddress: `0x${string}` }): `0x${string}` {
	const account = getAccount(wc);
	if (!account.isConnected || !account.address) {
		throw new Error("Wallet connection unavailable. Reconnect your wallet and try again.");
	}
	if (!hasSameAddress(account.address, identity.walletAddress)) {
		throw new Error("The active wallet does not match this bridge route.");
	}
	return account.address;
}

async function getActiveWalletClient(requestedChainId?: number): Promise<Client> {
	const identity = getRequiredExecutionIdentity();
	if (requestedChainId !== undefined && requestedChainId !== identity.sourceChainId) {
		throw new Error("LI.FI requested a chain that does not match this bridge route.");
	}

	const accountAddress = getRequiredActiveWalletAddress(identity);

	const client = await getConnectorClient(wc, {
		account: accountAddress,
		chainId: identity.sourceChainId,
	});
	if (!hasSameAddress(client.account?.address, identity.walletAddress)) {
		throw new Error("The wallet client does not match this bridge route.");
	}
	if (client.chain?.id !== identity.sourceChainId) {
		throw new Error("The wallet client chain does not match this bridge route.");
	}
	return client as Client;
}

export async function runWithLiFiExecutionWallet<T>(
	walletAddress: `0x${string}`,
	sourceChainId: number,
	execute: () => Promise<T>,
): Promise<T> {
	if (!Number.isSafeInteger(sourceChainId) || sourceChainId <= 0) {
		throw new Error("The bridge route source chain is invalid.");
	}
	if (
		requiredExecutionIdentity &&
		(!hasSameAddress(requiredExecutionIdentity.walletAddress, walletAddress) ||
			requiredExecutionIdentity.sourceChainId !== sourceChainId)
	) {
		throw new Error("Another bridge route is already bound to a different wallet or chain.");
	}

	requiredExecutionIdentity = { walletAddress, sourceChainId };
	try {
		return await execute();
	} finally {
		if (
			hasSameAddress(requiredExecutionIdentity?.walletAddress, walletAddress) &&
			requiredExecutionIdentity?.sourceChainId === sourceChainId
		) {
			requiredExecutionIdentity = null;
		}
	}
}

export function initLiFi() {
	if (lifiInitialized) return;

	createConfig({
		integrator: LIFI_INTEGRATOR,
		providers: [
			EVM({
				getWalletClient: (chainId?: number) => getActiveWalletClient(chainId),
				switchChain: async (chainId: number) => {
					const identity = getRequiredExecutionIdentity();
					if (chainId !== identity.sourceChainId) {
						throw new Error("LI.FI requested a chain that does not match this bridge route.");
					}
					getRequiredActiveWalletAddress(identity);
					await switchChain(wc, { chainId });
					return getActiveWalletClient(chainId);
				},
			}),
		],
	});
	lifiInitialized = true;
}
