import { type Numeric, toBig, toSafeBig } from "@/lib/trade/numbers";

export function isAmountWithinBalance(amount: Numeric, available: Numeric): boolean {
	const amountBig = toSafeBig(amount);
	const availableBig = toSafeBig(available);
	return amountBig.gt(0) && amountBig.lte(availableBig);
}

export function exceedsBalance(amount: Numeric, available: Numeric): boolean {
	const amountBig = toSafeBig(amount);
	const availableBig = toSafeBig(available);
	return amountBig.gt(availableBig);
}

export function getPercent(part: Numeric, whole: Numeric): number {
	const partBig = toBig(part);
	const wholeBig = toBig(whole);
	if (!partBig || !wholeBig || wholeBig.eq(0)) return 0;
	return partBig.div(wholeBig).times(100).toNumber();
}

export function getAvgPrice(notional: Numeric, size: Numeric): number | null {
	const ntl = toBig(notional);
	const sz = toBig(size);
	if (!ntl || !sz || sz.eq(0)) return null;
	return ntl.div(sz).toNumber();
}

export function getRiskRewardRatio(tpPnl: number | null, slPnl: number | null): number | null {
	if (tpPnl === null || slPnl === null || slPnl >= 0) return null;
	const reward = toBig(Math.abs(tpPnl));
	const risk = toBig(Math.abs(slPnl));
	if (!reward || !risk || risk.eq(0)) return null;
	return reward.div(risk).toNumber();
}

export function get24hChange(prevDayPx: Numeric, markPx: Numeric): number | null {
	const prev = toBig(prevDayPx);
	const mark = toBig(markPx);
	if (!prev || prev.eq(0) || !mark) return null;
	// Returns percentage points (e.g. 10 => +10%), not a decimal ratio.
	// Divide by 100 before passing to `formatPercent`.
	return mark.minus(prev).div(prev).times(100).toNumber();
}

export function get24hPriceChange(prevDayPx: Numeric, markPx: Numeric): number | null {
	const prev = toBig(prevDayPx);
	const mark = toBig(markPx);
	if (!prev || !mark) return null;
	return mark.minus(prev).toNumber();
}

export function getEightHourFundingRate(fundingRate: Numeric): number | null {
	const funding = toBig(fundingRate);
	if (!funding) return null;
	return funding.times(8).toNumber();
}

export interface FundingPeriodRates {
	sevenDays: string;
	thirtyDays: string;
	oneYear: string;
}

export function getFundingPeriodRates(fundingRate: Numeric): FundingPeriodRates | null {
	const funding = toBig(fundingRate);
	if (!funding) return null;
	return {
		sevenDays: funding.times(24 * 7).toFixed(),
		thirtyDays: funding.times(24 * 30).toFixed(),
		oneYear: funding.times(24 * 365).toFixed(),
	};
}

export function getOiUsd(openInterest: Numeric, markPx: Numeric): number | null {
	const oi = toBig(openInterest);
	const px = toBig(markPx);
	if (!oi || !px) return null;
	return oi.times(px).toNumber();
}

export function getMarketCapUsd(circulatingSupply: Numeric, price: Numeric): string | null {
	const supply = toBig(circulatingSupply);
	const px = toBig(price);
	if (!supply || !px) return null;
	return supply.times(px).toFixed();
}
