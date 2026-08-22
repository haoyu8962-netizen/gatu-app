import { getReconnectDelayMs, WS_RELIABILITY_LIMITS } from "@gatu/hl-react";
import type { ISubscription } from "@nktkas/hyperliquid";
import { getSubscriptionClient } from "@/lib/hyperliquid";
import type { Bar } from "@/types/charting_library";
import { candleEventToBar } from "./candle";
import type { CandleInterval } from "./resolution";

export type StreamStatus = "idle" | "connecting" | "active" | "error";

export type StreamRuntime = {
	subscription?: ISubscription;
	promise?: Promise<ISubscription | undefined>;
	reconnectTimer?: ReturnType<typeof setTimeout>;
	cooldownTimer?: ReturnType<typeof setTimeout>;
	releaseTimer?: ReturnType<typeof setTimeout>;
	reconnectAttempts: number;
	recoveryGeneration: number;
	recoveredGeneration: number;
	awaitingFirstCandle: boolean;
	coin: string;
	interval: CandleInterval;
};

export type SubscribeContext = {
	key: string;
	runtime: Map<string, StreamRuntime>;
	getLastBar: () => Bar | undefined;
	hasListeners: () => boolean;
	onCandle: (bar: Bar) => void;
	onConnecting: () => void;
	onActive: () => void;
	onError: (error: unknown) => void;
	onCooldown: () => void;
	onResetListeners: () => void;
};

export function clearReconnectTimer(runtime: StreamRuntime): void {
	if (runtime.reconnectTimer) {
		clearTimeout(runtime.reconnectTimer);
		runtime.reconnectTimer = undefined;
	}
}

export function clearCooldownTimer(runtime: StreamRuntime): void {
	if (runtime.cooldownTimer) {
		clearTimeout(runtime.cooldownTimer);
		runtime.cooldownTimer = undefined;
	}
}

export function runUnsubscribe(subscription?: ISubscription): void {
	if (!subscription) return;
	void subscription.unsubscribe().catch(() => {});
}

export function scheduleReconnect(ctx: SubscribeContext): void {
	const entry = ctx.runtime.get(ctx.key);
	if (!entry || entry.reconnectTimer || entry.promise || entry.subscription) {
		return;
	}

	if (!ctx.hasListeners()) {
		return;
	}

	entry.reconnectAttempts += 1;
	if (entry.reconnectAttempts > WS_RELIABILITY_LIMITS.reconnect.maxAttemptsBeforeCooldown) {
		if (entry.cooldownTimer) {
			return;
		}

		ctx.onCooldown();

		entry.cooldownTimer = setTimeout(() => {
			const entry = ctx.runtime.get(ctx.key);
			if (!entry) return;
			entry.cooldownTimer = undefined;
			entry.reconnectAttempts = 0;

			if (!ctx.hasListeners()) {
				return;
			}

			startSubscription(ctx);
		}, WS_RELIABILITY_LIMITS.reconnect.cooldownMs);
		return;
	}

	const delay = getReconnectDelayMs(entry.reconnectAttempts);
	entry.reconnectTimer = setTimeout(() => {
		const entry = ctx.runtime.get(ctx.key);
		if (!entry) return;
		entry.reconnectTimer = undefined;

		if (!ctx.hasListeners()) {
			return;
		}

		startSubscription(ctx);
	}, delay);
}

export function startSubscription(ctx: SubscribeContext): void {
	const entry = ctx.runtime.get(ctx.key);
	if (!entry || entry.subscription || entry.promise) {
		return;
	}

	if (!ctx.hasListeners()) {
		return;
	}

	ctx.onConnecting();
	const owner = entry;

	// The SDK fires onError at most once, only after a confirmed subscription fails, and
	// removes the subscription itself — identity guards keep stale epochs from acting.
	// Failures only mark a pending recovery; listeners are reset once per recovery
	// generation after the server confirms the resubscription, and the failure streak
	// clears only when the first candle proves the stream is actually delivering data.
	let activeSubscription: ISubscription | undefined;
	const onSubscriptionError = (error: unknown) => {
		if (ctx.runtime.get(ctx.key) !== owner) return;
		if (!activeSubscription || owner.subscription !== activeSubscription) return;
		owner.subscription = undefined;
		owner.awaitingFirstCandle = false;
		owner.recoveryGeneration += 1;

		ctx.onError(error ?? new Error("Subscription failed"));
		scheduleReconnect(ctx);
	};

	owner.promise = getSubscriptionClient()
		.candle(
			{ coin: entry.coin, interval: entry.interval },
			(event) => {
				if (ctx.runtime.get(ctx.key) !== owner) return;
				const bar = candleEventToBar(event);
				if (!bar) return;
				if (owner.awaitingFirstCandle) {
					owner.awaitingFirstCandle = false;
					owner.reconnectAttempts = 0;
				}
				ctx.onCandle(bar);
			},
			{ onError: onSubscriptionError },
		)
		.then((subscription) => {
			if (ctx.runtime.get(ctx.key) !== owner) {
				runUnsubscribe(subscription);
				return subscription;
			}

			owner.promise = undefined;
			owner.subscription = subscription;
			activeSubscription = subscription;
			owner.awaitingFirstCandle = true;

			// Listener callbacks can reach third-party TradingView code; their exceptions
			// must not fall into the .catch below and misclassify a live subscription as failed.
			try {
				ctx.onActive();

				if (owner.recoveryGeneration > owner.recoveredGeneration) {
					ctx.onResetListeners();
					owner.recoveredGeneration = owner.recoveryGeneration;
				}
			} catch {}

			return subscription;
		})
		.catch((error) => {
			if (ctx.runtime.get(ctx.key) !== owner) return undefined;

			owner.promise = undefined;
			owner.subscription = undefined;
			owner.awaitingFirstCandle = false;
			owner.recoveryGeneration += 1;

			ctx.onError(error);
			scheduleReconnect(ctx);
			return undefined;
		});
}
