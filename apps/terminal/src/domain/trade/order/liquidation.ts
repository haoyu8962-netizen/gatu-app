import Big from "big.js";
import { LIQ_WARNING_THRESHOLD } from "@/config/trade";
import type { MarginMode } from "@/lib/trade/margin-mode";
import { type Numeric, toBig } from "@/lib/trade/numbers";
import type { Side } from "@/lib/trade/types";

export interface MarginTierInput {
	lowerBound: Numeric;
	maxLeverage: number;
}

interface MarginTableInput {
	marginTiers: readonly ResolvedMarketMarginTier[];
}

interface ResolvedMarketMarginTier {
	lowerBound: string;
	maxLeverage: number;
}

export interface ExistingPositionInput {
	signedSize: Numeric;
	positionValue: Numeric;
	marginUsed: Numeric;
	marginMode: MarginMode;
	leverage: Numeric;
}

export interface CrossMarginAccountInput {
	accountValue: Numeric;
	maintenanceMarginUsed: Numeric;
}

export interface ProspectiveLiquidationInput {
	price: Numeric;
	orderSize: Numeric;
	leverage: Numeric;
	side: Side;
	marginMode: MarginMode;
	accountMode: string | null | undefined;
	marginTiers: readonly MarginTierInput[] | null | undefined;
	dataReady: boolean;
	reduceOnly?: boolean;
	existingPosition?: ExistingPositionInput | null;
	crossMarginAccount?: CrossMarginAccountInput | null;
	executionFee?: Numeric;
}

export interface CrossMarginDexStateInput {
	dex: string;
	crossMaintenanceMarginUsed: Numeric;
	positions: readonly {
		marginMode: MarginMode;
		marginUsed: Numeric;
	}[];
}

export interface ResolveCrossMarginAccountInput {
	accountMode: string | null | undefined;
	selectedDex: string;
	selectedCollateralToken: number | null | undefined;
	selectedCrossAccountValue: Numeric;
	selectedCrossMaintenanceMarginUsed: Numeric;
	allDexStates: readonly CrossMarginDexStateInput[];
	dexCollateralTokens: readonly { dex: string; token: number }[];
	spotBalances: readonly { token: number; total: Numeric }[];
	dataReady: boolean;
}

export type ProspectiveLiquidationUnavailableReason =
	| "data-unavailable"
	| "invalid-input"
	| "invalid-margin-tiers"
	| "unsupported-account-mode"
	| "unsupported-margin-mode"
	| "unsupported-position-change"
	| "position-not-maintained"
	| "entry-leverage-exceeds-tier";

export type ProspectiveLiquidationResult =
	| {
			status: "available";
			liqPrice: number;
			liqWarning: boolean;
			tierIndex: number;
	  }
	| {
			status: "unavailable";
			liqPrice: null;
			liqWarning: false;
			reason: ProspectiveLiquidationUnavailableReason;
	  };

interface NormalizedMarginTier {
	index: number;
	lowerBound: Big;
	upperBound: Big | null;
	maxLeverage: Big;
	maintenanceRate: Big;
	maintenanceDeduction: Big;
}

const SUPPORTED_ACCOUNT_MODES = new Set(["disabled", "unifiedAccount"]);
export const PROSPECTIVE_ACCOUNT_SNAPSHOT_MAX_AGE_MS = 60_000;
export const PROSPECTIVE_ACCOUNT_SNAPSHOT_MAX_SKEW_MS = 5_000;

function unavailable(reason: ProspectiveLiquidationUnavailableReason): ProspectiveLiquidationResult {
	return { status: "unavailable", liqPrice: null, liqWarning: false, reason };
}

