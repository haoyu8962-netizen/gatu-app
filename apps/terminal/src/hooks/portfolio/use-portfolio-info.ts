import { useHyperliquidTransport } from "@sairn/hl-react";
import { useQuery } from "@tanstack/react-query";
import { PORTFOLIO_REFRESH_INTERVAL_MS } from "@/domain/portfolio";
import { type InfoMethod, type InfoParams, infoQueryOptions } from "@/lib/hyperliquid";

export function usePortfolioInfo<M extends InfoMethod>(
	method: M,
	params: InfoParams<M>,
	accountMode: string | null,
	enabled: boolean,
) {
	const { env, info } = useHyperliquidTransport();
	const request = infoQueryOptions(info, method, params, env, { requestTimeoutMs: 15_000 });
	return useQuery({
		...request,
		queryKey: [...request.queryKey, "portfolio", accountMode],
		enabled,
		staleTime: 30_000,
		refetchInterval: PORTFOLIO_REFRESH_INTERVAL_MS,
		refetchOnMount: "always",
		placeholderData: undefined,
		retry: 1,
	});
}
