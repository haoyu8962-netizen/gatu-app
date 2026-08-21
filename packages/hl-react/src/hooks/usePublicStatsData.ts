import { type UseQueryOptions, type UseQueryResult, useQuery } from "@tanstack/react-query";
import {
	fetchPublicLeaderboard,
	fetchPublicVaults,
	type PublicLeaderboardRow,
	type PublicStatsDataError,
	type PublicVaultRow,
} from "../public-stats-data";
import type { HyperliquidEnv } from "../signing/types";
import { useHyperliquidTransport } from "../transport-provider";

export const publicStatsDataKeys = {
	leaderboard: (env: HyperliquidEnv) => ["hl", "public-stats", "leaderboard", env] as const,
	vaults: (env: HyperliquidEnv) => ["hl", "public-stats", "vaults", env] as const,
};

type PublicStatsDataQueryOptions<TQueryFnData, TData> = Omit<
	UseQueryOptions<TQueryFnData, PublicStatsDataError, TData>,
	"queryKey" | "queryFn" | "placeholderData" | "initialData"
>;

export type UsePublicLeaderboardOptions<TData = readonly PublicLeaderboardRow[]> = PublicStatsDataQueryOptions<
	readonly PublicLeaderboardRow[],
	TData
>;

export type UsePublicVaultsOptions<TData = readonly PublicVaultRow[]> = PublicStatsDataQueryOptions<
	readonly PublicVaultRow[],
	TData
>;

export function usePublicLeaderboard<TData = readonly PublicLeaderboardRow[]>(
	options: UsePublicLeaderboardOptions<TData> = {},
): UseQueryResult<TData, PublicStatsDataError> {
	const { env } = useHyperliquidTransport();
	return useQuery({
		gcTime: 0,
		staleTime: Number.POSITIVE_INFINITY,
		refetchOnReconnect: false,
		refetchOnWindowFocus: false,
		retry: false,
		...options,
		queryKey: publicStatsDataKeys.leaderboard(env),
		queryFn: ({ signal }) => fetchPublicLeaderboard(env, signal),
		// These feeds are large and environment-specific. Never retain the
		// previous environment as placeholder data while a new feed loads.
		placeholderData: undefined,
	});
}

export function usePublicVaults<TData = readonly PublicVaultRow[]>(
	options: UsePublicVaultsOptions<TData> = {},
): UseQueryResult<TData, PublicStatsDataError> {
	const { env } = useHyperliquidTransport();
	return useQuery({
		gcTime: 0,
		staleTime: Number.POSITIVE_INFINITY,
		refetchOnReconnect: false,
		refetchOnWindowFocus: false,
		retry: false,
		...options,
		queryKey: publicStatsDataKeys.vaults(env),
		queryFn: ({ signal }) => fetchPublicVaults(env, signal),
		placeholderData: undefined,
	});
}
