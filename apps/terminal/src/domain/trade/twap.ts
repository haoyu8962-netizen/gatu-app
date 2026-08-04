import Big from "big.js";
import type { SubscriptionStatus } from "@/lib/hyperliquid";

export const TWAP_RECONCILIATION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const TWAP_RECONCILIATION_CONFIRMATION_WINDOW_MS = 2 * 60 * 1000;

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
	stopPx?: string | null;
	trigger?: TwapTrigger | null;
}

export interface TwapTrigger {
	px: string;
	above: boolean;
}

export interface TwapStateLike {
	coin: string;
	side: "B" | "A";
	sz: string;
	minutes: number;
	reduceOnly: boolean;
	randomize: boolean;
	stopPx?: string | null;
	trigger?: TwapTrigger | null;
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
		areEqualNullableDecimals(intent.stopPx, state.stopPx) &&
		matchesTrigger(intent.trigger, state.trigger) &&
		areEqualDecimals(intent.size, state.sz)
	);
}

function areEqualNullableDecimals(left: string | null | undefined, right: string | null | undefined): boolean {
	if (left == null || right == null) return left == null && right == null;
	return areEqualDecimals(left, right);
}

function matchesTrigger(left: TwapTrigger | null | undefined, right: TwapTrigger | null | undefined): boolean {
	if (left == null || right == null) return left == null && right == null;
	return left.above === right.above && areEqualDecimals(left.px, right.px);
}

function areEqualDecimals(left: string, right: string): boolean {
	try {
		return new Big(left).eq(right);
	} catch {
		return false;
	}
}
