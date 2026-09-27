import type { InfoClient } from "@nktkas/hyperliquid";
import { type QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	buildEarnSnapshot,
	type EarnInterestEntry,
	type EarnReserve,
	type EarnSnapshot,
	type EarnSpotBalance,
	type EarnTokenMeta,
	type EarnUserState,
	getEarnSpotAvailable,
	parseEarnInterest,
	parseEarnReserves,
	parseEarnUserState,
} from "@/domain/earn";
import {
	type AccountAbstraction,
	isSupportedAccountAbstraction,
	isTokenSpotBalance,
	useDefaultDexBalances,
} from "@/hooks/trade/use-account-balances";
import { useAccountLedger } from "@/hooks/trade/use-account-ledger";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { type HyperliquidEnv, infoQueryOptions, useHyperliquid, useInfo, useSpotTokens } from "@/lib/hyperliquid";
import type { AccountLedgerRow } from "@/lib/trade/account-ledger";
import {
	fetchHistoryPageWithRetry,
	fetchTimeRangeHistory,
	requireCompleteHistorySnapshot,
} from "@/lib/trade/history-pagination";

const EARN_REQUEST_TIMEOUT_MS = 10_000;
const EARN_PUBLIC_REFRESH_MS = 30_000;
const EARN_ACCOUNT_REFRESH_MS = 15_000;
const EARN_INTEREST_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;
const EARN_INTEREST_WINDOW_ALIGN_MS = 60 * 60 * 1000;
const EMPTY_USER = "";

export type EarnDataStatus = "idle" | "loading" | "ready" | "error";

export interface EarnSnapshotInputs {
	tokens: ReadonlyMap<number, EarnTokenMeta>;
	portfolioMargin: boolean;
	spotBalances: ReadonlyMap<number, EarnSpotBalance>;
	availableAfterMaintenance: ReadonlyMap<number, string>;
}

export interface EarnData {
	ownerAddress: `0x${string}` | undefined;
	isConnected: boolean;
	publicStatus: EarnDataStatus;
	accountStatus: EarnDataStatus;
	interestStatus: EarnDataStatus;
	historyStatus: EarnDataStatus;
	snapshot: EarnSnapshot | null;
	snapshotInputs: EarnSnapshotInputs;
	accountAbstraction: AccountAbstraction;
	portfolioMargin: boolean;
	spotStateReceivedAt: number | undefined;
	interest: EarnInterestEntry[];
	history: AccountLedgerRow[];
	retryPublic: () => void;
	retryAccount: () => void;
	retryInterest: () => void;
	retryHistory: () => void;
	fetchFreshState: (signal: AbortSignal) => Promise<EarnFreshState | null>;
}

export interface EarnFreshState {
	reserves: EarnReserve[];
	userState: EarnUserState;
}

export function getEarnInterestStartTime(now: number): number {
	return Math.floor((now - EARN_INTEREST_LOOKBACK_MS) / EARN_INTEREST_WINDOW_ALIGN_MS) * EARN_INTEREST_WINDOW_ALIGN_MS;
}

interface RawEarnInterest {
	time: number;
	token: string;
}

function isRawEarnInterest(item: unknown): item is RawEarnInterest {
	return (
		typeof item === "object" &&
		item !== null &&
		typeof (item as { time?: unknown }).time === "number" &&
		typeof (item as { token?: unknown }).token === "string"
	);
}

export async function fetchEarnInterest(
	info: InfoClient,
	user: `0x${string}`,
	now: number,
	signal: AbortSignal,
): Promise<unknown[]> {
	const result = await fetchTimeRangeHistory<unknown>({
		startTime: getEarnInterestStartTime(now),
		endTime: now,
		fetchPage: (pageStartTime, pageEndTime, pageSignal) =>
			fetchHistoryPageWithRetry(
				(requestSignal) =>
					info.userBorrowLendInterest({ user, startTime: pageStartTime, endTime: pageEndTime }, requestSignal),
				{ signal: pageSignal },
			),
		getKey: (item) => (isRawEarnInterest(item) ? `${item.time}:${item.token}` : ""),
		getTime: (item) => (isRawEarnInterest(item) ? item.time : Number.NaN),
		validateItem: isRawEarnInterest,
		signal,
	});
	return requireCompleteHistorySnapshot(result);
}

export async function fetchFreshEarnState(
	queryClient: QueryClient,
	info: InfoClient,
	env: HyperliquidEnv,
	user: `0x${string}`,
	signal: AbortSignal,
): Promise<EarnFreshState | null> {
	const requestOptions = { requestTimeoutMs: EARN_REQUEST_TIMEOUT_MS };
	const reservesOptions = infoQueryOptions(info, "allBorrowLendReserveStates", undefined, env, requestOptions);
	const userOptions = infoQueryOptions(info, "borrowLendUserState", { user }, env, requestOptions);
	const cancelPageRequests = () =>
		Promise.all([
			queryClient.cancelQueries({ exact: true, queryKey: reservesOptions.queryKey }),
			queryClient.cancelQueries({ exact: true, queryKey: userOptions.queryKey }),
		]);
	try {
		signal.throwIfAborted();
		await cancelPageRequests();
		signal.throwIfAborted();
		const [rawReserves, rawUserState] = await Promise.all([
			reservesOptions.queryFn({ signal }),
			userOptions.queryFn({ signal }),
		]);
		signal.throwIfAborted();
		await cancelPageRequests();
		signal.throwIfAborted();
		queryClient.setQueryData(reservesOptions.queryKey, rawReserves);
		queryClient.setQueryData(userOptions.queryKey, rawUserState);
		const reserves = parseEarnReserves(rawReserves);
		const userState = parseEarnUserState(rawUserState);
		return reserves && userState ? { reserves, userState } : null;
	} catch (error) {
		if (signal.aborted) throw signal.reason ?? error;
		return null;
	}
}

