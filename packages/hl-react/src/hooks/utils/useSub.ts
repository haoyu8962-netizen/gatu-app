import type { ISubscription } from "@nktkas/hyperliquid";
import { useEffect, useRef } from "react";
import { useStore } from "zustand";
import { OversizedWebSocketPayloadError } from "../../errors";
import { createThrottledUpdater } from "../../internal/websocket/batch-updater";
import { isPayloadOversized } from "../../internal/websocket/payload-guard";
import {
	getPayloadLimitBytesForSubscriptionKey,
	getStalenessThresholdForKey,
	getSubscriptionMethodForKey,
	shouldDropOversizedPayloadForSubscriptionKey,
} from "../../internal/websocket/reliability";
import { useHyperliquidStoreApi } from "../../provider";
import { getStoreInternals } from "../../store";
import type { SubscribeFailureOptions, SubscriptionOptions, SubscriptionResult } from "../../types";

export function useSub<TData>(
	key: string,
	subscribe: (listener: (data: TData) => void, failureOptions?: SubscribeFailureOptions) => Promise<ISubscription>,
	options: SubscriptionOptions = {},
): SubscriptionResult<TData> {
	const { enabled = true, throttleMs, maxStaleMs, maxPayloadBytes, dropOversizedPayload, pauseWhenHidden } = options;
	const stalenessThresholdMs = maxStaleMs ?? getStalenessThresholdForKey(key);
	const store = useHyperliquidStoreApi();
	const entry = useStore(store, (state) => state.subscriptions[key]);
	const payloadLimitBytes = maxPayloadBytes ?? getPayloadLimitBytesForSubscriptionKey(key);
	const shouldDropOversizedPayload = dropOversizedPayload ?? shouldDropOversizedPayloadForSubscriptionKey(key);

	const subscribeRef = useRef(subscribe);
	subscribeRef.current = subscribe;

	useEffect(() => {
		if (!enabled) return;
		const state = store.getState();
		const subscriptionRuntime = getStoreInternals(store).subscriptionRuntime;
		let droppedPayloads = 0;
		let lastWarningAt = 0;
		let payloadErrorActive = false;

		const shouldDropPayload = (data: TData): boolean => {
			if (!shouldDropOversizedPayload) return false;

			const { estimatedBytes, oversized } = isPayloadOversized(data, payloadLimitBytes);
			if (!oversized) {
				payloadErrorActive = false;
				return false;
			}

			droppedPayloads += 1;
			if (!payloadErrorActive) {
				payloadErrorActive = true;
				state.setSubscriptionError(key, new OversizedWebSocketPayloadError(key, estimatedBytes, payloadLimitBytes));
			}
			const now = Date.now();
			const shouldWarn = droppedPayloads === 1 || now - lastWarningAt >= 30_000;
			if (import.meta.env.DEV && shouldWarn) {
				lastWarningAt = now;
				console.warn(
					`[WebSocket] Dropped oversized payload for ${key}. Estimated: ${estimatedBytes}B, limit: ${payloadLimitBytes}B, dropped: ${droppedPayloads}`,
				);
			}
			return true;
		};

		if (throttleMs) {
			const method = getSubscriptionMethodForKey(key);
			const shouldDiscardQueuedDataOnError = method === "l2Book" || method === "bbo";
			let subscriptionGeneration = 0;
			const updater = createThrottledUpdater<{ data: TData; isCurrent: () => boolean; receivedAt: number }>(
				({ data, isCurrent, receivedAt }) => {
					if (!isCurrent()) return;
					state.setSubscriptionData(key, data, receivedAt);
				},
				throttleMs,
			);

			state.acquireSubscription(
				key,
				(failureOptions) => {
					const expectedRuntime = subscriptionRuntime.get(key);
					const generation = ++subscriptionGeneration;
					const isCurrentGeneration = () =>
						expectedRuntime !== undefined &&
						subscriptionRuntime.get(key) === expectedRuntime &&
						generation === subscriptionGeneration;
					const invalidateGeneration = () => {
						if (!isCurrentGeneration()) return;
						subscriptionGeneration += 1;
						if (shouldDiscardQueuedDataOnError) updater.destroy();
					};
					const guardedFailureOptions = {
						...failureOptions,
						onError: (error: unknown) => {
							if (!isCurrentGeneration()) return;
							invalidateGeneration();
							failureOptions?.onError?.(error);
						},
					};
					const promise = subscribeRef.current((data) => {
						if (!isCurrentGeneration()) return;
						const receivedAt = Date.now();
						if (shouldDropPayload(data)) {
							if (shouldDiscardQueuedDataOnError) updater.destroy();
							return;
						}
						updater.add({ data, isCurrent: isCurrentGeneration, receivedAt });
					}, guardedFailureOptions);

					return promise.catch((error) => {
						invalidateGeneration();
						throw error;
					});
				},
				stalenessThresholdMs,
				pauseWhenHidden,
			);
			const acquiredRuntime = subscriptionRuntime.get(key);
			return () => {
				const currentRuntime = subscriptionRuntime.get(key);
				// The first consumer owns the listener/updater for the shared runtime.
				// Preserve its queue while another consumer still keeps that runtime alive.
				if (!currentRuntime || currentRuntime !== acquiredRuntime || currentRuntime.refCount <= 1) {
					updater.destroy();
				}
				store.getState().releaseSubscription(key);
			};
		}

		let subscriptionGeneration = 0;
		state.acquireSubscription(
			key,
			(failureOptions) => {
				const expectedRuntime = subscriptionRuntime.get(key);
				const generation = ++subscriptionGeneration;
				const isCurrentGeneration = () =>
					expectedRuntime !== undefined &&
					subscriptionRuntime.get(key) === expectedRuntime &&
					generation === subscriptionGeneration;
				const guardedFailureOptions = {
					...failureOptions,
					onError: (error: unknown) => {
						if (!isCurrentGeneration()) return;
						subscriptionGeneration += 1;
						failureOptions?.onError?.(error);
					},
				};
				return subscribeRef
					.current((data) => {
						if (!isCurrentGeneration()) return;
						const receivedAt = Date.now();
						if (shouldDropPayload(data)) return;
						state.setSubscriptionData(key, data, receivedAt);
					}, guardedFailureOptions)
					.catch((error) => {
						if (isCurrentGeneration()) subscriptionGeneration += 1;
						throw error;
					});
			},
			stalenessThresholdMs,
			pauseWhenHidden,
		);
		return () => store.getState().releaseSubscription(key);
	}, [
		enabled,
		key,
		pauseWhenHidden,
		payloadLimitBytes,
		shouldDropOversizedPayload,
		stalenessThresholdMs,
		store,
		throttleMs,
	]);

	if (!enabled) {
		return {
			data: undefined,
			status: "idle",
			error: undefined,
			isStale: false,
			lastMessageAt: undefined,
			unsubscribe: async () => store.getState().releaseSubscription(key),
		};
	}

	return {
		data: entry?.data as TData | undefined,
		status: entry?.status ?? "idle",
		error: entry?.error,
		isStale: entry?.isStale ?? false,
		lastMessageAt: entry?.lastMessageAt,
		unsubscribe: async () => store.getState().releaseSubscription(key),
	};
}
