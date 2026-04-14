import { useConnection } from "wagmi";
import { useInfo } from "@/lib/hyperliquid";

export function useSubAccounts() {
	const { address, isConnected } = useConnection();
	return useInfo("subAccounts", { user: address ?? "0x0" }, { enabled: isConnected && !!address });
}
