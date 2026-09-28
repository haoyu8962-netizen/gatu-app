import { createConfig, EVM } from "@lifi/sdk";
import { msg } from "@lingui/core/macro";
import type { Config as WagmiConfig } from "@wagmi/core";
import { getAccount, getConnectorClient, switchChain } from "@wagmi/core";
import type { Client } from "viem";
import { LIFI_INTEGRATOR } from "@/config/app";
import { config as wagmiConfig } from "@/config/wagmi";
import { createActionError } from "@/lib/errors/action-error";
import { LocalizedActionError } from "@/lib/errors/localized-action-error";

const wc = wagmiConfig as unknown as WagmiConfig;
let lifiInitialized = false;
let requiredExecutionIdentity: { walletAddress: `0x${string}`; sourceChainId: number } | null = null;

const ROUTE_WALLET_MISMATCH = msg`The active wallet does not match this bridge route.`;
const ROUTE_CHAIN_MISMATCH = msg`LI.FI requested a network that does not match this bridge route.`;
const WALLET_CHAIN_MISMATCH = msg`The wallet network does not match this bridge route. Switch networks in your wallet and try again.`;

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
		throw createActionError("wallet-unavailable");
	}
	if (!hasSameAddress(account.address, identity.walletAddress)) {
		throw new LocalizedActionError(ROUTE_WALLET_MISMATCH);
	}
	return account.address;
}

async function getActiveWalletClient(requestedChainId?: number): Promise<Client> {
	const identity = getRequiredExecutionIdentity();
	if (requestedChainId !== undefined && requestedChainId !== identity.sourceChainId) {
		throw new LocalizedActionError(ROUTE_CHAIN_MISMATCH);
	}

	const accountAddress = getRequiredActiveWalletAddress(identity);

	const client = await getConnectorClient(wc, {
		account: accountAddress,
		chainId: identity.sourceChainId,
	});
	if (!hasSameAddress(client.account?.address, identity.walletAddress)) {
		throw new LocalizedActionError(ROUTE_WALLET_MISMATCH);
	}
	if (client.chain?.id !== identity.sourceChainId) {
		throw new LocalizedActionError(WALLET_CHAIN_MISMATCH);
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
						throw new LocalizedActionError(ROUTE_CHAIN_MISMATCH);
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
