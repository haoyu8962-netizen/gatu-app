import type { WalletClient } from "viem";
import { useConnection, useWalletClient } from "wagmi";

export interface ConnectionWalletClientResult {
	data: WalletClient | undefined;
	error: Error | null;
	isLoading: boolean;
}

export function useConnectionWalletClient(): ConnectionWalletClientResult {
	const { chainId } = useConnection();
	const { data, error, isLoading } = useWalletClient(chainId === undefined ? undefined : { chainId });
	return { data: data as WalletClient | undefined, error, isLoading };
}
