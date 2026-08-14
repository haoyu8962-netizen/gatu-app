import Big from "big.js";

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/u;
const HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/u;
const UNSIGNED_DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d+)?$/u;
const HYPE_INPUT_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{0,8})?$/u;
const HYPE_WEI_SCALE = Big(10).pow(8);

export type StakingPeriod = "day" | "week" | "month";
export type StakingValidatorStatus = "active" | "jailed" | "inactive";
export type StakingPageState = "normal" | "loading" | "error" | "empty" | "disconnected" | "nonSigning";
export type StakingAccountDataState = "ready" | "loading" | "error" | "disconnected";
export type StakingActionKind = "cDeposit" | "cWithdraw" | "delegate" | "undelegate";

export interface StakingValidatorStats {
	uptimeFraction: string;
	predictedApr: string;
	nSamples: number;
}

export interface StakingValidator {
	validator: `0x${string}`;
	signer: `0x${string}`;
	name: string;
	description: string;
	nRecentBlocks: number;
	/** Raw 1e8 integer after the SDK has already parsed JSON as a JS number. */
	stakeRaw: number;
	/** Always approximate because stakeRaw may have crossed JS's safe-integer boundary. */
	stakeApproximateHype: string;
	isJailed: boolean;
	unjailableAfter: number | null;
	isActive: boolean;
	commission: string;
	status: StakingValidatorStatus;
	stats: Record<StakingPeriod, StakingValidatorStats>;
}

export interface StakingSummary {
	delegated: string;
	undelegated: string;
	totalPendingWithdrawal: string;
	nPendingWithdrawals: number;
}

export interface StakingDelegation {
	validator: `0x${string}`;
	amount: string;
	lockedUntilTimestamp: number;
}

export interface StakingReward {
	time: number;
	source: "delegation" | "commission";
	totalAmount: string;
}

export type StakingHistoryAction =
	| { type: "delegate"; validator: `0x${string}`; amount: string }
	| { type: "undelegate"; validator: `0x${string}`; amount: string }
	| { type: "cDeposit"; amount: string }
	| { type: "withdrawalInitiated"; amount: string }
	| { type: "withdrawalFinalized"; amount: string };

export interface StakingHistoryEntry {
	time: number;
	hash: `0x${string}`;
	action: StakingHistoryAction;
}

export type StakingLink =
	| { type: "requested"; stakingUser: `0x${string}` }
	| { type: "tradingUser"; stakingUser: `0x${string}` }
	| { type: "stakingUser"; tradingUser: `0x${string}` }
	| null;

export interface StakingValidatorView extends StakingValidator {
	delegatedAmount: string;
	lockedUntilTimestamp: number | null;
	selectedStats: StakingValidatorStats;
}

export interface StakingActionRequest {
	kind: StakingActionKind;
	maxAmount: string;
	validator?: `0x${string}`;
	validatorName?: string;
	lockedUntilTimestamp?: number | null;
}

export interface StakingActionSubmission {
	request: StakingActionRequest;
	amount: string;
	wei: number;
}

export type HypeAmountValidation =
	| { valid: true; amount: string; wei: number }
	| { valid: false; reason: "required" | "format" | "positive" | "maximum" | "unsafe" };

export interface DeriveStakingPageStateInput {
	publicState: "ready" | "loading" | "error";
	accountState: StakingAccountDataState;
	hasExactMasterSigner: boolean;
}

export function parseValidatorSummaries(value: unknown): StakingValidator[] | null {
	if (!Array.isArray(value)) return null;
	const validators: StakingValidator[] = [];
	const seen = new Set<string>();

	for (const candidate of value) {
		if (!isRecord(candidate)) return null;
		if (!isAddress(candidate.validator) || !isAddress(candidate.signer)) return null;
		if (typeof candidate.name !== "string" || typeof candidate.description !== "string") return null;
		if (!isNonNegativeSafeInteger(candidate.nRecentBlocks)) return null;
		if (typeof candidate.stake !== "number" || !Number.isFinite(candidate.stake) || candidate.stake < 0) return null;
		if (typeof candidate.isJailed !== "boolean" || typeof candidate.isActive !== "boolean") return null;
		if (candidate.unjailableAfter !== null && !isTimestamp(candidate.unjailableAfter)) return null;
		if (!isUnsignedDecimal(candidate.commission)) return null;
		const stats = parseValidatorStats(candidate.stats);
		if (!stats) return null;

		const identity = candidate.validator.toLowerCase();
		if (seen.has(identity)) return null;
		seen.add(identity);
		const status: StakingValidatorStatus = candidate.isJailed ? "jailed" : candidate.isActive ? "active" : "inactive";

		validators.push({
			validator: candidate.validator,
			signer: candidate.signer,
			name: candidate.name,
			description: candidate.description,
			nRecentBlocks: candidate.nRecentBlocks,
			stakeRaw: candidate.stake,
			stakeApproximateHype: Big(String(candidate.stake)).div(HYPE_WEI_SCALE).toString(),
			isJailed: candidate.isJailed,
			unjailableAfter: candidate.unjailableAfter,
			isActive: candidate.isActive,
			commission: candidate.commission,
			status,
			stats,
		});
	}

	return validators;
}

