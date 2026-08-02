import type { UserNonFundingLedgerUpdatesResponse, UserNonFundingLedgerUpdatesWsEvent } from "@nktkas/hyperliquid";
import { MAX_HISTORY_ROWS } from "@/config/trade";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { useInfo, useSubscription } from "@/lib/hyperliquid";
import { type AccountLedgerRow, buildAccountLedgerRows, mergeAccountLedgerUpdates } from "@/lib/trade/account-ledger";

const EMPTY_ADDRESS = "0x0000000000000000000000000000000000000000";
const ACCOUNT_LEDGER_STALE_TIME_MS = 30_000;

export type AccountLedgerStatus = "error" | "idle" | "loading" | "ready";

interface AccountLedgerResult {
	error: unknown;
	isConnected: boolean;
	retry: () => void;
	rows: AccountLedgerRow[];
	status: AccountLedgerStatus;
}

export function useAccountLedger(): AccountLedgerResult {
	const { address, isConnected } = useWalletSession();
	const enabled = isConnected && !!address;
	const user = address ?? EMPTY_ADDRESS;
	const params = { user, startTime: 0 } as const;
	const ledgerQuery = useInfo("userNonFundingLedgerUpdates", params, {
		enabled,
		refetchOnReconnect: true,
		refetchOnWindowFocus: false,
		retry: 1,
		staleTime: ACCOUNT_LEDGER_STALE_TIME_MS,
	});
	const ledgerSubscription = useSubscription("userNonFundingLedgerUpdates", { user }, { enabled });

	const restUpdates = ledgerQuery.data as UserNonFundingLedgerUpdatesResponse | undefined;
	const realtimeEvent = ledgerSubscription.data as UserNonFundingLedgerUpdatesWsEvent | undefined;
	const realtimeUpdates = realtimeEvent?.nonFundingLedgerUpdates;
	const hasRestSnapshot = restUpdates !== undefined;
	const hasRealtimeUpdates = (realtimeUpdates?.length ?? 0) > 0;
	const realtimeSettled = ledgerSubscription.status === "active" || ledgerSubscription.status === "error";
	const updates = mergeAccountLedgerUpdates(restUpdates, realtimeUpdates);
	const rows = buildAccountLedgerRows(updates, user).slice(0, MAX_HISTORY_ROWS);

	let status: AccountLedgerStatus = "loading";
	if (!enabled) {
		status = "idle";
	} else if (hasRestSnapshot || hasRealtimeUpdates) {
		status = "ready";
	} else if (ledgerQuery.isError && realtimeSettled) {
		status = "error";
	}

	return {
		error: status === "error" ? (ledgerQuery.error ?? ledgerSubscription.error) : undefined,
		isConnected,
		retry: () => void ledgerQuery.refetch(),
		rows,
		status,
	};
}
