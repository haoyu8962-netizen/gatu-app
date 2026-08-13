import { type AccountLedgerStatus, useAccountLedger } from "@/hooks/trade/use-account-ledger";
import { useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { useInfo } from "@/lib/hyperliquid";
import {
	buildReferralRewardRows,
	getClaimableReferralRewardRows,
	getDisplayedReferralDiscountPercent,
	getUsdcRewardsEarned,
	hasClaimableReferralRewards,
	normalizeActiveReferralDiscount,
	normalizeReferralResponse,
	normalizeReferralTokenMetadata,
	type ReferralData,
	type ReferralRewardRow,
} from "@/lib/trade/referral";

const EMPTY_ADDRESS = "0x0000000000000000000000000000000000000000";
const REFERRAL_REQUEST_TIMEOUT_MS = 4_000;
const REFERRAL_STALE_TIME_MS = 30_000;
const SUPPORTING_DATA_STALE_TIME_MS = 30 * 60_000;

export type ReferralQueryStatus = "idle" | "loading" | "ready" | "error" | "unavailable";

export interface ReferralClaimHistoryRow {
	amount: string;
	hash: string;
	id: string;
	time: number;
	token: string;
	weiDecimals: number | null;
}

export interface ReferralsResult {
	claimHistory: ReferralClaimHistoryRow[];
	claimHistoryStatus: AccountLedgerStatus;
	claimableRewardRows: ReferralRewardRow[];
	data: ReferralData | null;
	discountPercent: string | null;
	error: unknown;
	hasClaimableRewards: boolean;
	isRefreshing: boolean;
	refetchReferral: () => Promise<ReferralData>;
	refreshAfterAction: (includeLedger: boolean) => Promise<void>;
	retry: () => void;
	retryClaimHistory: () => void;
	rewardRows: ReferralRewardRow[];
	status: ReferralQueryStatus;
	tokenMetadata: ReturnType<typeof normalizeReferralTokenMetadata>;
	usdcRewardsEarned: string | null;
}

interface UseReferralsOptions {
	claimHistoryEnabled?: boolean;
}

export function useReferrals({ claimHistoryEnabled = false }: UseReferralsOptions = {}): ReferralsResult {
	const { address, isConnected } = useWalletSession();
	const user = address ?? EMPTY_ADDRESS;
	const referralQuery = useInfo(
		"referral",
		{ user },
		{
			enabled: isConnected,
			requestTimeoutMs: REFERRAL_REQUEST_TIMEOUT_MS,
			select: normalizeReferralResponse,
			staleTime: REFERRAL_STALE_TIME_MS,
			retry: false,
		},
	);
	const userFeesQuery = useInfo(
		"userFees",
		{ user },
		{
			enabled: isConnected && Boolean(referralQuery.data),
			persist: true,
			select: normalizeActiveReferralDiscount,
			staleTime: SUPPORTING_DATA_STALE_TIME_MS,
			retry: 1,
		},
	);
	const spotMetaQuery = useInfo("spotMeta", undefined, {
		enabled: isConnected && Boolean(referralQuery.data),
		persist: true,
		select: normalizeReferralTokenMetadata,
		staleTime: SUPPORTING_DATA_STALE_TIME_MS,
		retry: 1,
	});
	const accountLedger = useAccountLedger({ enabled: claimHistoryEnabled });

	const malformedReferral = referralQuery.isSuccess && referralQuery.data === null;
	let status: ReferralQueryStatus = "unavailable";
	if (!isConnected) status = "idle";
	else if (referralQuery.data) status = "ready";
	else if (referralQuery.isError || malformedReferral) status = "error";
	else if (referralQuery.fetchStatus === "fetching") status = "loading";

	const data = referralQuery.data ?? null;
	const tokenMetadata = spotMetaQuery.data ?? null;
	const rewardRows = data ? buildReferralRewardRows(data, tokenMetadata) : [];
	const tokenMetadataByName = new Map(
		Array.from(tokenMetadata?.values() ?? []).map((token) => [token.name, token] as const),
	);
	const claimHistory = accountLedger.rewardClaimRows
		.filter((row) => row.amount !== null)
		.map((row) => ({
			amount: row.amount ?? "0",
			hash: row.hash,
			id: row.id,
			time: row.time,
			token: row.token,
			weiDecimals: tokenMetadataByName.get(row.token)?.weiDecimals ?? null,
		}));

	async function refetchReferral(): Promise<ReferralData> {
		const result = await referralQuery.refetch();
		if (result.error || !result.data) throw new Error("Referral data could not be verified");
		return result.data;
	}

	async function refreshAfterAction(includeLedger: boolean): Promise<void> {
		await Promise.all([referralQuery.refetch(), userFeesQuery.refetch()]);
		if (includeLedger) accountLedger.retry();
	}

	return {
		claimHistory,
		claimHistoryStatus: accountLedger.status,
		claimableRewardRows: getClaimableReferralRewardRows(rewardRows),
		data,
		discountPercent: data ? getDisplayedReferralDiscountPercent(data, userFeesQuery.data ?? null) : null,
		error: referralQuery.error ?? (malformedReferral ? new Error("Referral response was invalid") : null),
		hasClaimableRewards: data ? hasClaimableReferralRewards(data) : false,
		isRefreshing: Boolean(data) && referralQuery.fetchStatus === "fetching",
		refetchReferral,
		refreshAfterAction,
		retry: () => void referralQuery.refetch(),
		retryClaimHistory: accountLedger.retry,
		rewardRows,
		status,
		tokenMetadata,
		usdcRewardsEarned: data ? getUsdcRewardsEarned(data) : null,
	};
}
