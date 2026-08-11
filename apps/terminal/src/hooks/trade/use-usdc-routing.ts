import { infoQueryOptions, useHyperliquid, useInfo } from "@gatu/hl-react";
import { t } from "@lingui/core/macro";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { getWithdrawalRoute, normalizeUsdcRouting, type UsdcRouting } from "@/domain/trade/usdc-routing";
import type { WithdrawalRoute } from "@/lib/trade/withdrawal";

export const USDC_ROUTING_REFRESH_INTERVAL_MS = 30_000;

export class UsdcDepositRouteError extends Error {
	readonly reason: "cctp" | "unavailable";

	constructor(reason: "cctp" | "unavailable") {
		super(
			reason === "cctp"
				? t`Hyperliquid currently requires CCTP deposits. Bridge deposits are unavailable.`
				: t`Unable to verify the current Hyperliquid deposit route. Deposit was not submitted.`,
		);
		this.name = "UsdcDepositRouteError";
		this.reason = reason;
	}
}

export function getUsdcRoutingQueryOptions(enabled: boolean) {
	return {
		enabled,
		refetchInterval: enabled ? USDC_ROUTING_REFRESH_INTERVAL_MS : (false as const),
		refetchIntervalInBackground: false,
		refetchOnWindowFocus: true,
		retry: 1 as const,
		select: normalizeUsdcRouting,
		staleTime: USDC_ROUTING_REFRESH_INTERVAL_MS,
	};
}

export function useUsdcRouting(enabled: boolean) {
	return useInfo("usdcRouting", undefined, getUsdcRoutingQueryOptions(enabled));
}

export async function fetchFreshUsdcRouting(
	queryClient: QueryClient,
	info: ReturnType<typeof useHyperliquid>["info"],
	env: ReturnType<typeof useHyperliquid>["env"],
	signal?: AbortSignal,
): Promise<UsdcRouting | null> {
	const options = infoQueryOptions(info, "usdcRouting", undefined, env);
	signal?.throwIfAborted();
	await queryClient.cancelQueries({ exact: true, queryKey: options.queryKey });
	signal?.throwIfAborted();
	const routing = await info.usdcRouting(signal);
	signal?.throwIfAborted();
	await queryClient.cancelQueries({ exact: true, queryKey: options.queryKey });
	signal?.throwIfAborted();
	queryClient.setQueryData(options.queryKey, routing);
	return normalizeUsdcRouting(routing);
}

export function useFreshUsdcRouting() {
	const queryClient = useQueryClient();
	const { env, info } = useHyperliquid();

	return useCallback(
		(signal?: AbortSignal) => fetchFreshUsdcRouting(queryClient, info, env, signal),
		[env, info, queryClient],
	);
}

export async function assertFreshBridgeDepositRoute(
	fetchFreshRouting: (signal?: AbortSignal) => Promise<UsdcRouting | null>,
	signal?: AbortSignal,
) {
	let routing: UsdcRouting | null;
	try {
		routing = await fetchFreshRouting(signal);
	} catch {
		throw new UsdcDepositRouteError("unavailable");
	}
	if (!routing) throw new UsdcDepositRouteError("unavailable");
	if (routing.depositRoute !== "bridge") throw new UsdcDepositRouteError("cctp");
}

export async function executeWithFreshWithdrawalRoute(
	expectedRoute: WithdrawalRoute,
	fetchFreshRouting: (signal?: AbortSignal) => Promise<UsdcRouting | null>,
	execute: () => Promise<void>,
): Promise<"executed" | "changed" | "unavailable"> {
	let freshRoute: WithdrawalRoute | null;
	try {
		freshRoute = getWithdrawalRoute(await fetchFreshRouting());
	} catch {
		return "unavailable";
	}
	if (!freshRoute) return "unavailable";
	if (freshRoute !== expectedRoute) return "changed";
	await execute();
	return "executed";
}

export function useAssertFreshBridgeDepositRoute() {
	const fetchFreshRouting = useFreshUsdcRouting();
	return useCallback(() => assertFreshBridgeDepositRoute(fetchFreshRouting), [fetchFreshRouting]);
}
