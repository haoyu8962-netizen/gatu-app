import Big from "big.js";
import { formatSizeForOrder } from "@/domain/trade/orders";
import { toBig } from "@/lib/trade/numbers";
import type { Side } from "@/lib/trade/types";

const SIGNED_DECIMAL_PATTERN = /^-?\d+(?:\.\d+)?$/;
const UNSIGNED_DECIMAL_INPUT_PATTERN = /^(?:\d+(?:\.\d*)?|\.\d+)$/;

export type PositionCloseSizingIntent =
	| { kind: "max" }
	| { kind: "percent"; value: string }
	| { kind: "size"; value: string };

export interface PositionMarketCloseSizeInput {
	signedPositionSize: string;
	closeSize: string;
	szDecimals: number;
}

export interface PositionMarketClosePercentInput {
	signedPositionSize: string;
	percent: string;
	szDecimals: number;
}

export interface PositionMarketClosePnlEstimateInput {
	signedPositionSize: string;
	normalizedCloseSize: string;
	unrealizedPnl?: string;
	entryPx?: string;
	markPx?: string;
}

export interface PositionMarketCloseResolution {
	normalizedSize: string;
	maxSize: string;
	effectivePercent: string;
	remainingSize: string;
	side: Side | null;
	errors: string[];
}

export function formatPositionMarketClosePercent(percent: string): string {
	const value = toBig(percent);
	if (!value) return "0";
	return value.round(1, Big.roundDown).toFixed(1).replace(/\.0$/, "");
}

export function estimatePositionMarketClosePnl(input: PositionMarketClosePnlEstimateInput): string | null {
	const positionSize = SIGNED_DECIMAL_PATTERN.test(input.signedPositionSize) ? toBig(input.signedPositionSize) : null;
	const closeSize = UNSIGNED_DECIMAL_INPUT_PATTERN.test(input.normalizedCloseSize)
		? toBig(input.normalizedCloseSize)
		: null;
	if (!positionSize || positionSize.eq(0) || !closeSize || closeSize.lte(0) || closeSize.gt(positionSize.abs())) {
		return null;
	}

	const fullPositionPnl =
		input.unrealizedPnl !== undefined && SIGNED_DECIMAL_PATTERN.test(input.unrealizedPnl)
			? toBig(input.unrealizedPnl)
			: null;
	if (fullPositionPnl) {
		return fullPositionPnl.times(closeSize).div(positionSize.abs()).toString();
	}

	const entryPx =
		input.entryPx !== undefined && UNSIGNED_DECIMAL_INPUT_PATTERN.test(input.entryPx) ? toBig(input.entryPx) : null;
	const markPx =
		input.markPx !== undefined && UNSIGNED_DECIMAL_INPUT_PATTERN.test(input.markPx) ? toBig(input.markPx) : null;
	if (!entryPx || entryPx.lte(0) || !markPx || markPx.lte(0)) return null;

	const direction = positionSize.gt(0) ? Big(1) : Big(-1);
	return markPx.minus(entryPx).times(closeSize).times(direction).toString();
}

interface PositionMarketCloseContext {
	maxSize: Big;
	rawMaxSize: Big;
	side: Side;
}

export function resolvePositionMarketCloseSize(input: PositionMarketCloseSizeInput): PositionMarketCloseResolution {
	const context = resolvePositionMarketCloseContext(input.signedPositionSize, input.szDecimals);
	if ("errors" in context) return createInvalidResolution(context.errors);
	if (!UNSIGNED_DECIMAL_INPUT_PATTERN.test(input.closeSize)) {
		return createResolution(context, "0", ["Close size must be a decimal number"]);
	}

	const closeSize = toBig(input.closeSize);
	if (!closeSize || closeSize.lte(0)) {
		return createResolution(context, "0", ["Close size must be greater than zero"]);
	}
	if (closeSize.gt(context.rawMaxSize)) {
		return createResolution(context, "0", ["Close size exceeds current position"]);
	}

	const normalizedSize = formatSizeForOrder(closeSize, input.szDecimals);
	const normalizedSizeValue = toBig(normalizedSize);
	if (!normalizedSizeValue || normalizedSizeValue.lte(0)) {
		return createResolution(context, "0", ["Close size is below market precision"]);
	}
	if (normalizedSizeValue.gt(context.maxSize)) {
		return createResolution(context, "0", ["Close size exceeds current position"]);
	}

	return createResolution(context, normalizedSize, []);
}

export function resolvePositionMarketClosePercent(
	input: PositionMarketClosePercentInput,
): PositionMarketCloseResolution {
	const context = resolvePositionMarketCloseContext(input.signedPositionSize, input.szDecimals);
	if ("errors" in context) return createInvalidResolution(context.errors);
	if (!UNSIGNED_DECIMAL_INPUT_PATTERN.test(input.percent)) {
		return createResolution(context, "0", ["Close percentage must be a decimal number"]);
	}

	const percent = toBig(input.percent);
	if (!percent || percent.lt(0) || percent.gt(100)) {
		return createResolution(context, "0", ["Close percentage must be between 0 and 100"]);
	}

	const closeSize = percent.gt("99.5")
		? context.maxSize.toString()
		: formatSizeForOrder(context.maxSize.times(percent).div(100), input.szDecimals);
	if (percent.gt(0) && closeSize === "0") {
		return createResolution(context, "0", ["Close size is below market precision"]);
	}

	return resolvePositionMarketCloseSize({
		signedPositionSize: input.signedPositionSize,
		closeSize,
		szDecimals: input.szDecimals,
	});
}

function resolvePositionMarketCloseContext(
	signedPositionSize: string,
	szDecimals: number,
): PositionMarketCloseContext | { errors: string[] } {
	if (!Number.isSafeInteger(szDecimals) || szDecimals < 0) {
		return { errors: ["Size precision must be a non-negative integer"] };
	}

	const positionSize = SIGNED_DECIMAL_PATTERN.test(signedPositionSize) ? toBig(signedPositionSize) : null;
	if (!positionSize || positionSize.eq(0)) {
		return { errors: ["Position size must be a non-zero number"] };
	}

	const rawMaxSize = positionSize.abs();
	const maxSize = toBig(formatSizeForOrder(rawMaxSize, szDecimals));
	if (!maxSize || maxSize.lte(0)) {
		return { errors: ["Position size is below market precision"] };
	}

	return {
		maxSize,
		rawMaxSize,
		side: positionSize.gt(0) ? "sell" : "buy",
	};
}

function createResolution(
	context: PositionMarketCloseContext,
	normalizedSize: string,
	errors: string[],
): PositionMarketCloseResolution {
	const closeSize = toBig(normalizedSize);
	const effectivePercent = closeSize?.gt(0) ? closeSize.div(context.maxSize).times(100).toString() : "0";
	const remainingSize = closeSize ? context.maxSize.minus(closeSize).toString() : context.maxSize.toString();

	return {
		normalizedSize,
		maxSize: context.maxSize.toString(),
		effectivePercent,
		remainingSize,
		side: context.side,
		errors,
	};
}

function createInvalidResolution(errors: string[]): PositionMarketCloseResolution {
	return {
		normalizedSize: "0",
		maxSize: "0",
		effectivePercent: "0",
		remainingSize: "0",
		side: null,
		errors,
	};
}
