import { useActiveAgentOwner } from "@gatu/hl-react";
import { useState } from "react";
import { useReconnectWallet, useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { useHyperliquid, useInfo } from "@/lib/hyperliquid";
import { hasSameWalletAddress } from "@/lib/wallet/privy-wagmi";
import {
	calculateDelegationWeightedApr,
	createValidatorViews,
	deriveStakingPageState,
	parseSpotHypeAvailable,
	parseStakingDelegations,
	parseStakingHistory,
	parseStakingLink,
	parseStakingRewards,
	parseStakingSummary,
	parseValidatorSummaries,
	type StakingAccountDataState,
	type StakingDelegation,
	type StakingHistoryEntry,
	type StakingLink,
	type StakingPageState,
	type StakingPeriod,
	type StakingReward,
	type StakingSummary,
	type StakingValidator,
	type StakingValidatorView,
	sumApproximateNetworkStake,
} from "./domain/staking";

const EMPTY_USER = "";

interface StakingAccountSnapshot {
	summary: StakingSummary;
	delegations: StakingDelegation[];
	rewards: StakingReward[];
	history: StakingHistoryEntry[];
	spotHypeAvailable: string;
	stakingLink: StakingLink;
}

interface ActiveAgentOwner {
	env: "Mainnet" | "Testnet";
	address: `0x${string}`;
}

export interface ResolveStakingOwnerInput {
	env: "Mainnet" | "Testnet";
	sessionMode: "wallet" | "agent-only" | "disconnected";
	walletAddress: `0x${string}` | undefined;
	activeAgentOwner: ActiveAgentOwner | null;
}

export interface StakingController {
	env: "Mainnet" | "Testnet";
	pageState: StakingPageState;
	publicState: "ready" | "loading" | "error";
	accountState: StakingAccountDataState;
	ownerAddress: `0x${string}` | undefined;
	hasExactMasterSigner: boolean;
	validators: StakingValidator[];
	validatorViews: StakingValidatorView[];
	period: StakingPeriod;
	setPeriod: (period: StakingPeriod) => void;
	networkStakeApproximate: string | null;
	weightedApr: string | null;
	account: StakingAccountSnapshot | null;
	isRefreshing: boolean;
	isReconnecting: boolean;
	retryPublic: () => void;
	retryAccount: () => void;
	connectMasterWallet: () => void;
}

export function resolveStakingOwner({
	env,
	sessionMode,
	walletAddress,
	activeAgentOwner,
}: ResolveStakingOwnerInput): `0x${string}` | undefined {
	if (sessionMode === "wallet") return walletAddress;
	if (sessionMode !== "agent-only" || activeAgentOwner?.env !== env) return undefined;
	return activeAgentOwner.address;
}

export function useStakingController(): StakingController {
	const wallet = useWalletSession();
	const { reconnectWallet, isReconnecting } = useReconnectWallet();
	const { env } = useHyperliquid();
	const activeAgentOwner = useActiveAgentOwner();
	const [period, setPeriod] = useState<StakingPeriod>("week");
	const ownerAddress = resolveStakingOwner({
		env,
		sessionMode: wallet.sessionMode,
		walletAddress: wallet.walletAddress,
		activeAgentOwner,
	});
	const hasExactMasterSigner = Boolean(
		ownerAddress &&
			wallet.sessionMode === "wallet" &&
			wallet.hasWalletAccess &&
			hasSameWalletAddress(ownerAddress, wallet.walletAddress),
	);
	const user = ownerAddress ?? EMPTY_USER;
	const accountQueryOptions = {
		enabled: Boolean(ownerAddress),
		requestTimeoutMs: 10_000,
		staleTime: 15_000,
		refetchInterval: 30_000,
		retry: 1,
	} as const;

	const validatorsQuery = useInfo("validatorSummaries", undefined, {
		requestTimeoutMs: 10_000,
		staleTime: 60_000,
		refetchInterval: 60_000,
		retry: 1,
	});
	const summaryQuery = useInfo("delegatorSummary", { user }, accountQueryOptions);
	const delegationsQuery = useInfo("delegations", { user }, accountQueryOptions);
	const rewardsQuery = useInfo("delegatorRewards", { user }, accountQueryOptions);
	const historyQuery = useInfo("delegatorHistory", { user }, accountQueryOptions);
	const spotQuery = useInfo("spotClearinghouseState", { user }, accountQueryOptions);
	const feesQuery = useInfo("userFees", { user }, accountQueryOptions);

	const validators = parseValidatorSummaries(validatorsQuery.data);
	const publicMalformed = validatorsQuery.data !== undefined && validators === null;
	const publicState: StakingController["publicState"] =
		validatorsQuery.isError || publicMalformed ? "error" : validators === null ? "loading" : "ready";

	const summary = parseStakingSummary(summaryQuery.data);
	const delegations = parseStakingDelegations(delegationsQuery.data);
	const rewards = parseStakingRewards(rewardsQuery.data);
	const history = parseStakingHistory(historyQuery.data);
	const spotHypeAvailable = parseSpotHypeAvailable(spotQuery.data);
	const stakingLink = parseStakingLink(feesQuery.data);
	const accountQueries = [summaryQuery, delegationsQuery, rewardsQuery, historyQuery, spotQuery, feesQuery];
	const accountMalformed =
		(summaryQuery.data !== undefined && summary === null) ||
		(delegationsQuery.data !== undefined && delegations === null) ||
		(rewardsQuery.data !== undefined && rewards === null) ||
		(historyQuery.data !== undefined && history === null) ||
		(spotQuery.data !== undefined && spotHypeAvailable === null) ||
		(feesQuery.data !== undefined && stakingLink === undefined);
	const accountState: StakingAccountDataState = !ownerAddress
		? "disconnected"
		: accountMalformed || accountQueries.some((query) => query.isError)
			? "error"
			: summary && delegations && rewards && history && spotHypeAvailable !== null && stakingLink !== undefined
				? "ready"
				: "loading";
	const account: StakingAccountSnapshot | null =
		accountState === "ready" &&
		summary &&
		delegations &&
		rewards &&
		history &&
		spotHypeAvailable !== null &&
		stakingLink !== undefined
			? { summary, delegations, rewards, history, spotHypeAvailable, stakingLink }
			: null;
	const resolvedValidators = validators ?? [];
	const validatorViews = createValidatorViews(resolvedValidators, account?.delegations, period);
	const pageState = deriveStakingPageState({ publicState, accountState, hasExactMasterSigner });

	return {
		env,
		pageState,
		publicState,
		accountState,
		ownerAddress,
		hasExactMasterSigner,
		validators: resolvedValidators,
		validatorViews,
		period,
		setPeriod,
		networkStakeApproximate: validators ? sumApproximateNetworkStake(validators) : null,
		weightedApr: validators && account ? calculateDelegationWeightedApr(validators, account.delegations, period) : null,
		account,
		isRefreshing: validatorsQuery.isFetching || accountQueries.some((query) => query.isFetching),
		isReconnecting,
		retryPublic: () => {
			void validatorsQuery.refetch();
		},
		retryAccount: () => {
			for (const query of accountQueries) void query.refetch();
		},
		connectMasterWallet: () => {
			void reconnectWallet();
		},
	};
}
