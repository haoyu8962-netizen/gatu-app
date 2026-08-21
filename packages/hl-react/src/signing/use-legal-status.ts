import { zeroAddress } from "viem";
import { useInfo } from "../hooks/useInfo";
import {
	getLegalStatusRetryDelayMs,
	LEGAL_STATUS_HTTP_TIMEOUT_MS,
	LEGAL_STATUS_STALE_TIME_MS,
	parseLegalStatus,
	shouldRetryLegalStatus,
} from "../legal";
import { useHyperliquid } from "../provider";

export function useLegalStatus() {
	const { clientKey } = useHyperliquid();
	const address = clientKey === "disconnected" ? undefined : (clientKey.toLowerCase() as `0x${string}`);

	return useInfo(
		"legalCheck",
		{ user: address ?? zeroAddress },
		{
			enabled: !!address,
			networkMode: "online",
			requestTimeoutMs: LEGAL_STATUS_HTTP_TIMEOUT_MS,
			refetchOnReconnect: "always",
			refetchOnWindowFocus: true,
			retry: shouldRetryLegalStatus,
			retryDelay: getLegalStatusRetryDelayMs,
			select: parseLegalStatus,
			staleTime: LEGAL_STATUS_STALE_TIME_MS,
		},
	);
}
