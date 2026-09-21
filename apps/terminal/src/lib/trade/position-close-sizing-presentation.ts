import {
	formatPositionMarketClosePercent,
	type PositionCloseSizingIntent,
	type PositionMarketCloseResolution,
} from "@/domain/trade/position-market-close";
import { toBig, toFixed } from "@/lib/trade/numbers";

export interface PositionCloseSizingViewModel {
	effectivePercent: string;
	requestedPercent: string;
	sizeInput: string;
	percentInput: string;
	sliderValue: number;
}

export function createPositionCloseSizingViewModel(
	intent: PositionCloseSizingIntent,
	resolution: PositionMarketCloseResolution,
	szDecimals: number,
): PositionCloseSizingViewModel {
	const effectivePercent = formatPositionMarketClosePercent(resolution.effectivePercent);
	return {
		effectivePercent,
		requestedPercent: getRequestedPercent(intent, effectivePercent),
		sizeInput: intent.kind === "size" ? intent.value : toFixed(resolution.normalizedSize, szDecimals),
		percentInput: formatPercentInput(resolution.effectivePercent),
		sliderValue: getSliderValue(resolution.effectivePercent),
	};
}

function getRequestedPercent(intent: PositionCloseSizingIntent, effectivePercent: string): string {
	if (intent.kind === "max") return "100";
	if (intent.kind === "percent") return intent.value;
	return effectivePercent;
}

function getSliderValue(value: string): number {
	const parsed = toBig(value);
	if (!parsed) return 0;
	if (parsed.lte(0)) return 0;
	if (parsed.gte(100)) return 100;
	return parsed.toNumber();
}

function formatPercentInput(value: string): string {
	const parsed = toBig(value);
	if (!parsed || parsed.lte(0)) return "0";
	if (parsed.gte(100)) return "100";
	return parsed.round(0, 1).toFixed(0);
}
