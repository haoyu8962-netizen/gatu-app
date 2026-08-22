import Big from "big.js";
import { toBig } from "@/lib/trade/numbers";

const SIGNED_DECIMAL_PATTERN = /^-?\d+(?:\.\d+)?$/;
const UNSIGNED_DECIMAL_PATTERN = /^(?:\d+(?:\.\d*)?|\.\d+)$/;

export interface PositionLimitClosePnlInput {
	signedPositionSize: string;
	normalizedCloseSize: string;
	entryPx: string;
	limitPx: string;
}

/** Estimates realized PnL at the requested limit price without converting protocol decimals to Number. */
export function estimatePositionLimitClosePnl(input: PositionLimitClosePnlInput): string | null {
	const positionSize = SIGNED_DECIMAL_PATTERN.test(input.signedPositionSize) ? toBig(input.signedPositionSize) : null;
	const closeSize = UNSIGNED_DECIMAL_PATTERN.test(input.normalizedCloseSize) ? toBig(input.normalizedCloseSize) : null;
	const entryPx = UNSIGNED_DECIMAL_PATTERN.test(input.entryPx) ? toBig(input.entryPx) : null;
	const limitPx = UNSIGNED_DECIMAL_PATTERN.test(input.limitPx) ? toBig(input.limitPx) : null;

	if (
		!positionSize ||
		positionSize.eq(0) ||
		!closeSize ||
		closeSize.lte(0) ||
		closeSize.gt(positionSize.abs()) ||
		!entryPx ||
		entryPx.lte(0) ||
		!limitPx ||
		limitPx.lte(0)
	) {
		return null;
	}

	const direction = positionSize.gt(0) ? Big(1) : Big(-1);
	return limitPx.minus(entryPx).times(closeSize).times(direction).toString();
}
