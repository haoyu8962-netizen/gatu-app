import Big from "big.js";
import type { SubscriptionStatus } from "@/lib/hyperliquid";

export const TWAP_RECONCILIATION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type TwapViewState = "disconnected" | "loading" | "error" | "stale" | "ready";

interface TwapViewStateInput {
	isConnected: boolean;
	status: SubscriptionStatus;
	hasData: boolean;
	isStale: boolean;
}

export interface TwapIntent {
	assetId: number;
	coin: string;
	side: "B" | "A";
	size: string;
	minutes: number;
	reduceOnly: boolean;
	randomize: boolean;
}

export interface TwapStateLike {
	coin: string;
	side: "B" | "A";
	sz: string;
	minutes: number;
	reduceOnly: boolean;
	randomize: boolean;
}

export function getTwapViewState(input: TwapViewStateInput): TwapViewState {
	if (!input.isConnected) return "disconnected";
	if (!input.hasData) return input.status === "error" ? "error" : "loading";
	if (input.status === "error" || input.isStale) return "stale";
	return "ready";
}

export function matchesTwapIntent(intent: TwapIntent, state: TwapStateLike): boolean {
	return (
		intent.coin === state.coin &&
		intent.side === state.side &&
		intent.minutes === state.minutes &&
		intent.reduceOnly === state.reduceOnly &&
		intent.randomize === state.randomize &&
		areEqualDecimals(intent.size, state.sz)
	);
}

function areEqualDecimals(left: string, right: string): boolean {
	try {
		return new Big(left).eq(right);
	} catch {
		return false;
	}
}
