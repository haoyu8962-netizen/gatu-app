import type { Address } from "viem";
import { useConnection } from "wagmi";
import { useSelectedSubAddress } from "@/stores/use-sub-account-store";

interface ActiveAddressResult {
	address: Address | undefined;
	isConnected: boolean;
	isMasterAccount: boolean;
}

export function useActiveAddress(): ActiveAddressResult {
	const { address, isConnected } = useConnection();
	const selectedSubAddress = useSelectedSubAddress();

	return {
		address: selectedSubAddress ?? address,
		isConnected,
		isMasterAccount: selectedSubAddress === null,
	};
}
