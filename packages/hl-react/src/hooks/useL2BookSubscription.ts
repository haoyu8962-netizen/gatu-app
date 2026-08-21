import type { ISubscription, ISubscriptionTransport } from "@nktkas/hyperliquid";
import { MissingTransportError } from "../errors";
import { getNetworkState, subscribeNetworkStatus } from "../internal/websocket/network-status";
import { serializeKey, subscriptionKeys } from "../query/keys";
import {
	buildL2SubscriptionPayload,
	canUseL2Decompression,
	createL2BookProcessor,
	type L2BookSnapshot,
	L2BookStreamError,
	type L2SubscriptionParameters,
	type L2SubscriptionPayload,
} from "../subscriptions/l2";
import {
	acquireL2SubscriptionGate,
	resetL2SubscriptionGateAfterDisconnect,
} from "../subscriptions/l2-subscription-gate";
import { useConfig } from "../transport-provider";
import type { SubscribeFailureOptions, SubscriptionOptions, SubscriptionResult } from "../types";
import { useSub } from "./utils/useSub";

const L2_FIRST_SNAPSHOT_TIMEOUT_MS = 5_000;

export type L2BookSubscriptionOptions = Omit<SubscriptionOptions, "throttleMs">;

interface SubscribeL2BookParameters {
	transport: ISubscriptionTransport;
	payload: L2SubscriptionPayload;
	listener: (snapshot: L2BookSnapshot) => void;
	failureOptions: SubscribeFailureOptions | undefined;
	subscribeDisconnect: ((listener: () => void) => () => void) | undefined;
	triggerReconnect: (() => void) | undefined;
}

