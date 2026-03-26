import type { ChainType, ExtendedChain, WalletTokenExtended } from "@lifi/sdk";
import { getChains, getWalletBalances } from "@lifi/sdk";
import { useQuery } from "@tanstack/react-query";
import Big from "big.js";

const DUST_THRESHOLD_USD = 2;

export interface BridgeToken {
	chainId: number;
	address: string;
	symbol: string;
	name: string;
	decimals: number;
	logoURI: string | undefined;
	priceUSD: string;
	amount: string;
	amountUSD: number;
	chainName: string;
	chainLogoURI: string | undefined;
	isDust: boolean;
}

function buildTokenList(
	balancesByChain: Record<number, WalletTokenExtended[]>,
	chainsMap: Map<number, ExtendedChain>,
): BridgeToken[] {
	const tokens: BridgeToken[] = [];

	for (const [chainIdStr, chainTokens] of Object.entries(balancesByChain)) {
		const chainId = Number(chainIdStr);
		const chain = chainsMap.get(chainId);

		for (const token of chainTokens) {
			if (!token.amount || token.amount === "0") continue;

			const amountUSD = Big(token.amount)
				.div(Big(10).pow(token.decimals))
				.times(token.priceUSD || "0")
				.toNumber();

			if (amountUSD <= 0) continue;

			tokens.push({
				chainId,
				address: token.address,
				symbol: token.symbol,
				name: token.name,
				decimals: token.decimals,
				logoURI: token.logoURI,
				priceUSD: token.priceUSD,
				amount: token.amount,
				amountUSD,
				chainName: chain?.name ?? `Chain ${chainId}`,
				chainLogoURI: chain?.logoURI,
				isDust: amountUSD < DUST_THRESHOLD_USD,
			});
		}
	}

	tokens.sort((a, b) => b.amountUSD - a.amountUSD);
	return tokens;
}

export function useBridgeBalances(walletAddress: string | undefined) {
	return useQuery({
		queryKey: ["lifi-balances", walletAddress],
		queryFn: async () => {
			const [balancesByChain, chains] = await Promise.all([
				getWalletBalances(walletAddress as string),
				getChains({ chainTypes: ["EVM" as ChainType] }),
			]);

			const chainsMap = new Map<number, ExtendedChain>();
			for (const chain of chains) {
				chainsMap.set(chain.id, chain);
			}

			return buildTokenList(balancesByChain, chainsMap);
		},
		enabled: !!walletAddress,
		staleTime: 60_000,
	});
}
