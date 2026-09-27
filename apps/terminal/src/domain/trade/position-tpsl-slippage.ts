import Big from "big.js";
import { type Numeric, toBig } from "@/lib/trade/numbers";

const MAX_MARKET_ORDER_NOTIONAL_PATTERN = /^[0-9]+(\.[0-9]+)?$/;

interface MaxMarketOrderNotionalTier {
	leverage: number;
	notional: Big;
}

function parseMaxMarketOrderNotionalTier(entry: unknown): MaxMarketOrderNotionalTier | null {
	if (!Array.isArray(entry) || entry.length !== 2) return null;
	const [leverage, notional] = entry;
	if (typeof leverage !== "number" || !Number.isFinite(leverage) || leverage <= 0) return null;
	if (typeof notional !== "string" || !MAX_MARKET_ORDER_NOTIONAL_PATTERN.test(notional)) return null;
	const value = new Big(notional);
	if (!value.gt(0)) return null;
	return { leverage, notional: value };
}

/**
 * Selects the maximum market order notional for a position leverage from an
 * unvalidated `maxMarketOrderNtls` response: the tier with the highest leverage
 * threshold that does not exceed `positionLeverage`. Any malformed entry makes
 * the whole table unusable, because the SDK validates only the request.
 */
export function getMaxMarketOrderNotional(tiers: unknown, positionLeverage: number): Big | null {
	if (!Array.isArray(tiers) || !Number.isFinite(positionLeverage)) return null;
	let selected: MaxMarketOrderNotionalTier | null = null;
	for (const entry of tiers) {
		const tier = parseMaxMarketOrderNotionalTier(entry);
		if (!tier) return null;
		if (tier.leverage > positionLeverage) continue;
		if (!selected || tier.leverage > selected.leverage) selected = tier;
	}
	return selected?.notional ?? null;
}

export interface PositionTpSlSlippageInput {
	tiers: unknown;
	positionLeverage: number;
	positionValue: Numeric;
}

/**
 * Mirrors the official position TP/SL advisory: warn when the whole position
 * value is strictly greater than the maximum market order notional selected by
 * the position's current leverage.
 */
export function shouldWarnPositionTpSlSlippage({
	tiers,
	positionLeverage,
	positionValue,
}: PositionTpSlSlippageInput): boolean {
	const value = toBig(positionValue);
	if (!value?.gt(0)) return false;
	const limit = getMaxMarketOrderNotional(tiers, positionLeverage);
	return limit ? value.gt(limit) : false;
}