export function areProspectiveAccountSnapshotsFresh(input: {
	perpReceivedAt: number | undefined;
	spotReceivedAt?: number | undefined;
	requireSpot: boolean;
	now?: number;
}): boolean {
	const now = input.now ?? Date.now();
	const perpReceivedAt = input.perpReceivedAt;
	if (!Number.isFinite(now) || !Number.isFinite(perpReceivedAt)) return false;
	const perpAge = now - (perpReceivedAt as number);
	if (perpAge < 0 || perpAge > PROSPECTIVE_ACCOUNT_SNAPSHOT_MAX_AGE_MS) return false;
	if (!input.requireSpot) return true;

	const spotReceivedAt = input.spotReceivedAt;
	if (!Number.isFinite(spotReceivedAt)) return false;
	const spotAge = now - (spotReceivedAt as number);
	if (spotAge < 0 || spotAge > PROSPECTIVE_ACCOUNT_SNAPSHOT_MAX_AGE_MS) return false;
	return Math.abs((perpReceivedAt as number) - (spotReceivedAt as number)) <= PROSPECTIVE_ACCOUNT_SNAPSHOT_MAX_SKEW_MS;
}

export function areProspectiveAccountSnapshotsIndividuallyFresh(input: {
	perpReceivedAt: number | undefined;
	spotReceivedAt: number | undefined;
	now?: number;
}): boolean {
	const now = input.now ?? Date.now();
	return isFreshSnapshotTimestamp(input.perpReceivedAt, now) && isFreshSnapshotTimestamp(input.spotReceivedAt, now);
}

/**
 * A draft is estimated once it has a size. A cross draft above the executable
 * maximum is included: like the official UI, the estimate then assumes the
 * account is topped up to the position's initial margin.
 */
export function canEstimateProspectiveLiquidationDraft(input: { orderSize: Numeric }): boolean {
	return toBig(input.orderSize)?.gt(0) === true;
}

function isFreshSnapshotTimestamp(receivedAt: number | undefined, now: number): boolean {
	if (!Number.isFinite(now) || !Number.isFinite(receivedAt)) return false;
	const age = now - (receivedAt as number);
	return age >= 0 && age <= PROSPECTIVE_ACCOUNT_SNAPSHOT_MAX_AGE_MS;
}

/**
 * Resolves the equity and maintenance pool used by Hyperliquid cross margin.
 * Standard accounts use the selected DEX cross summary. Unified accounts use
 * the protocol's collateral-token aggregation across every DEX.
 */
export function resolveCrossMarginAccount(input: ResolveCrossMarginAccountInput): CrossMarginAccountInput | null {
	if (!input.dataReady) return null;
	if (input.accountMode === "disabled") {
		const accountValue = toBig(input.selectedCrossAccountValue);
		const maintenanceMarginUsed = toBig(input.selectedCrossMaintenanceMarginUsed);
		if (!accountValue || !maintenanceMarginUsed || accountValue.lt(0) || maintenanceMarginUsed.lt(0)) return null;
		return { accountValue: accountValue.toString(), maintenanceMarginUsed: maintenanceMarginUsed.toString() };
	}
	if (input.accountMode !== "unifiedAccount") return null;
	if (!Number.isSafeInteger(input.selectedCollateralToken) || (input.selectedCollateralToken ?? -1) < 0) return null;

	const selectedToken = input.selectedCollateralToken as number;
	const tokenByDex = new Map<string, number>();
	for (const mapping of input.dexCollateralTokens) {
		if (!Number.isSafeInteger(mapping.token) || mapping.token < 0) return null;
		const existing = tokenByDex.get(mapping.dex);
		if (existing !== undefined && existing !== mapping.token) return null;
		tokenByDex.set(mapping.dex, mapping.token);
	}
	if (tokenByDex.get(input.selectedDex) !== selectedToken) return null;

	let maintenanceMarginUsed = Big(0);
	let isolatedMargin = Big(0);
	for (const state of input.allDexStates) {
		const stateMaintenance = toBig(state.crossMaintenanceMarginUsed);
		if (!stateMaintenance || stateMaintenance.lt(0)) return null;
		const token = tokenByDex.get(state.dex);
		if (token === undefined) {
			if (!stateMaintenance.eq(0) || state.positions.length > 0) return null;
			continue;
		}
		if (token !== selectedToken) continue;

		maintenanceMarginUsed = maintenanceMarginUsed.plus(stateMaintenance);
		for (const position of state.positions) {
			if (position.marginMode !== "isolated") continue;
			const marginUsed = toBig(position.marginUsed);
			if (!marginUsed || marginUsed.lt(0)) return null;
			isolatedMargin = isolatedMargin.plus(marginUsed);
		}
	}

	const matchingSpotBalances = input.spotBalances.filter((balance) => balance.token === selectedToken);
	if (matchingSpotBalances.length > 1) return null;
	const spotTotal = matchingSpotBalances.length === 0 ? Big(0) : toBig(matchingSpotBalances[0]?.total);
	if (!spotTotal) return null;
	const accountValue = spotTotal.minus(isolatedMargin);
	if (accountValue.lt(0)) return null;

	return { accountValue: accountValue.toString(), maintenanceMarginUsed: maintenanceMarginUsed.toString() };
}

