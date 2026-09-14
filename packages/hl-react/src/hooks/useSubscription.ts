import type { ISubscription } from "@nktkas/hyperliquid";
import { useRef } from "react";
import { RingBuffer } from "../internal/circular-buffer/ring-buffer";
import { serializeKey, subscriptionKeys } from "../query/keys";
import {
	createSubscriptionEventAccumulator,
	getAccumulateConfig,
	getDefaultThrottle,
	shouldAcceptSubscriptionEvent,
} from "../registries/subscription";
import type { CompactSubscriptionClient } from "../subscriptions/compact-subscription-client";
import { useConfig, useHyperliquidTransport } from "../transport-provider";
import type { SubscribeFailureOptions, SubscriptionOptions, SubscriptionResult } from "../types";
import type { SubEvent, SubMethod, SubParams } from "../types/clients";
import { useSub } from "./utils/useSub";

export function useSubscription<M extends SubMethod>(
	method: M,
	params: SubParams<M>,
	options: SubscriptionOptions = {},
): SubscriptionResult<SubEvent<M>> {
	const { subscription } = useHyperliquidTransport();
	const { subscribeDisconnect } = useConfig();
	const { refreshKey, ...subscriptionOptions } = options;
	const baseKey = subscriptionKeys.method(method, params);
	const key =
		refreshKey == null ? serializeKey(baseKey) : serializeKey([...baseKey, { refreshKey }] as readonly unknown[]);

	const defaultThrottle = getDefaultThrottle(method);
	const mergedOptions = defaultThrottle ? { throttleMs: defaultThrottle, ...subscriptionOptions } : subscriptionOptions;

	const accConfig = getAccumulateConfig(method);
	const bufferRef = useRef<RingBuffer<unknown> | null>(null);
	const bufferKeyRef = useRef<string | null>(null);
	if (accConfig && (!bufferRef.current || bufferKeyRef.current !== key)) {
		bufferRef.current = new RingBuffer(accConfig.buffer);
		bufferKeyRef.current = key;
	} else if (!accConfig && bufferRef.current) {
		bufferRef.current = null;
		bufferKeyRef.current = null;
	}

	return useSub(
		key,
		(listener: (data: SubEvent<M>) => void, failureOptions?: SubscribeFailureOptions) => {
			const fn = (subscription as CompactSubscriptionClient)[method] as (...args: unknown[]) => Promise<ISubscription>;
			const acceptEvent = (event: SubEvent<M>) => shouldAcceptSubscriptionEvent(method, params, event);
			const eventAccumulator = createSubscriptionEventAccumulator(method);

			if (accConfig) {
				const wrappedListener = (event: SubEvent<M>) => {
					if (!acceptEvent(event)) return;
					const buffer = bufferRef.current;
					if (!buffer) return;
					if (accConfig.isSnapshot(event)) {
						buffer.clear();
					}
					buffer.add(accConfig.getItems(event));
					listener(accConfig.withItems(event, buffer.getItems()) as SubEvent<M>);
				};
				return params !== undefined
					? fn.call(subscription, params, wrappedListener, failureOptions)
					: fn.call(subscription, wrappedListener, failureOptions);
			}

			const filteredListener = (event: SubEvent<M>) => {
				if (!acceptEvent(event)) return;
				listener(eventAccumulator?.add(event) ?? event);
			};
			if (!eventAccumulator) {
				return params !== undefined
					? fn.call(subscription, params, filteredListener, failureOptions)
					: fn.call(subscription, filteredListener, failureOptions);
			}
			let detachDisconnect: (() => void) | undefined;
			const detachAccumulatorReset = () => {
				detachDisconnect?.();
				detachDisconnect = undefined;
			};
			detachDisconnect = subscribeDisconnect?.(() => eventAccumulator.reset());
			const guardedFailureOptions = {
				...failureOptions,
				onError: (error: unknown) => {
					detachAccumulatorReset();
					failureOptions?.onError?.(error);
				},
			};

			let promise: Promise<ISubscription>;
			try {
				promise =
					params !== undefined
						? fn.call(subscription, params, filteredListener, guardedFailureOptions)
						: fn.call(subscription, filteredListener, guardedFailureOptions);
			} catch (error) {
				detachAccumulatorReset();
				throw error;
			}
			return promise.then(
				(activeSubscription) => ({
					unsubscribe: async () => {
						detachAccumulatorReset();
						await activeSubscription.unsubscribe();
					},
				}),
				(error) => {
					detachAccumulatorReset();
					throw error;
				},
			);
		},
		mergedOptions,
	);
}
