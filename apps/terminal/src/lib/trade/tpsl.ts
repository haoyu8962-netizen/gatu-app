import { DEFAULT_QUOTE_TOKEN } from "@/config/app";
import { type Numeric, toBig, toSafeBig } from "./numbers";
import type { Side } from "./types";

interface TpSlCollateralMarket {
	kind: "perp" | "spot" | "builderPerp";
	quoteToken?: {
		displayName?: string | null;
		name?: string | null;
	} | null;
}

export function getTpSlCollateralSymbol(market: TpSlCollateralMarket | null | undefined): string | null {
	if (!market || market.kind === "spot") return null;
	if (market.kind === "perp") return DEFAULT_QUOTE_TOKEN;
	const quoteSymbol = market.quoteToken?.displayName?.trim() || market.quoteToken?.name?.trim();
	return quoteSymbol || null;
}

export function calculateTpPrice(
	referencePrice: Numeric,
	side: Side,
	tpPercent: Numeric,
	decimals: number,
): string | null {
	const ref = toSafeBig(referencePrice);
	const pct = toSafeBig(tpPercent);
	if (ref.lte(0) || pct.lte(0)) return null;

	const percentValue = ref.times(pct).div(100);
	const price = side === "buy" ? ref.plus(percentValue) : ref.minus(percentValue);
	return price.toFixed(decimals);
}

export function calculateSlPrice(
	referencePrice: Numeric,
	side: Side,
	slPercent: Numeric,
	decimals: number,
): string | null {
	const ref = toSafeBig(referencePrice);
	const pct = toSafeBig(slPercent);
	if (ref.lte(0) || pct.lte(0)) return null;

	const percentValue = ref.times(pct).div(100);
	const price = side === "buy" ? ref.minus(percentValue) : ref.plus(percentValue);
	return price.toFixed(decimals);
}

export function calculateTpPriceFromRoe(
	referencePrice: Numeric,
	side: Side,
	tpPercent: Numeric,
	leverage: Numeric,
	decimals: number,
): string | null {
	const ref = toSafeBig(referencePrice);
	const pct = toSafeBig(tpPercent);
	const leverageValue = toSafeBig(leverage);
	if (ref.lte(0) || pct.lte(0) || leverageValue.lte(0)) return null;

	const priceDelta = ref.times(pct).div(100).div(leverageValue);
	const price = side === "buy" ? ref.plus(priceDelta) : ref.minus(priceDelta);
	return price.gt(0) ? price.toFixed(decimals) : null;
}

export function calculateSlPriceFromRoe(
	referencePrice: Numeric,
	side: Side,
	slPercent: Numeric,
	leverage: Numeric,
	decimals: number,
): string | null {
	const ref = toSafeBig(referencePrice);
	const pct = toSafeBig(slPercent);
	const leverageValue = toSafeBig(leverage);
	if (ref.lte(0) || pct.lte(0) || leverageValue.lte(0)) return null;

	const priceDelta = ref.times(pct).div(100).div(leverageValue);
	const price = side === "buy" ? ref.minus(priceDelta) : ref.plus(priceDelta);
	return price.gt(0) ? price.toFixed(decimals) : null;
}

export function calculatePercentFromPrice(
	referencePrice: Numeric,
	targetPrice: Numeric,
	side: Side,
	type: "tp" | "sl",
): number | null {
	const ref = toSafeBig(referencePrice);
	const target = toSafeBig(targetPrice);
	if (ref.lte(0) || target.lte(0)) return null;

	const percent = target.minus(ref).div(ref).times(100).toNumber();
	return type === "tp" ? (side === "buy" ? percent : -percent) : side === "buy" ? -percent : percent;
}

interface TpSlCalcParams {
	referencePrice: Numeric;
	side: Side;
	size: Numeric;
}

export function calculateEstimatedPnl(params: TpSlCalcParams, targetPrice: Numeric): number | null {
	const ref = toSafeBig(params.referencePrice);
	const target = toSafeBig(targetPrice);
	const sz = toSafeBig(params.size);
	if (ref.lte(0) || target.lte(0) || sz.lte(0)) return null;

	const pnl = target.minus(ref).times(sz).toNumber();
	return params.side === "buy" ? pnl : -pnl;
}

/**
 * Exact-string variant for position dialogs that keep exchange values as strings.
 * Conversion to `number` is intentionally left to the final display boundary.
 */
export function calculateEstimatedPnlExact(params: TpSlCalcParams, targetPrice: Numeric): string | null {
	const ref = toBig(params.referencePrice);
	const target = toBig(targetPrice);
	const size = toBig(params.size);
	if (!ref || !target || !size || ref.lte(0) || target.lte(0) || size.lte(0)) return null;

	const pnl = target.minus(ref).times(size);
	return (params.side === "buy" ? pnl : pnl.times(-1)).toString();
}