export function parseStakingSummary(value: unknown): StakingSummary | null {
	if (!isRecord(value)) return null;
	if (
		!isUnsignedDecimal(value.delegated) ||
		!isUnsignedDecimal(value.undelegated) ||
		!isUnsignedDecimal(value.totalPendingWithdrawal) ||
		!isNonNegativeSafeInteger(value.nPendingWithdrawals)
	) {
		return null;
	}
	return {
		delegated: normalizeDecimal(value.delegated),
		undelegated: normalizeDecimal(value.undelegated),
		totalPendingWithdrawal: normalizeDecimal(value.totalPendingWithdrawal),
		nPendingWithdrawals: value.nPendingWithdrawals,
	};
}

export function parseStakingDelegations(value: unknown): StakingDelegation[] | null {
	if (!Array.isArray(value)) return null;
	const delegations: StakingDelegation[] = [];
	const seen = new Set<string>();
	for (const candidate of value) {
		if (!isRecord(candidate) || !isAddress(candidate.validator)) return null;
		if (!isUnsignedDecimal(candidate.amount) || !isTimestamp(candidate.lockedUntilTimestamp)) return null;
		const identity = candidate.validator.toLowerCase();
		if (seen.has(identity)) return null;
		seen.add(identity);
		delegations.push({
			validator: candidate.validator,
			amount: normalizeDecimal(candidate.amount),
			lockedUntilTimestamp: candidate.lockedUntilTimestamp,
		});
	}
	return delegations;
}

export function parseStakingRewards(value: unknown): StakingReward[] | null {
	if (!Array.isArray(value)) return null;
	const rewards: StakingReward[] = [];
	for (const candidate of value) {
		if (!isRecord(candidate) || !isTimestamp(candidate.time)) return null;
		if (candidate.source !== "delegation" && candidate.source !== "commission") return null;
		if (!isUnsignedDecimal(candidate.totalAmount)) return null;
		rewards.push({
			time: candidate.time,
			source: candidate.source,
			totalAmount: normalizeDecimal(candidate.totalAmount),
		});
	}
	return rewards;
}

export function parseStakingHistory(value: unknown): StakingHistoryEntry[] | null {
	if (!Array.isArray(value)) return null;
	const history: StakingHistoryEntry[] = [];
	for (const candidate of value) {
		if (!isRecord(candidate) || !isTimestamp(candidate.time) || !isHash(candidate.hash)) return null;
		const action = parseHistoryAction(candidate.delta);
		if (!action) return null;
		history.push({ time: candidate.time, hash: candidate.hash, action });
	}
	return history;
}

export function isSystemFinalizedWithdrawal(entry: StakingHistoryEntry): boolean {
	return entry.action.type === "withdrawalFinalized" && /^0x0{64}$/iu.test(entry.hash);
}

export function parseStakingLink(value: unknown): StakingLink | undefined {
	if (!isRecord(value) || !("stakingLink" in value)) return undefined;
	const link = value.stakingLink;
	if (link === null) return null;
	if (!isRecord(link) || typeof link.type !== "string") return undefined;
	if ((link.type === "requested" || link.type === "tradingUser") && isAddress(link.stakingUser)) {
		return { type: link.type, stakingUser: link.stakingUser };
	}
	if (link.type === "stakingUser" && isAddress(link.tradingUser)) {
		return { type: link.type, tradingUser: link.tradingUser };
	}
	return undefined;
}

