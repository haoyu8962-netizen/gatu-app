import type { WithdrawalRoute } from "@/lib/trade/withdrawal";

export type UsdcTransferRoute = "bridge" | "cctp";

export interface UsdcRouting {
	depositRoute: UsdcTransferRoute;
	withdrawalRoute: UsdcTransferRoute;
}

export type UsdcRoutingQueryStatus = "loading" | "error" | "unknown" | "ready";

interface UsdcRoutingQueryState {
	data: UsdcRouting | null | undefined;
	isError: boolean;
	isFetching: boolean;
}

function isUsdcTransferRoute(value: unknown): value is UsdcTransferRoute {
	return value === "bridge" || value === "cctp";
}

export function normalizeUsdcRouting(value: unknown): UsdcRouting | null {
	if (!value || typeof value !== "object") return null;
	const routing = value as { depositRoute?: unknown; withdrawalRoute?: unknown };
	if (!isUsdcTransferRoute(routing.depositRoute) || !isUsdcTransferRoute(routing.withdrawalRoute)) return null;
	return {
		depositRoute: routing.depositRoute,
		withdrawalRoute: routing.withdrawalRoute,
	};
}

export function getUsdcRoutingQueryStatus({
	data,
	isError,
	isFetching,
}: UsdcRoutingQueryState): UsdcRoutingQueryStatus {
	if (isFetching) return "loading";
	if (isError) return "error";
	return data ? "ready" : "unknown";
}

export function getWithdrawalRoute(routing: UsdcRouting | null | undefined): WithdrawalRoute | null {
	if (!routing) return null;
	return routing.withdrawalRoute === "cctp" ? "arbitrum-cctp" : "arbitrum-legacy";
}
