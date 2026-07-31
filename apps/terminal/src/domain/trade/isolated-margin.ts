import type {
	TopUpIsolatedOnlyMarginParameters,
	UpdateIsolatedMarginParameters,
} from "@nktkas/hyperliquid/api/exchange";
import Big from "big.js";

const MICRO_USD_SCALE = new Big(1_000_000);
const MAX_SAFE_INTEGER = new Big(Number.MAX_SAFE_INTEGER);
const USD_AMOUNT_PATTERN = /^\d+(?:\.\d{0,6})?$/;
const LEVERAGE_PATTERN = /^\d+(?:\.\d+)?$/;

export type IsolatedMarginDirection = "add" | "remove";
export type PerpMarginConstraint = "strictIsolated" | "noCross";

interface PerpMarginMetadata {
	marginMode?: PerpMarginConstraint;
	onlyIsolated?: true;
}

interface AmountAdjustmentInput {
	assetId: number;
	isLong: boolean;
	direction: IsolatedMarginDirection;
	amount: string;
}

export function buildIsolatedMarginAmountParameters(
	input: AmountAdjustmentInput,
): UpdateIsolatedMarginParameters | null {
	const amount = input.amount.trim();
	if (!USD_AMOUNT_PATTERN.test(amount)) return null;

	try {
		const microUsd = new Big(amount).times(MICRO_USD_SCALE);
		if (!microUsd.gt(0) || !microUsd.eq(microUsd.round(0)) || microUsd.gt(MAX_SAFE_INTEGER)) return null;

		const ntli = input.direction === "remove" ? microUsd.neg().toNumber() : microUsd.toNumber();
		return {
			asset: input.assetId,
			isBuy: input.isLong,
			ntli,
		};
	} catch {
		return null;
	}
}

export function buildIsolatedMarginTargetParameters(
	assetId: number,
	targetLeverage: string,
): TopUpIsolatedOnlyMarginParameters | null {
	const target = targetLeverage.trim();
	if (!LEVERAGE_PATTERN.test(target)) return null;

	try {
		const leverage = new Big(target);
		if (!leverage.gt(0)) return null;
		return {
			asset: assetId,
			leverage: leverage.toFixed(),
		};
	} catch {
		return null;
	}
}

export function calculateEffectiveLeverage(positionValue: string, marginUsed: string): number | null {
	try {
		const margin = new Big(marginUsed);
		if (!margin.gt(0)) return null;

		const leverage = new Big(positionValue).abs().div(margin).toNumber();
		return Number.isFinite(leverage) ? leverage : null;
	} catch {
		return null;
	}
}

export function getPerpMarginConstraint(
	market: PerpMarginMetadata | null | undefined,
): PerpMarginConstraint | undefined {
	if (!market) return undefined;
	if (market.marginMode) return market.marginMode;

	// Legacy `onlyIsolated` does not distinguish strictIsolated from noCross.
	// Fail closed so an older market can never expose an unsupported withdrawal.
	return market.onlyIsolated === true ? "strictIsolated" : undefined;
}

export function canRemoveIsolatedMargin(marginConstraint: PerpMarginConstraint | undefined): boolean {
	return marginConstraint !== "strictIsolated";
}
