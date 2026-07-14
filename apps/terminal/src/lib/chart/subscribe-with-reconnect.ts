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
	detachFailureListener?: () => void;
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

export function detachFailureListener(runtime: StreamRuntime): void {
	runtime.detachFailureListener?.();
	runtime.detachFailureListener = undefined;
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

	owner.promise = getSubscriptionClient()
		.candle({ coin: entry.coin, interval: entry.interval }, (event) => {
			if (ctx.runtime.get(ctx.key) !== owner) return;
			const bar = candleEventToBar(event);
			if (!bar) return;
			ctx.onCandle(bar);
		})
		.then((subscription) => {
			if (ctx.runtime.get(ctx.key) !== owner) {
				runUnsubscribe(subscription);
				return subscription;
			}

			owner.promise = undefined;
			owner.subscription = subscription;
			owner.reconnectAttempts = 0;
			detachFailureListener(owner);

			const onFailure = () => {
				if (ctx.runtime.get(ctx.key) !== owner || owner.subscription !== subscription) return;
				owner.subscription = undefined;
				detachFailureListener(owner);
				runUnsubscribe(subscription);

				const reason = subscription.failureSignal.reason ?? new Error("Subscription failed");
				ctx.onError(reason);
				ctx.onResetListeners();
				scheduleReconnect(ctx);
			};

			subscription.failureSignal.addEventListener("abort", onFailure, { once: true });
			owner.detachFailureListener = () => {
				subscription.failureSignal.removeEventListener("abort", onFailure);
			};

			ctx.onActive();

			return subscription;
		})
		.catch((error) => {
			if (ctx.runtime.get(ctx.key) !== owner) return undefined;

			owner.promise = undefined;
			owner.subscription = undefined;
			detachFailureListener(owner);

			ctx.onError(error);
			ctx.onResetListeners();
			scheduleReconnect(ctx);
			return undefined;
		});
}
