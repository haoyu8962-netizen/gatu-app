import { useActiveAgentOwner } from "@sairn/hl-react";
import { useState } from "react";
import { useDataReceivedSinceMount } from "@/hooks/portfolio/use-data-received-since-mount";
import { useReconnectWallet, useWalletSession } from "@/hooks/wallet/use-wallet-session";
import { useHyperliquid, useInfo } from "@/lib/hyperliquid";
import {
	combinePassiveQueryStates,
	getPassiveQueryState,
	isPassiveQueryShown,
	type PassiveQueryState,
} from "@/lib/passive-query-state";
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
	publicState: PassiveQueryState;
	accountState: StakingAccountDataState;
	ownerAddress: `0x${string}` | undefined;
	hasExactMasterSigner: boolean;
	agentOnlySession: boolean;
	validators: StakingValidator[];
	validatorViews: StakingValidatorView[];
	period: StakingPeriod;
	setPeriod: (period: StakingPeriod) => void;
	networkStakeApproximate: string | null;
	weightedApr: string | null;
	account: StakingAccountSnapshot | null;
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

	function sourceKey(method: string): string {
		return JSON.stringify([env, method, user]);
	}
	const validatorsReceived = useDataReceivedSinceMount(
		JSON.stringify([env, "validatorSummaries"]),
		validatorsQuery.dataUpdatedAt,
	);
	const summaryReceived = useDataReceivedSinceMount(sourceKey("delegatorSummary"), summaryQuery.dataUpdatedAt);
	const delegationsReceived = useDataReceivedSinceMount(sourceKey("delegations"), delegationsQuery.dataUpdatedAt);
	const rewardsReceived = useDataReceivedSinceMount(sourceKey("delegatorRewards"), rewardsQuery.dataUpdatedAt);
	const historyReceived = useDataReceivedSinceMount(sourceKey("delegatorHistory"), historyQuery.dataUpdatedAt);
	const spotReceived = useDataReceivedSinceMount(sourceKey("spotClearinghouseState"), spotQuery.dataUpdatedAt);
	const feesReceived = useDataReceivedSinceMount(sourceKey("userFees"), feesQuery.dataUpdatedAt);

	const validators = parseValidatorSummaries(validatorsQuery.data);
	const publicState = getSourceState(validatorsQuery, validators !== null, validatorsReceived);

	const summary = parseStakingSummary(summaryQuery.data);
	const delegations = parseStakingDelegations(delegationsQuery.data);
	const rewards = parseStakingRewards(rewardsQuery.data);
	const history = parseStakingHistory(historyQuery.data);
	const spotHypeAvailable = parseSpotHypeAvailable(spotQuery.data);
	const stakingLink = parseStakingLink(feesQuery.data);
	const accountQueries = [summaryQuery, delegationsQuery, rewardsQuery, historyQuery, spotQuery, feesQuery];
	const accountState: StakingAccountDataState = ownerAddress
		? combinePassiveQueryStates([
				getSourceState(summaryQuery, summary !== null, summaryReceived),
				getSourceState(delegationsQuery, delegations !== null, delegationsReceived),
				getSourceState(rewardsQuery, rewards !== null, rewardsReceived),
				getSourceState(historyQuery, history !== null, historyReceived),
				getSourceState(spotQuery, spotHypeAvailable !== null, spotReceived),
				getSourceState(feesQuery, stakingLink !== undefined, feesReceived),
			])
		: "disconnected";
	const account: StakingAccountSnapshot | null =
		accountState !== "disconnected" &&
		isPassiveQueryShown(accountState) &&
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
		agentOnlySession: wallet.sessionMode === "agent-only",
		validators: resolvedValidators,
		validatorViews,
		period,
		setPeriod,
		networkStakeApproximate: validators ? sumApproximateNetworkStake(validators) : null,
		weightedApr: validators && account ? calculateDelegationWeightedApr(validators, account.delegations, period) : null,
		account,
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

function getSourceState(
	query: { data: unknown; isError: boolean },
	hasData: boolean,
	receivedSinceMount: boolean,
): PassiveQueryState {
	return getPassiveQueryState({
		hasData,
		failed: query.isError || (query.data !== undefined && !hasData),
		receivedSinceMount,
	});
}