async function subscribeL2Book({
	transport,
	payload,
	listener,
	failureOptions,
	subscribeDisconnect,
	triggerReconnect,
}: SubscribeL2BookParameters): Promise<ISubscription> {
	if (payload.c.length === 0) throw new L2BookStreamError("invalid_frame");
	if (!canUseL2Decompression()) throw new L2BookStreamError("unsupported_decompression");

	const gate = await acquireL2SubscriptionGate(transport, payload);
	const confirmationController = new AbortController();
	let rawSubscription: ISubscription | undefined;
	let detachDisconnect: (() => void) | undefined;
	let detachNetworkStatus: (() => void) | undefined;
	let snapshotTimeout: ReturnType<typeof setTimeout> | undefined;
	let firstSnapshotReceived = false;
	let fatalError: L2BookStreamError | undefined;
	let awaitingConfirmation = true;
	let disposed = false;

	const clearSnapshotTimeout = () => {
		if (!snapshotTimeout) return;
		clearTimeout(snapshotTimeout);
		snapshotTimeout = undefined;
	};
	const detachDisconnectListener = () => {
		detachDisconnect?.();
		detachDisconnect = undefined;
	};
	const detachNetworkStatusListener = () => {
		detachNetworkStatus?.();
		detachNetworkStatus = undefined;
	};

	const closeRawSubscription = (): Promise<void> => {
		if (disposed) return Promise.resolve();
		disposed = true;
		clearSnapshotTimeout();
		detachNetworkStatusListener();
		processor.dispose();
		const raw = rawSubscription;
		rawSubscription = undefined;
		const closePromise = gate.release(() => raw?.unsubscribe() ?? Promise.resolve());
		void closePromise.then(detachDisconnectListener, () => {
			try {
				triggerReconnect?.();
			} catch {}
			// A failed unsubscribe leaves the per-coin gate poisoned until the
			// transport actually disconnects. Keep this listener alive so that
			// reconnect can clear the gate without permitting cross-talk early.
			if (!subscribeDisconnect) detachDisconnectListener();
		});
		return closePromise;
	};

	const reportFatalError = (error: L2BookStreamError) => {
		if (disposed || fatalError) return;
		fatalError = error;
		processor.dispose();
		clearSnapshotTimeout();
		if (!rawSubscription) {
			if (awaitingConfirmation) confirmationController.abort(error);
			return;
		}
		void closeRawSubscription();
		failureOptions?.onError?.(error);
	};

	const processor = createL2BookProcessor({
		coin: payload.c,
		onSnapshot: (snapshot) => {
			firstSnapshotReceived = true;
			if (!awaitingConfirmation) armSnapshotTimeout();
			listener(snapshot);
		},
		onFatalError: reportFatalError,
	});
	const armSnapshotTimeout = () => {
		clearSnapshotTimeout();
		if (getNetworkState() === "offline") return;
		snapshotTimeout = setTimeout(() => {
			if (getNetworkState() === "offline") {
				clearSnapshotTimeout();
				return;
			}
			const error = new L2BookStreamError("snapshot_timeout");
			if (awaitingConfirmation) {
				reportFatalError(error);
				confirmationController.abort(error);
				return;
			}
			reportFatalError(error);
		}, L2_FIRST_SNAPSHOT_TIMEOUT_MS);
	};
	detachNetworkStatus = subscribeNetworkStatus((state) => {
		if (disposed) return;
		if (state === "offline") {
			clearSnapshotTimeout();
			return;
		}
		armSnapshotTimeout();
	});

	detachDisconnect = subscribeDisconnect?.(() => {
		processor.reset();
		firstSnapshotReceived = false;
		clearSnapshotTimeout();
		resetL2SubscriptionGateAfterDisconnect(transport, payload.c);
		if (disposed) {
			detachDisconnectListener();
			return;
		}
		armSnapshotTimeout();
	});
	armSnapshotTimeout();

	try {
		rawSubscription = await transport.subscribe(
			payload.type,
			payload,
			(event: CustomEvent<unknown>) => processor.handle(event.detail),
			{
				signal: confirmationController.signal,
				onError: (error) => {
					const subscriptionError =
						error instanceof L2BookStreamError ? error : new L2BookStreamError("subscribe_failed", { cause: error });
					processor.dispose();
					clearSnapshotTimeout();
					disposed = true;
					detachNetworkStatusListener();
					detachDisconnect?.();
					detachDisconnect = undefined;
					void gate.release(() => Promise.resolve());
					failureOptions?.onError?.(subscriptionError);
				},
			},
		);
		awaitingConfirmation = false;
	} catch (error) {
		processor.dispose();
		clearSnapshotTimeout();
		disposed = true;
		detachDisconnectListener();
		detachNetworkStatusListener();
		await gate.release(() => Promise.resolve());
		if (confirmationController.signal.aborted && confirmationController.signal.reason instanceof L2BookStreamError) {
			throw confirmationController.signal.reason;
		}
		if (error instanceof L2BookStreamError) throw error;
		throw new L2BookStreamError("subscribe_failed", { cause: error });
	}

	if (fatalError) {
		const error = fatalError;
		await closeRawSubscription().catch(() => {});
		throw error;
	}

	if (firstSnapshotReceived) armSnapshotTimeout();

	return { unsubscribe: closeRawSubscription };
}

export function useL2BookSubscription(
	params: L2SubscriptionParameters,
	options: L2BookSubscriptionOptions = {},
): SubscriptionResult<L2BookSnapshot> {
	const { wsTransport, subscribeDisconnect, triggerReconnect } = useConfig();
	const payload: L2SubscriptionPayload =
		params.coin.length === 0 ? { type: "l2", c: "" } : buildL2SubscriptionPayload(params);
	const { refreshKey, ...subscriptionOptions } = options;
	const baseKey = subscriptionKeys.method(payload.type, payload);
	const key =
		refreshKey == null ? serializeKey(baseKey) : serializeKey([...baseKey, { refreshKey }] as readonly unknown[]);

	return useSub(
		key,
		(listener, failureOptions) => {
			if (!wsTransport || typeof wsTransport.subscribe !== "function") {
				return Promise.reject(new MissingTransportError("Subscription transport is not configured"));
			}
			return subscribeL2Book({
				transport: wsTransport,
				payload,
				listener,
				failureOptions,
				subscribeDisconnect,
				triggerReconnect,
			});
		},
		subscriptionOptions,
	);
}