/**
 * Resolves the margin tiers carried by the perpetual metadata response.
 * Hyperliquid reserves table IDs below 50 for implicit single-tier tables
 * whose ID equals the tier's maximum leverage.
 */
export function resolveMarketMarginTiers(input: {
	marginTableId: number;
	maxLeverage: number;
	marginTables: readonly (readonly [number, MarginTableInput])[];
}): readonly ResolvedMarketMarginTier[] | null {
	const explicitTables = input.marginTables.filter(([id]) => id === input.marginTableId);
	if (explicitTables.length > 1) return null;
	const explicitTable = explicitTables[0]?.[1];
	if (explicitTable) {
		if (explicitTable.marginTiers[0]?.maxLeverage !== input.maxLeverage) return null;
		return explicitTable.marginTiers;
	}

	if (
		Number.isSafeInteger(input.marginTableId) &&
		input.marginTableId > 0 &&
		input.marginTableId < 50 &&
		input.maxLeverage === input.marginTableId
	) {
		return [{ lowerBound: "0", maxLeverage: input.marginTableId }];
	}

	return null;
}

function normalizeMarginTiers(tiers: readonly MarginTierInput[]): NormalizedMarginTier[] | null {
	if (tiers.length === 0) return null;

	const normalized: NormalizedMarginTier[] = [];
	let previousRate = Big(0);
	let previousDeduction = Big(0);

	for (let index = 0; index < tiers.length; index++) {
		const tier = tiers[index];
		const lowerBound = toBig(tier?.lowerBound);
		const maxLeverage = toBig(tier?.maxLeverage);
		if (
			!lowerBound ||
			!maxLeverage ||
			lowerBound.lt(0) ||
			maxLeverage.lte(0) ||
			!maxLeverage.eq(maxLeverage.round(0, Big.roundDown))
		) {
			return null;
		}
		if (index === 0 ? !lowerBound.eq(0) : !lowerBound.gt(normalized[index - 1].lowerBound)) {
			return null;
		}

		const maintenanceRate = Big(1).div(maxLeverage.times(2));
		if (index > 0 && maintenanceRate.lt(previousRate)) return null;
		const maintenanceDeduction =
			index === 0 ? Big(0) : previousDeduction.plus(lowerBound.times(maintenanceRate.minus(previousRate)));

		normalized.push({
			index,
			lowerBound,
			upperBound: null,
			maxLeverage,
			maintenanceRate,
			maintenanceDeduction,
		});
		previousRate = maintenanceRate;
		previousDeduction = maintenanceDeduction;
	}

	for (let index = 0; index < normalized.length - 1; index++) {
		normalized[index].upperBound = normalized[index + 1].lowerBound;
	}
	return normalized;
}

export type LeveragePositionLimit =
	| { status: "limited"; maxPositionNotional: string }
	| { status: "unlimited" }
	| { status: "unavailable" };

/**
 * Whether the market's margin table caps the position notional at some
 * leverage. Only valid tables with more than one tier do; the official
 * terminal uses the same `marginTiers.length > 1` condition.
 */
export function hasLeveragePositionLimits(tiers: readonly MarginTierInput[] | null | undefined): boolean {
	const normalized = tiers ? normalizeMarginTiers(tiers) : null;
	return normalized !== null && normalized.length > 1;
}

/**
 * Resolves the position notional up to which `leverage` can be opened: the
 * lower bound of the first tier whose maximum leverage is below it, because a
 * position at or above that bound must use that tier's lower leverage. Invalid
 * tables and leverages outside the first tier fail closed.
 */