export function calculateTargetPriceFromPnl(
	referencePrice: Numeric,
	side: Side,
	size: Numeric,
	pnlMagnitude: Numeric,
	type: "tp" | "sl",
	decimals: number,
): string | null {
	const reference = toBig(referencePrice);
	const positionSize = toBig(size);
	const magnitude = toBig(pnlMagnitude);
	if (!reference || !positionSize || !magnitude || reference.lte(0) || positionSize.lte(0) || magnitude.lte(0)) {
		return null;
	}

	const favorableDirection = side === "buy" ? 1 : -1;
	const direction = type === "tp" ? favorableDirection : -favorableDirection;
	const target = reference.plus(magnitude.div(positionSize).times(direction));
	return target.gt(0) ? target.toFixed(decimals) : null;
}

export function calculateRoeMagnitudeFromPriceExact(
	referencePrice: Numeric,
	targetPrice: Numeric,
	side: Side,
	type: "tp" | "sl",
	leverage: Numeric,
): string | null {
	const reference = toBig(referencePrice);
	const target = toBig(targetPrice);
	const leverageValue = toBig(leverage);
	if (!reference || !target || !leverageValue || reference.lte(0) || target.lte(0) || leverageValue.lte(0)) {
		return null;
	}

	const favorableMove = target.minus(reference).times(side === "buy" ? 1 : -1);
	const typedMove = type === "tp" ? favorableMove : favorableMove.times(-1);
	if (typedMove.lte(0)) return null;
	return typedMove.div(reference).times(100).times(leverageValue).toString();
}

export function calculateRiskRewardRatioExact(tpPnl: Numeric, slPnl: Numeric): string | null {
	const takeProfit = toBig(tpPnl);
	const stopLoss = toBig(slPnl);
	if (!takeProfit || !stopLoss || stopLoss.gte(0)) return null;
	return takeProfit.abs().div(stopLoss.abs()).toString();
}

export function validateTpPrice(referencePrice: Numeric, tpPrice: Numeric, side: Side): boolean {
	const ref = toSafeBig(referencePrice);
	const tp = toSafeBig(tpPrice);
	if (ref.lte(0) || tp.lte(0)) return false;
	return side === "buy" ? tp.gt(ref) : tp.lt(ref);
}

export function validateSlPrice(referencePrice: Numeric, slPrice: Numeric, side: Side): boolean {
	const ref = toSafeBig(referencePrice);
	const sl = toSafeBig(slPrice);
	if (ref.lte(0) || sl.lte(0)) return false;
	return side === "buy" ? sl.lt(ref) : sl.gt(ref);
}

export function validatePositionSlPrice(
	markPrice: Numeric,
	liquidationPrice: Numeric,
	slPrice: Numeric,
	side: Side,
): boolean {
	const mark = toBig(markPrice);
	const liquidation = toBig(liquidationPrice);
	const stop = toBig(slPrice);
	if (!mark || !stop || mark.lte(0) || stop.lte(0)) return false;
	if (side === "buy" ? stop.gte(mark) : stop.lte(mark)) return false;
	if (!liquidation || liquidation.lte(0)) return true;
	return side === "buy" ? stop.gt(liquidation) : stop.lt(liquidation);
}

export function getTpSlValidationError(
	referencePrice: Numeric,
	tpPrice: Numeric,
	slPrice: Numeric,
	side: Side,
): string | null {
	if (toSafeBig(tpPrice).gt(0) && !validateTpPrice(referencePrice, tpPrice, side)) {
		return side === "buy" ? "TP must be above entry price" : "TP must be below entry price";
	}
	if (toSafeBig(slPrice).gt(0) && !validateSlPrice(referencePrice, slPrice, side)) {
		return side === "buy" ? "SL must be below entry price" : "SL must be above entry price";
	}
	return null;
}

export interface RiskRewardDisplay {
	risk: number;
	reward: number;
	label: string;
	isFavorable: boolean;
}

export function formatRiskRewardRatio(ratio: Numeric): RiskRewardDisplay | null {
	const ratioBig = toBig(ratio);
	if (!ratioBig || ratioBig.lte(0)) return null;

	const ratioNum = ratioBig.toNumber();
	const isFavorable = ratioNum >= 1;

	if (ratioNum >= 1) {
		const rounded = ratioBig.round(1).toNumber();
		const isWhole = rounded === Math.round(rounded);
		return {
			risk: 1,
			reward: rounded,
			label: `1:${isWhole ? Math.round(rounded) : rounded.toFixed(1)}`,
			isFavorable,
		};
	}

	const inverted = toSafeBig(1).div(ratioBig);
	const rounded = inverted.round(1).toNumber();
	const isWhole = rounded === Math.round(rounded);
	return {
		risk: rounded,
		reward: 1,
		label: `${isWhole ? Math.round(rounded) : rounded.toFixed(1)}:1`,
		isFavorable,
	};
}
