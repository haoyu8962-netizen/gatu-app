import type { ISubscription, SubscriptionClient } from "@nktkas/hyperliquid";
import { useRef } from "react";
import { RingBuffer } from "../internal/circular-buffer/ring-buffer";
import { serializeKey, subscriptionKeys } from "../query/keys";
import {
	createSubscriptionEventAccumulator,
	getAccumulateConfig,
	getDefaultThrottle,
	shouldAcceptSubscriptionEvent,
} from "../registries/subscription";
import { useHyperliquidTransport } from "../transport-provider";
import type { SubscribeFailureOptions, SubscriptionOptions, SubscriptionResult } from "../types";
import type { SubEvent, SubMethod, SubParams } from "../types/clients";
import { useSub } from "./utils/useSub";

export function useSubscription<M extends SubMethod>(
	method: M,
	params: SubParams<M>,
	options: SubscriptionOptions = {},
): SubscriptionResult<SubEvent<M>> {
	const { subscription } = useHyperliquidTransport();
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
			const fn = (subscription as SubscriptionClient)[method] as (...args: unknown[]) => Promise<ISubscription>;
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
			return params !== undefined
				? fn.call(subscription, params, filteredListener, failureOptions)
				: fn.call(subscription, filteredListener, failureOptions);
		},
		mergedOptions,
	);
}