export function getLeveragePositionLimit(
	tiers: readonly MarginTierInput[] | null | undefined,
	leverage: number,
): LeveragePositionLimit {
	const normalized = tiers ? normalizeMarginTiers(tiers) : null;
	if (!normalized || !Number.isSafeInteger(leverage) || leverage < 1) return { status: "unavailable" };
	if (Big(leverage).gt(normalized[0].maxLeverage)) return { status: "unavailable" };

	const limitingTier = normalized.find((tier) => tier.maxLeverage.lt(leverage));
	if (!limitingTier) return { status: "unlimited" };
	return { status: "limited", maxPositionNotional: limitingTier.lowerBound.toFixed() };
}

function getTierForNotional(tiers: readonly NormalizedMarginTier[], notional: Big) {
	return tiers.find(
		(tier) => notional.gte(tier.lowerBound) && (tier.upperBound === null || notional.lt(tier.upperBound)),
	);
}

function getProjectedPosition(input: {
	price: Big;
	orderSize: Big;
	leverage: Big;
	side: Side;
	marginMode: MarginMode;
	tiers: readonly NormalizedMarginTier[];
	existingPosition: ExistingPositionInput | null | undefined;
	crossMarginAccount: CrossMarginAccountInput | null | undefined;
	executionFee: Big;
}): { equity: Big; otherMaintenance: Big; positionSize: Big; positionSide: 1 | -1 } | null {
	const orderSide = input.side === "buy" ? 1 : -1;
	const existing = input.existingPosition;
	if (input.marginMode === "cross") {
		const accountValue = toBig(input.crossMarginAccount?.accountValue)?.minus(input.executionFee);
		const maintenanceMarginUsed = toBig(input.crossMarginAccount?.maintenanceMarginUsed);
		if (!accountValue || !maintenanceMarginUsed || maintenanceMarginUsed.lt(0)) return null;
		if (!existing) {
			return {
				equity: accountValue,
				otherMaintenance: maintenanceMarginUsed,
				positionSize: input.orderSize,
				positionSide: orderSide,
			};
		}
		if (existing.marginMode !== "cross") return null;
		const signedSize = toBig(existing.signedSize);
		const positionValue = toBig(existing.positionValue)?.abs();
		if (!signedSize || !positionValue || signedSize.eq(0) || positionValue.lte(0)) return null;
		const positionSide = signedSize.gt(0) ? 1 : -1;
		if (positionSide !== orderSide) return null;

		const currentTier = getTierForNotional(input.tiers, positionValue);
		if (!currentTier) return null;
		const currentTargetMaintenance = positionValue
			.times(currentTier.maintenanceRate)
			.minus(currentTier.maintenanceDeduction);
		const otherMaintenance = maintenanceMarginUsed.minus(currentTargetMaintenance);
		if (otherMaintenance.lt(0)) return null;

		const existingSize = signedSize.abs();
		const snapshotMark = positionValue.div(existingSize);
		const equityAtExecution = accountValue.plus(signedSize.times(input.price.minus(snapshotMark)));
		return {
			equity: equityAtExecution,
			otherMaintenance,
			positionSize: existingSize.plus(input.orderSize),
			positionSide,
		};
	}

	const orderMargin = input.orderSize.times(input.price).div(input.leverage);
	if (!existing) {
		return { equity: orderMargin, otherMaintenance: Big(0), positionSize: input.orderSize, positionSide: orderSide };
	}
	if (existing.marginMode !== "isolated") return null;
	const signedSize = toBig(existing.signedSize);
	const positionValue = toBig(existing.positionValue)?.abs();
	const marginUsed = toBig(existing.marginUsed);
	const positionLeverage = toBig(existing.leverage);
	if (
		!signedSize ||
		!positionValue ||
		!marginUsed ||
		!positionLeverage ||
		signedSize.eq(0) ||
		positionValue.lte(0) ||
		marginUsed.lte(0) ||
		!positionLeverage.eq(input.leverage)
	) {
		return null;
	}

	const positionSide = signedSize.gt(0) ? 1 : -1;
	if (positionSide !== orderSide) return null;
	const existingSize = signedSize.abs();
	const snapshotMark = positionValue.div(existingSize);
	const existingEquityAtExecution = marginUsed.plus(signedSize.times(input.price.minus(snapshotMark)));
	const equity = existingEquityAtExecution.plus(orderMargin);
	if (equity.lte(0)) return null;

	return {
		equity,
		otherMaintenance: Big(0),
		positionSize: existingSize.plus(input.orderSize),
		positionSide,
	};
}

