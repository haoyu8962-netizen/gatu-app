import { useLingui } from "@lingui/react/macro";
import {
	calculateDelegationWeightedApr,
	createValidatorViews,
	type StakingValidator,
	sumApproximateNetworkStake,
} from "./domain/staking";
import { StakingView } from "./staking-view";
import type { StakingController } from "./use-staking-controller";

const FIXTURE_STATES = ["normal", "loading", "error", "empty"] as const;
export type StakingFixtureState = (typeof FIXTURE_STATES)[number];

const OWNER = "0x0000000000000000000000000000000000001001" as const;
const ACTIVE_VALIDATOR = "0x0000000000000000000000000000000000002001" as const;
const JAILED_VALIDATOR = "0x0000000000000000000000000000000000002002" as const;
const INACTIVE_VALIDATOR = "0x0000000000000000000000000000000000002003" as const;
const SIGNER = "0x0000000000000000000000000000000000003001" as const;
const FIXTURE_HASH = `0x${"ab".repeat(32)}` as `0x${string}`;

export function getStakingFixtureFromLocation(): StakingFixtureState | null {
	return resolveStakingFixture(typeof window === "undefined" ? "" : window.location.search, import.meta.env.DEV);
}

export function resolveStakingFixture(search: string, isDevelopment: boolean): StakingFixtureState | null {
	if (!isDevelopment) return null;
	const fixture = new URLSearchParams(search).get("fixture");
	return FIXTURE_STATES.find((state) => state === fixture) ?? null;
}

export function StakingFixture({ fixture }: { fixture: StakingFixtureState }) {
	const { t } = useLingui();
	const validators =
		fixture === "normal"
			? createValidators({
					activeName: t`Sample Active Validator`,
					jailedName: t`Sample Jailed Validator`,
					inactiveName: t`Sample Inactive Validator`,
					description: t`Placeholder validator data for visual review.`,
				})
			: [];
	const account = fixture === "normal" ? createAccount() : fixture === "empty" ? createEmptyAccount() : null;
	const period = "week" as const;
	const controller: StakingController = {
		env: "Mainnet",
		pageState: fixture,
		publicState: fixture === "loading" ? "loading" : fixture === "error" ? "error" : "ready",
		accountState: fixture === "loading" ? "loading" : fixture === "error" ? "error" : "ready",
		ownerAddress: OWNER,
		hasExactMasterSigner: true,
		validators,
		validatorViews: createValidatorViews(validators, account?.delegations, period),
		period,
		setPeriod: () => undefined,
		networkStakeApproximate: validators.length ? sumApproximateNetworkStake(validators) : null,
		weightedApr: account ? calculateDelegationWeightedApr(validators, account.delegations, period) : null,
		account,
		isRefreshing: false,
		isReconnecting: false,
		retryPublic: () => undefined,
		retryAccount: () => undefined,
		connectMasterWallet: () => undefined,
	};

	return <StakingView {...controller} actionsEnabled={false} />;
}

function createValidators(copy: {
	activeName: string;
	jailedName: string;
	inactiveName: string;
	description: string;
}): StakingValidator[] {
	return [
		createValidator({
			address: ACTIVE_VALIDATOR,
			name: copy.activeName,
			description: copy.description,
			status: "active",
			stakeApproximateHype: "18500000",
			commission: "0.03",
			apr: { day: "0.021", week: "0.024", month: "0.027" },
		}),
		createValidator({
			address: JAILED_VALIDATOR,
			name: copy.jailedName,
			description: copy.description,
			status: "jailed",
			stakeApproximateHype: "9200000",
			commission: "0.05",
			apr: { day: "0", week: "0.011", month: "0.018" },
		}),
		createValidator({
			address: INACTIVE_VALIDATOR,
			name: copy.inactiveName,
			description: copy.description,
			status: "inactive",
			stakeApproximateHype: "4750000",
			commission: "0.04",
			apr: { day: "0.012", week: "0.014", month: "0.016" },
		}),
	];
}

function createValidator({
	address,
	name,
	description,
	status,
	stakeApproximateHype,
	commission,
	apr,
}: {
	address: `0x${string}`;
	name: string;
	description: string;
	status: "active" | "jailed" | "inactive";
	stakeApproximateHype: string;
	commission: string;
	apr: Record<"day" | "week" | "month", string>;
}): StakingValidator {
	return {
		validator: address,
		signer: SIGNER,
		name,
		description,
		nRecentBlocks: status === "inactive" ? 0 : 128,
		stakeRaw: 100_000_000,
		stakeApproximateHype,
		isJailed: status === "jailed",
		unjailableAfter: status === "jailed" ? Date.UTC(2026, 8, 1) : null,
		isActive: status === "active",
		commission,
		status,
		stats: {
			day: { uptimeFraction: status === "active" ? "0.998" : "0.91", predictedApr: apr.day, nSamples: 24 },
			week: { uptimeFraction: status === "active" ? "0.997" : "0.92", predictedApr: apr.week, nSamples: 168 },
			month: { uptimeFraction: status === "active" ? "0.996" : "0.93", predictedApr: apr.month, nSamples: 720 },
		},
	};
}

function createAccount(): NonNullable<StakingController["account"]> {
	return {
		summary: {
			delegated: "14500",
			undelegated: "3200",
			totalPendingWithdrawal: "750",
			nPendingWithdrawals: 1,
		},
		delegations: [
			{
				validator: ACTIVE_VALIDATOR,
				amount: "14500",
				lockedUntilTimestamp: Date.UTC(2026, 8, 1),
			},
		],
		rewards: [
			{ time: Date.UTC(2026, 0, 15, 12), source: "delegation", totalAmount: "18.25" },
			{ time: Date.UTC(2026, 0, 14, 12), source: "delegation", totalAmount: "17.8" },
		],
		history: [
			{
				time: Date.UTC(2026, 0, 12, 8),
				hash: FIXTURE_HASH,
				action: { type: "delegate", validator: ACTIVE_VALIDATOR, amount: "2500" },
			},
		],
		spotHypeAvailable: "4800",
		stakingLink: null,
	};
}

function createEmptyAccount(): NonNullable<StakingController["account"]> {
	return {
		summary: { delegated: "0", undelegated: "0", totalPendingWithdrawal: "0", nPendingWithdrawals: 0 },
		delegations: [],
		rewards: [],
		history: [],
		spotHypeAvailable: "0",
		stakingLink: null,
	};
}