export function parseSpotHypeAvailable(value: unknown): string | null {
	if (!isRecord(value) || !Array.isArray(value.balances)) return null;
	const hypeBalances = value.balances.filter(
		(candidate): candidate is Record<string, unknown> => isRecord(candidate) && candidate.coin === "HYPE",
	);
	if (hypeBalances.length === 0) return "0";
	if (hypeBalances.length !== 1) return null;

	const hype = hypeBalances[0];
	if (!hype || !isUnsignedDecimal(hype.total) || !isUnsignedDecimal(hype.hold)) return null;
	if ("token" in hype && !isNonNegativeSafeInteger(hype.token)) return null;
	if (hype.spotHold !== undefined && !isUnsignedDecimal(hype.spotHold)) return null;

	if (value.tokenToAvailableAfterMaintenance !== undefined) {
		if (!Array.isArray(value.tokenToAvailableAfterMaintenance) || !isNonNegativeSafeInteger(hype.token)) return null;
		const matches = value.tokenToAvailableAfterMaintenance.filter(
			(candidate): candidate is [number, string] =>
				Array.isArray(candidate) &&
				candidate.length === 2 &&
				candidate[0] === hype.token &&
				isUnsignedDecimal(candidate[1]),
		);
		if (matches.length > 1) return null;
		if (matches.length === 1) return normalizeDecimal(matches[0]?.[1] ?? "0");
	}

	const available = Big(hype.total).minus(Big(typeof hype.spotHold === "string" ? hype.spotHold : hype.hold));
	return available.gte(0) ? available.toString() : null;
}

export function createValidatorViews(
	validators: readonly StakingValidator[],
	delegations: readonly StakingDelegation[] | undefined,
	period: StakingPeriod,
): StakingValidatorView[] {
	const delegationByValidator = new Map(
		(delegations ?? []).map((delegation) => [delegation.validator.toLowerCase(), delegation] as const),
	);
	return validators.map((validator) => {
		const delegation = delegationByValidator.get(validator.validator.toLowerCase());
		return {
			...validator,
			delegatedAmount: delegation?.amount ?? "0",
			lockedUntilTimestamp: delegation?.lockedUntilTimestamp ?? null,
			selectedStats: validator.stats[period],
		};
	});
}

export function sumApproximateNetworkStake(validators: readonly StakingValidator[]): string {
	return validators.reduce((sum, validator) => sum.plus(validator.stakeApproximateHype), Big(0)).toString();
}

export function calculateDelegationWeightedApr(
	validators: readonly StakingValidator[],
	delegations: readonly StakingDelegation[],
	period: StakingPeriod,
): string | null {
	if (delegations.length === 0) return null;
	const validatorByAddress = new Map(
		validators.map((validator) => [validator.validator.toLowerCase(), validator] as const),
	);
	let delegated = Big(0);
	let weightedApr = Big(0);
	for (const delegation of delegations) {
		const amount = Big(delegation.amount);
		if (amount.eq(0)) continue;
		const validator = validatorByAddress.get(delegation.validator.toLowerCase());
		if (!validator) return null;
		delegated = delegated.plus(amount);
		weightedApr = weightedApr.plus(amount.times(validator.stats[period].predictedApr));
	}
	return delegated.gt(0) ? weightedApr.div(delegated).toString() : null;
}

export function validateHypeActionAmount(input: string, maximum?: string): HypeAmountValidation {
	const trimmed = input.trim();
	if (!trimmed) return { valid: false, reason: "required" };
	if (!HYPE_INPUT_PATTERN.test(trimmed)) return { valid: false, reason: "format" };
	const amount = Big(trimmed);
	if (!amount.gt(0)) return { valid: false, reason: "positive" };
	if (maximum !== undefined) {
		if (!isUnsignedDecimal(maximum)) return { valid: false, reason: "maximum" };
		if (amount.gt(Big(maximum))) return { valid: false, reason: "maximum" };
	}
	const scaled = amount.times(HYPE_WEI_SCALE);
	if (!scaled.round(0, Big.roundDown).eq(scaled)) return { valid: false, reason: "format" };
	const wei = Number(scaled.toString());
	if (!Number.isSafeInteger(wei) || wei <= 0) return { valid: false, reason: "unsafe" };
	return { valid: true, amount: amount.toFixed(), wei };
}

export function createStakingActionSubmission(
	request: StakingActionRequest,
	input: string,
): StakingActionSubmission | null {
	const validation = validateHypeActionAmount(input, request.maxAmount);
	if (!validation.valid) return null;
	return { request, amount: validation.amount, wei: validation.wei };
}

export function deriveStakingPageState({
	publicState,
	accountState,
	hasExactMasterSigner,
}: DeriveStakingPageStateInput): StakingPageState {
	if (publicState === "error") return "error";
	if (publicState === "loading") return "loading";
	if (accountState === "disconnected") return "disconnected";
	if (accountState === "error") return "error";
	if (accountState === "loading") return "loading";
	return hasExactMasterSigner ? "normal" : "nonSigning";
}

export function canDelegateToValidator(validator: Pick<StakingValidator, "isActive" | "isJailed">): boolean {
	return validator.isActive && !validator.isJailed;
}

