import { useQuery } from "@tanstack/react-query";
import { createPublicClient, formatUnits, http } from "viem";
import { CORE_DEPOSIT_WALLET_ABI } from "@/config/abi/core-deposit-wallet";
import { ARBITRUM_CCTP_DOMAIN, CCTP_NETWORKS } from "@/config/cctp";
import { USDC_DECIMALS } from "@/config/contracts";

const CCTP_FEE_STALE_TIME_MS = 60_000;

const clients = {
	mainnet: createPublicClient({ transport: http(CCTP_NETWORKS.mainnet.hyperEvmRpcUrl) }),
	testnet: createPublicClient({ transport: http(CCTP_NETWORKS.testnet.hyperEvmRpcUrl) }),
};

export function getCctpWithdrawalFeeRequest(isTestnet: boolean) {
	const environment = isTestnet ? "testnet" : "mainnet";
	return {
		address: CCTP_NETWORKS[environment].coreDepositWallet,
		abi: CORE_DEPOSIT_WALLET_ABI,
		functionName: "calculateCrossChainWithdrawalFee" as const,
		args: [true, ARBITRUM_CCTP_DOMAIN] as const,
	};
}

export async function fetchCctpWithdrawalFee(isTestnet: boolean): Promise<string> {
	const environment = isTestnet ? "testnet" : "mainnet";
	const fee = await clients[environment].readContract(getCctpWithdrawalFeeRequest(isTestnet));
	return formatUnits(fee, USDC_DECIMALS);
}

export function useCctpWithdrawalFee({ enabled, isTestnet }: { enabled: boolean; isTestnet: boolean }) {
	return useQuery({
		queryKey: ["cctp", "withdrawal-fee", isTestnet ? "testnet" : "mainnet", ARBITRUM_CCTP_DOMAIN],
		queryFn: () => fetchCctpWithdrawalFee(isTestnet),
		enabled,
		staleTime: CCTP_FEE_STALE_TIME_MS,
		refetchOnWindowFocus: true,
	});
}
