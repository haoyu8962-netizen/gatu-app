import { useMemo } from "react";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { useActiveAgentOwner, useHyperliquid, useInfo, usePublicVaults } from "@/lib/hyperliquid";
import {
	createVaultAccountFacts,
	createVaultListItem,
	deriveVaultOwnerView,
	isVaultAddress,
	parseVaultDetailsSnapshot,
	parseVaultEquitiesSnapshot,
	type VaultAccountFactsState,
	type VaultDetail,
	type VaultListItem,
	type VaultOwnerViewState,
} from "./domain/vaults";

const EMPTY_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
const ACCOUNT_STALE_TIME_MS = 30_000;
const REQUEST_TIMEOUT_MS = 10_000;

export type VaultsFeedState = "normal" | "loading" | "error" | "empty";

export interface VaultsController {
	state: VaultsFeedState;
	rows: readonly VaultListItem[];
	account: VaultAccountFactsState;
	isRefreshing: boolean;
	updatedAt: number | null;
	onRetry: () => void;
}

export type VaultDetailState = "normal" | "loading" | "error" | "notFound";

export interface VaultDetailController {
	state: VaultDetailState;
	detail: VaultDetail | null;
	owner: VaultOwnerViewState;
	isRefreshing: boolean;
	onRetry: () => void;
}

export function useVaultsController(): VaultsController {
	const accountAddress = useVaultReadOwner();
	const publicVaults = usePublicVaults({
		gcTime: 0,
		staleTime: Number.POSITIVE_INFINITY,
		refetchOnWindowFocus: false,
		retry: false,
	});
	const equities = useInfo(
		"userVaultEquities",
		{ user: accountAddress ?? EMPTY_ADDRESS },
		{
			enabled: Boolean(accountAddress),
			requestTimeoutMs: REQUEST_TIMEOUT_MS,
			retry: false,
			staleTime: ACCOUNT_STALE_TIME_MS,
		},
	);
	const leading = useInfo(
		"leadingVaults",
		{ user: accountAddress ?? EMPTY_ADDRESS },
		{
			enabled: Boolean(accountAddress),
			requestTimeoutMs: REQUEST_TIMEOUT_MS,
			retry: false,
			staleTime: ACCOUNT_STALE_TIME_MS,
		},
	);

	const rows = useMemo(() => publicVaults.data?.map(createVaultListItem) ?? [], [publicVaults.data]);
	const account = deriveAccountFactsState({
		accountAddress,
		equitiesData: equities.data,
		leadingData: leading.data,
		isLoading:
			(equities.data === undefined && (equities.isLoading || equities.isFetching)) ||
			(leading.data === undefined && (leading.isLoading || leading.isFetching)),
		isError: equities.isError || leading.isError,
	});
	const state: VaultsFeedState = publicVaults.isError
		? "error"
		: publicVaults.data
			? publicVaults.data.length
				? "normal"
				: "empty"
			: publicVaults.isLoading || publicVaults.isFetching
				? "loading"
				: "error";

	return {
		state,
		rows,
		account,
		isRefreshing: publicVaults.isFetching && publicVaults.data !== undefined,
		updatedAt: publicVaults.dataUpdatedAt || null,
		onRetry: () => {
			void publicVaults.refetch();
			if (accountAddress) {
				void equities.refetch();
				void leading.refetch();
			}
		},
	};
}

export function useVaultDetailController(vaultAddress: string): VaultDetailController {
	const accountAddress = useVaultReadOwner();
	const validAddress = isVaultAddress(vaultAddress);
	const detailQuery = useInfo(
		"vaultDetails",
		accountAddress
			? { vaultAddress: validAddress ? vaultAddress : EMPTY_ADDRESS, user: accountAddress }
			: { vaultAddress: validAddress ? vaultAddress : EMPTY_ADDRESS },
		{
			enabled: validAddress,
			requestTimeoutMs: REQUEST_TIMEOUT_MS,
			retry: false,
			staleTime: ACCOUNT_STALE_TIME_MS,
		},
	);
	const equitiesQuery = useInfo(
		"userVaultEquities",
		{ user: accountAddress ?? EMPTY_ADDRESS },
		{
			enabled: Boolean(accountAddress),
			requestTimeoutMs: REQUEST_TIMEOUT_MS,
			retry: false,
			staleTime: ACCOUNT_STALE_TIME_MS,
		},
	);

	const parsed = validAddress
		? parseVaultDetailsSnapshot(detailQuery.data as unknown)
		: { status: "notFound" as const };
	const detail = parsed.status === "valid" ? parsed.detail : null;
	let state: VaultDetailState;
	if (!validAddress || parsed.status === "notFound") state = "notFound";
	else if (detailQuery.data === undefined && (detailQuery.isLoading || detailQuery.isFetching)) state = "loading";
	else if (detailQuery.isError || parsed.status === "malformed") state = "error";
	else state = "normal";

	let owner: VaultOwnerViewState = { status: "disconnected" };
	if (detail && accountAddress) {
		if (equitiesQuery.data === undefined && (equitiesQuery.isLoading || equitiesQuery.isFetching)) {
			owner = { status: "loading" };
		} else if (equitiesQuery.isError) {
			owner = { status: "error" };
		} else {
			const parsedEquities = parseVaultEquitiesSnapshot(equitiesQuery.data);
			owner =
				parsedEquities.status === "valid"
					? deriveVaultOwnerView({
							detail,
							account: { status: "ready", equities: parsedEquities.equities },
							now: Date.now(),
						})
					: { status: "error" };
		}
	}

	return {
		state,
		detail,
		owner,
		isRefreshing:
			(detailQuery.isFetching && detailQuery.data !== undefined) ||
			(equitiesQuery.isFetching && equitiesQuery.data !== undefined),
		onRetry: () => {
			void detailQuery.refetch();
			if (accountAddress) void equitiesQuery.refetch();
		},
	};
}

function useVaultReadOwner(): `0x${string}` | undefined {
	const wallet = useWalletSession();
	const { env } = useHyperliquid();
	const activeAgentOwner = useActiveAgentOwner();
	if (wallet.sessionMode === "agent-only") {
		return activeAgentOwner?.env === env ? activeAgentOwner.address : undefined;
	}
	return wallet.address;
}

function deriveAccountFactsState({
	accountAddress,
	equitiesData,
	leadingData,
	isLoading,
	isError,
}: {
	accountAddress: `0x${string}` | undefined;
	equitiesData: unknown;
	leadingData: unknown;
	isLoading: boolean;
	isError: boolean;
}): VaultAccountFactsState {
	if (!accountAddress) return { status: "disconnected" };
	if (isLoading) return { status: "loading" };
	if (isError) return { status: "error" };
	const facts = createVaultAccountFacts(equitiesData, leadingData);
	return facts ? { status: "ready", facts } : { status: "error" };
}
