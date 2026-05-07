import { getReconnectDelayMs, WS_RELIABILITY_LIMITS } from "@hypeterminal/hl-react";
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
	if (!subscription || subscription.failureSignal.aborted) return;
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

	entry.promise = getSubscriptionClient()
		.candle({ coin: entry.coin, interval: entry.interval }, (event) => {
			const bar = candleEventToBar(event);
			if (!bar) return;
			ctx.onCandle(bar);
		})
		.then((subscription) => {
			const entry = ctx.runtime.get(ctx.key);
			if (!entry) {
				runUnsubscribe(subscription);
				return subscription;
			}

			entry.promise = undefined;

			if (!ctx.hasListeners()) {
				runUnsubscribe(subscription);
				ctx.runtime.delete(ctx.key);
				return subscription;
			}

			entry.subscription = subscription;
			entry.reconnectAttempts = 0;
			detachFailureListener(entry);

			const onFailure = () => {
				const entry = ctx.runtime.get(ctx.key);
				if (!entry) return;
				entry.subscription = undefined;
				detachFailureListener(entry);

				const reason = subscription.failureSignal.reason ?? new Error("Subscription failed");
				ctx.onError(reason);
				ctx.onResetListeners();
				scheduleReconnect(ctx);
			};

			subscription.failureSignal.addEventListener("abort", onFailure, { once: true });
			entry.detachFailureListener = () => {
				subscription.failureSignal.removeEventListener("abort", onFailure);
			};

			ctx.onActive();

			return subscription;
		})
		.catch((error) => {
			const entry = ctx.runtime.get(ctx.key);
			if (!entry) {
				return undefined;
			}

			entry.promise = undefined;
			entry.subscription = undefined;
			detachFailureListener(entry);

			ctx.onError(error);
			ctx.onResetListeners();
			scheduleReconnect(ctx);
			return undefined;
		});
}