export function canUndelegate(
	delegation: Pick<StakingDelegation, "amount" | "lockedUntilTimestamp"> | undefined,
	nowMs = Date.now(),
): boolean {
	return Boolean(delegation && Big(delegation.amount).gt(0) && delegation.lockedUntilTimestamp <= nowMs);
}

export function formatStakingAmount(value: string, maximumFractionDigits = 4): string {
	if (!isUnsignedDecimal(value) || !Number.isSafeInteger(maximumFractionDigits) || maximumFractionDigits < 0)
		return "—";
	const rounded = Big(value).toFixed(maximumFractionDigits, Big.roundDown);
	const [integer = "0", fraction = ""] = rounded.split(".");
	const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/gu, ",");
	const trimmedFraction = fraction.replace(/0+$/u, "");
	return trimmedFraction ? `${grouped}.${trimmedFraction}` : grouped;
}

export function formatStakingRatio(value: string, maximumFractionDigits = 2): string {
	if (!isUnsignedDecimal(value)) return "—";
	return `${formatStakingAmount(Big(value).times(100).toString(), maximumFractionDigits)}%`;
}

function parseValidatorStats(value: unknown): Record<StakingPeriod, StakingValidatorStats> | null {
	if (!Array.isArray(value) || value.length !== 3) return null;
	const parsed = new Map<StakingPeriod, StakingValidatorStats>();
	for (const candidate of value) {
		if (!Array.isArray(candidate) || candidate.length !== 2) return null;
		const [period, stats] = candidate;
		if ((period !== "day" && period !== "week" && period !== "month") || !isRecord(stats)) return null;
		if (
			!isUnsignedDecimal(stats.uptimeFraction) ||
			Big(stats.uptimeFraction).gt(1) ||
			!isUnsignedDecimal(stats.predictedApr) ||
			!isNonNegativeSafeInteger(stats.nSamples) ||
			parsed.has(period)
		) {
			return null;
		}
		parsed.set(period, {
			uptimeFraction: normalizeDecimal(stats.uptimeFraction),
			predictedApr: normalizeDecimal(stats.predictedApr),
			nSamples: stats.nSamples,
		});
	}
	const day = parsed.get("day");
	const week = parsed.get("week");
	const month = parsed.get("month");
	return day && week && month ? { day, week, month } : null;
}

function parseHistoryAction(value: unknown): StakingHistoryAction | null {
	if (!isRecord(value)) return null;
	const keys = Object.keys(value);
	if (keys.length !== 1) return null;
	if ("delegate" in value && isRecord(value.delegate)) {
		const delegate = value.delegate;
		if (!isAddress(delegate.validator) || !isUnsignedDecimal(delegate.amount)) return null;
		if (typeof delegate.isUndelegate !== "boolean") return null;
		return {
			type: delegate.isUndelegate ? "undelegate" : "delegate",
			validator: delegate.validator,
			amount: normalizeDecimal(delegate.amount),
		};
	}
	if ("cDeposit" in value && isRecord(value.cDeposit) && isUnsignedDecimal(value.cDeposit.amount)) {
		return { type: "cDeposit", amount: normalizeDecimal(value.cDeposit.amount) };
	}
	if ("withdrawal" in value && isRecord(value.withdrawal) && isUnsignedDecimal(value.withdrawal.amount)) {
		if (value.withdrawal.phase !== "initiated" && value.withdrawal.phase !== "finalized") return null;
		return {
			type: value.withdrawal.phase === "initiated" ? "withdrawalInitiated" : "withdrawalFinalized",
			amount: normalizeDecimal(value.withdrawal.amount),
		};
	}
	return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAddress(value: unknown): value is `0x${string}` {
	return typeof value === "string" && ADDRESS_PATTERN.test(value);
}

function isHash(value: unknown): value is `0x${string}` {
	return typeof value === "string" && HASH_PATTERN.test(value);
}

function isUnsignedDecimal(value: unknown): value is string {
	if (typeof value !== "string" || !UNSIGNED_DECIMAL_PATTERN.test(value)) return false;
	try {
		return Big(value).gte(0);
	} catch {
		return false;
	}
}

// toFixed() keeps small values in plain decimal notation; toString() would emit
// exponential forms like "1e-7" that downstream marker validation rejects.
function normalizeDecimal(value: string): string {
	return Big(value).toFixed();
}

function isNonNegativeSafeInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isTimestamp(value: unknown): value is number {
	return isNonNegativeSafeInteger(value) && Number.isFinite(new Date(value).getTime());
}
