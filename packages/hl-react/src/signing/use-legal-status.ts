import { zeroAddress } from "viem";
import { useInfo } from "../hooks/useInfo";
import { parseLegalStatus } from "../legal";
import { useHyperliquid } from "../provider";

export function useLegalStatus() {
	const { clientKey } = useHyperliquid();
	const address = clientKey === "disconnected" ? undefined : (clientKey as `0x${string}`);

	return useInfo(
		"legalCheck",
		{ user: address ?? zeroAddress },
		{
			enabled: !!address,
			select: parseLegalStatus,
			staleTime: 0,
		},
	);
}
