import Big from "big.js";
import { toBig } from "@/lib/trade/numbers";

export interface ToolbarPositionChangeInput {
	unrealizedPnl: string;
	szi: string;
	entryPx: string;
}

export interface ToolbarAccountMarginInput {
	crossMaintenanceMarginUsed: string;
	accountEquity: string;
}

export interface ToolbarOrderMetricsInput {
	isTrigger: boolean;
	limitPx: string;
	triggerPx: string;
	sz: string;
	markPx: string;
}

export interface ToolbarOrderMetrics {
	referencePx: string | null;
	remainingValue: string | null;
	markDistanceRatio: string | null;
}

export interface ToolbarTwapMetricsInput {
	sz: string;
	executedSz: string;
	executedNtl: string;
	timestampMs: string;
	minutes: string;
	nowMs: string;
}

export interface ToolbarTwapMetrics {
	progressRatio: string | null;
	executedAvgPx: string | null;
	remainingMs: string | null;
}

export interface ToolbarFundingUpdateInput {
	usdc: string;
}

function getPositive(value: string): Big | null {
	const parsed = toBig(value);
	return parsed?.gt(0) ? parsed : null;
}

function getNonNegative(value: string): Big | null {
	const parsed = toBig(value);
	return parsed?.gte(0) ? parsed : null;
}

export function getToolbarPositionChangeRatio(input: ToolbarPositionChangeInput): string | null {
	const unrealizedPnl = toBig(input.unrealizedPnl);
	const size = toBig(input.szi)?.abs();
	const entryPx = getPositive(input.entryPx);

	if (!unrealizedPnl || !size?.gt(0) || !entryPx) return null;
	return unrealizedPnl.div(size.times(entryPx)).toString();
}

export function getToolbarAccountMarginRatio(input: ToolbarAccountMarginInput): string | null {
	const maintenanceMargin = getNonNegative(input.crossMaintenanceMarginUsed);
	const accountEquity = getPositive(input.accountEquity);

	if (!maintenanceMargin || !accountEquity) return null;
	return maintenanceMargin.div(accountEquity).toString();
}

export function getToolbarOrderMetrics(input: ToolbarOrderMetricsInput): ToolbarOrderMetrics {
	const referencePx = getPositive(input.isTrigger ? input.triggerPx : input.limitPx);
	const size = getNonNegative(input.sz);
	const markPx = getPositive(input.markPx);

	return {
		referencePx: referencePx?.toString() ?? null,
		remainingValue: referencePx && size ? referencePx.times(size).toString() : null,
		markDistanceRatio: referencePx && markPx ? referencePx.minus(markPx).abs().div(markPx).toString() : null,
	};
}

export function getToolbarTwapMetrics(input: ToolbarTwapMetricsInput): ToolbarTwapMetrics {
	const size = getPositive(input.sz);
	const executedSize = getNonNegative(input.executedSz);
	const executedNotional = getNonNegative(input.executedNtl);
	const timestampMs = getNonNegative(input.timestampMs);
	const minutes = getPositive(input.minutes);
	const nowMs = getNonNegative(input.nowMs);

	let progressRatio: string | null = null;
	if (size && executedSize) {
		const ratio = executedSize.div(size);
		progressRatio = (ratio.gt(1) ? Big(1) : ratio).toString();
	}

	const executedAvgPx = executedSize?.gt(0) && executedNotional ? executedNotional.div(executedSize).toString() : null;

	let remainingMs: string | null = null;
	if (timestampMs && minutes && nowMs) {
		const endAtMs = timestampMs.plus(minutes.times(60_000));
		const remaining = endAtMs.minus(nowMs);
		remainingMs = (remaining.gt(0) ? remaining : Big(0)).toString();
	}

	return { progressRatio, executedAvgPx, remainingMs };
}

export function getToolbarNonZeroPnl(value: string): string | null {
	const pnl = toBig(value);
	return pnl && !pnl.eq(0) ? pnl.toFixed() : null;
}

export function getToolbarFundingTotal(updates: readonly ToolbarFundingUpdateInput[]): string | null {
	let total = Big(0);
	for (const update of updates) {
		const payment = toBig(update.usdc);
		if (!payment) return null;
		total = total.plus(payment);
	}
	return total.toFixed();
}

export function getToolbarAbsoluteSize(value: string): string | null {
	const size = toBig(value);
	return size ? size.abs().toFixed() : null;
}
