import type { InfoClient, UserNonFundingLedgerUpdatesWsEvent } from "@nktkas/hyperliquid";
import { useQuery } from "@tanstack/react-query";
import { MAX_HISTORY_ROWS } from "@/config/trade";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { useHyperliquid, useSubscription } from "@/lib/hyperliquid";
import {
	type AccountLedgerRow,
	type AccountLedgerUpdate,
	buildAccountLedgerRows,
	getAccountLedgerUpdateKey,
	getAccountLedgerUsdcBridge,
	isAccountLedgerEarnUpdate,
	isAccountLedgerRewardsClaimUpdate,
	isValidAccountLedgerUpdate,
	mergeAccountLedgerUpdates,
} from "@/lib/trade/account-ledger";
import {
	fetchHistoryPageWithRetry,
	fetchTimeRangeHistory,
	isIncompleteHistorySnapshotError,
	MalformedHistoryPageError,
	requireCompleteHistorySnapshot,
} from "@/lib/trade/history-pagination";

const EMPTY_ADDRESS = "0x0000000000000000000000000000000000000000";
const ACCOUNT_LEDGER_STALE_TIME_MS = 30_000;
const ACCOUNT_LEDGER_LIST_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;

export type AccountLedgerStatus = "error" | "idle" | "loading" | "ready" | "unavailable";

export function accountLedgerQueryKey(env: "Mainnet" | "Testnet", user: string) {
	return ["hl", "recent-history", "userNonFundingLedgerUpdates", env, user.toLowerCase()] as const;
}

interface AccountLedgerResult {
	earnRows: AccountLedgerRow[];
	error: unknown;
	isConnected: boolean;
	rewardClaimRows: AccountLedgerRow[];
	retry: () => void;
	rows: AccountLedgerRow[];
	status: AccountLedgerStatus;
}

interface AccountLedgerOptions {
	enabled?: boolean;
}

export async function fetchRecentAccountLedgerUpdates(
	info: InfoClient,
	user: `0x${string}`,
	signal: AbortSignal,
): Promise<AccountLedgerUpdate[]> {
	const endTime = Date.now();
	const startTime = endTime - ACCOUNT_LEDGER_LIST_LOOKBACK_MS;
	const result = await fetchTimeRangeHistory<AccountLedgerUpdate>({
		endTime,
		fetchPage: (pageStartTime, pageEndTime, pageSignal) =>
			fetchHistoryPageWithRetry(
				(requestSignal) =>
					info.userNonFundingLedgerUpdates({ endTime: pageEndTime, startTime: pageStartTime, user }, requestSignal),
				{ signal: pageSignal },
			),
		getKey: getAccountLedgerUpdateKey,
		getTime: (update) => update.time,
		retainLatestItems: MAX_HISTORY_ROWS,
		retainItemsMatching: (update) => isAccountLedgerRewardsClaimUpdate(update) || isAccountLedgerEarnUpdate(update),
		signal,
		startTime,
		validateItem: isValidAccountLedgerUpdate,
	});
	return requireCompleteHistorySnapshot(result);
}

export function useAccountLedger({ enabled: requestedEnabled = true }: AccountLedgerOptions = {}): AccountLedgerResult {
	const { address, isConnected } = useWalletSession();
	const { env, info } = useHyperliquid();
	const enabled = requestedEnabled && isConnected && !!address;
	const user = address ?? EMPTY_ADDRESS;
	const ledgerQuery = useQuery({
		enabled,
		queryFn: ({ signal }) => fetchRecentAccountLedgerUpdates(info, user, signal),
		queryKey: accountLedgerQueryKey(env, user),
		refetchOnReconnect: true,
		refetchOnWindowFocus: false,
		retry: false,
		staleTime: ACCOUNT_LEDGER_STALE_TIME_MS,
	});
	const ledgerSubscription = useSubscription("userNonFundingLedgerUpdates", { user }, { enabled });

	const restUpdates = ledgerQuery.data;
	const realtimeEvent = ledgerSubscription.data as UserNonFundingLedgerUpdatesWsEvent | undefined;
	const realtimeUpdates = realtimeEvent?.nonFundingLedgerUpdates;
	const hasMalformedRealtime =
		realtimeUpdates !== undefined &&
		(!Array.isArray(realtimeUpdates) || realtimeUpdates.some((update) => !isValidAccountLedgerUpdate(update)));
	const hasRestSnapshot = restUpdates !== undefined;
	const hasIncompleteRestSnapshot = isIncompleteHistorySnapshotError(ledgerQuery.error);
	const updates = mergeAccountLedgerUpdates(
		restUpdates,
		hasMalformedRealtime || !Array.isArray(realtimeUpdates) ? undefined : realtimeUpdates,
	);
	const allRows = buildAccountLedgerRows(updates, user, getAccountLedgerUsdcBridge(env === "Testnet"));
	const rows = allRows.slice(0, MAX_HISTORY_ROWS);
	const rewardClaimRows = allRows.filter((row) => row.action === "rewardsClaim").slice(0, MAX_HISTORY_ROWS);
	const earnRows = allRows
		.filter((row) => row.source.kind === "earn" || row.destination.kind === "earn")
		.slice(0, MAX_HISTORY_ROWS);

	let status: AccountLedgerStatus = "unavailable";
	if (!enabled) {
		status = "idle";
	} else if (hasIncompleteRestSnapshot || hasMalformedRealtime) {
		status = "error";
	} else if (hasRestSnapshot) {
		status = "ready";
	} else if (ledgerQuery.isError) {
		status = "error";
	} else if (ledgerQuery.fetchStatus === "fetching") {
		status = "loading";
	}

	return {
		earnRows,
		error:
			status === "error"
				? (ledgerQuery.error ?? (hasMalformedRealtime ? new MalformedHistoryPageError() : undefined))
				: undefined,
		isConnected,
		rewardClaimRows,
		retry: () => {
			if (enabled) void ledgerQuery.refetch();
		},
		rows,
		status,
	};
}
