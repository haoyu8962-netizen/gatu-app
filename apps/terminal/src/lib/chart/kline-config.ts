import { CHART_FAVORITE_INTERVALS, CHART_SUPPORTED_RESOLUTIONS } from "@/config/chart";
import type { CandleInterval } from "./resolution";
import { RESOLUTIONS } from "./resolution";

export interface IntervalConfig {
	label: string;
	resolution: string;
	candleInterval: CandleInterval;
	barMs: number;
}

function buildIntervalConfig(resolution: string): IntervalConfig | null {
	const config = RESOLUTIONS[resolution];
	if (!config) return null;
	return { ...config, resolution };
}

export const FAVORITE_SET = new Set(CHART_FAVORITE_INTERVALS as unknown as string[]);

const ALL_INTERVALS = (CHART_SUPPORTED_RESOLUTIONS as unknown as string[])
	.map(buildIntervalConfig)
	.filter((c): c is IntervalConfig => c !== null);

export const STARRED_INTERVALS = ALL_INTERVALS.filter((i) => FAVORITE_SET.has(i.resolution));
export const MORE_INTERVALS = ALL_INTERVALS.filter((i) => !FAVORITE_SET.has(i.resolution));
export const DEFAULT_INTERVAL = STARRED_INTERVALS.find((i) => i.resolution === "60") ?? STARRED_INTERVALS[0];