/**
 * Like the official UI, a cross estimate never assumes less than the position's
 * initial margin: when the account's live value (equity less the other
 * positions' maintenance) is below notional / leverage, the account is taken as
 * topped up to exactly that amount, so a draft above the executable maximum
 * still has a liquidation price.
 */
function withInitialMarginTopUp(projection: { equity: Big; otherMaintenance: Big }, initialMargin: Big): Big {
	const liveValue = projection.equity.minus(projection.otherMaintenance);
	return liveValue.gte(initialMargin) ? projection.equity : initialMargin.plus(projection.otherMaintenance);
}

/**
 * Estimates the liquidation price after a full fill for isolated or cross new
 * positions and same-direction adds. Portfolio/reducing/reversing paths fail
 * closed because their liquidation sequence cannot be represented by one price.
 */
export function estimateProspectiveLiquidation(input: ProspectiveLiquidationInput): ProspectiveLiquidationResult {
	if (!input.dataReady) return unavailable("data-unavailable");
	if (!SUPPORTED_ACCOUNT_MODES.has(input.accountMode ?? "")) return unavailable("unsupported-account-mode");
	if (input.reduceOnly) return unavailable("unsupported-position-change");

	const price = toBig(input.price);
	const orderSize = toBig(input.orderSize);
	const leverage = toBig(input.leverage);
	const parsedExecutionFee = toBig(input.executionFee ?? 0);
	if (!price || !orderSize || !leverage || !parsedExecutionFee || price.lte(0) || orderSize.lte(0) || leverage.lte(0)) {
		return unavailable("invalid-input");
	}
	const executionFee = parsedExecutionFee.gt(0) ? parsedExecutionFee : Big(0);

	const tiers = input.marginTiers ? normalizeMarginTiers(input.marginTiers) : null;
	if (!tiers) return unavailable("invalid-margin-tiers");

	const projection = getProjectedPosition({
		price,
		orderSize,
		leverage,
		side: input.side,
		marginMode: input.marginMode,
		tiers,
		existingPosition: input.existingPosition,
		crossMarginAccount: input.crossMarginAccount,
		executionFee,
	});
	if (!projection) return unavailable("unsupported-position-change");

	const entryNotional = projection.positionSize.times(price);
	const entryTier = getTierForNotional(tiers, entryNotional);
	if (!entryTier) return unavailable("invalid-margin-tiers");
	if (leverage.gt(entryTier.maxLeverage)) return unavailable("entry-leverage-exceeds-tier");
	const equity =
		input.marginMode === "cross" ? withInitialMarginTopUp(projection, entryNotional.div(leverage)) : projection.equity;
	const entryMaintenance = entryNotional.times(entryTier.maintenanceRate).minus(entryTier.maintenanceDeduction);
	if (equity.lte(projection.otherMaintenance.plus(entryMaintenance))) {
		return unavailable("position-not-maintained");
	}

	const side = Big(projection.positionSide);
	for (const tier of tiers) {
		const numerator = side
			.times(projection.positionSize)
			.times(price)
			.minus(equity)
			.plus(projection.otherMaintenance)
			.minus(tier.maintenanceDeduction);
		const denominator = projection.positionSize.times(side.minus(tier.maintenanceRate));
		if (denominator.eq(0)) continue;
		const candidate = numerator.div(denominator);
		if (candidate.lte(0)) continue;

		const candidateNotional = projection.positionSize.times(candidate);
		if (candidateNotional.lt(tier.lowerBound)) continue;
		if (tier.upperBound !== null && candidateNotional.gte(tier.upperBound)) continue;

		const liqPrice = candidate.toNumber();
		if (!Number.isFinite(liqPrice) || liqPrice <= 0) return unavailable("invalid-input");
		const liqWarning = candidate.minus(price).abs().div(price).lt(LIQ_WARNING_THRESHOLD);
		return { status: "available", liqPrice, liqWarning, tierIndex: tier.index };
	}

	return unavailable("invalid-margin-tiers");
}