export function useEarnData(): EarnData {
	const { address, isConnected } = useWalletSession();
	const ownerAddress = isConnected ? address : undefined;
	const user = ownerAddress ?? EMPTY_USER;
	const { env, info } = useHyperliquid();
	const queryClient = useQueryClient();
	const balances = useDefaultDexBalances();
	const { tokens: spotTokens } = useSpotTokens();
	const accountQueryOptions = {
		enabled: Boolean(ownerAddress),
		requestTimeoutMs: EARN_REQUEST_TIMEOUT_MS,
		staleTime: 0,
		refetchInterval: EARN_ACCOUNT_REFRESH_MS,
		refetchOnWindowFocus: true,
		retry: 1,
	} as const;
	const reservesQuery = useInfo("allBorrowLendReserveStates", undefined, {
		requestTimeoutMs: EARN_REQUEST_TIMEOUT_MS,
		staleTime: EARN_ACCOUNT_REFRESH_MS,
		refetchInterval: EARN_PUBLIC_REFRESH_MS,
		retry: 1,
	});
	const userStateQuery = useInfo("borrowLendUserState", { user }, accountQueryOptions);
	const interestQuery = useQuery({
		enabled: Boolean(ownerAddress),
		queryKey: ["hl", "earn-interest", env, user.toLowerCase()],
		queryFn: ({ signal }) => fetchEarnInterest(info, user as `0x${string}`, Date.now(), signal),
		refetchInterval: EARN_PUBLIC_REFRESH_MS,
		refetchOnWindowFocus: true,
		retry: 1,
		staleTime: 0,
	});
	const ledger = useAccountLedger({ enabled: Boolean(ownerAddress) });

	const reserves = parseEarnReserves(reservesQuery.data);
	const userState = parseEarnUserState(userStateQuery.data);
	const interest = parseEarnInterest(interestQuery.data);
	const tokens = new Map<number, EarnTokenMeta>(
		spotTokens.map((token) => [
			token.index,
			{
				index: token.index,
				name: token.name,
				displayName: token.displayName,
				weiDecimals: token.weiDecimals,
				szDecimals: token.szDecimals,
			},
		]),
	);
	const portfolioMargin = balances.accountAbstraction === "portfolioMargin";
	const spotBalances = new Map<number, EarnSpotBalance>();
	for (const balance of balances.spotBalances) {
		if (!isTokenSpotBalance(balance)) continue;
		spotBalances.set(balance.token, {
			token: balance.token,
			total: balance.total,
			available: getEarnSpotAvailable(balance, balances.spotAvailableAfterMaintenance),
		});
	}
	const availableAfterMaintenance = new Map<number, string>(
		balances.spotAvailableAfterMaintenance.map(([token, value]) => [Number(token), String(value)]),
	);
	const snapshotInputs: EarnSnapshotInputs = { tokens, portfolioMargin, spotBalances, availableAfterMaintenance };

	const publicMalformed = reservesQuery.data !== undefined && reserves === null;
	let publicStatus: EarnDataStatus = "loading";
	if (reservesQuery.isError || publicMalformed) publicStatus = "error";
	else if (reserves && tokens.size > 0) publicStatus = "ready";

	const spotReady =
		balances.spotStateStatus === "success" &&
		!balances.isSpotStateStale &&
		isSupportedAccountAbstraction(balances.accountAbstraction);
	const accountMalformed = userStateQuery.data !== undefined && userState === null;
	let accountStatus: EarnDataStatus = "idle";
	if (ownerAddress) {
		if (userStateQuery.isError || accountMalformed) accountStatus = "error";
		else if (userState && spotReady) accountStatus = "ready";
		else accountStatus = "loading";
	}

	let interestStatus: EarnDataStatus = "idle";
	if (ownerAddress) {
		if (interestQuery.isError || (interestQuery.data !== undefined && interest === null)) interestStatus = "error";
		else interestStatus = interest ? "ready" : "loading";
	}

	let historyStatus: EarnDataStatus = "idle";
	if (ownerAddress) {
		if (ledger.status === "error") historyStatus = "error";
		else historyStatus = ledger.status === "ready" ? "ready" : "loading";
	}

	const snapshot =
		reserves && tokens.size > 0
			? buildEarnSnapshot({
					reserves,
					userState: accountStatus === "ready" ? userState : null,
					...snapshotInputs,
				})
			: null;

	function fetchFreshState(signal: AbortSignal) {
		if (!ownerAddress) return Promise.resolve(null);
		return fetchFreshEarnState(queryClient, info, env, ownerAddress, signal);
	}

	return {
		ownerAddress,
		isConnected,
		publicStatus,
		accountStatus,
		interestStatus,
		historyStatus,
		snapshot,
		snapshotInputs,
		accountAbstraction: balances.accountAbstraction,
		portfolioMargin,
		spotStateReceivedAt: balances.spotStateReceivedAt,
		interest: interest ?? [],
		history: ledger.earnRows,
		retryPublic: () => {
			void reservesQuery.refetch();
		},
		retryAccount: () => {
			void userStateQuery.refetch();
		},
		retryInterest: () => {
			void interestQuery.refetch();
		},
		retryHistory: ledger.retry,
		fetchFreshState,
	};
}
