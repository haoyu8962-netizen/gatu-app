import { getNetworkState, subscribeNetworkStatus } from "@sairn/hl-react/internal/websocket/network-status";
import { getVisibilityState, subscribeVisibility } from "@sairn/hl-react/internal/websocket/visibility";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ORDERBOOK_L2_FEATURES } from "@/config/orderbook-l2";
import { reportClientError } from "@/lib/error-reporting/client";
import {
	canUseL2Decompression,
	type L2BookSnapshot,
	L2BookStreamError,
	type L2BookStreamErrorCode,
	type L2SubscriptionParameters,
	type SubEvent,
	type SubParams,
	type SubscriptionResult,
	useL2BookSubscription,
	useSubscription,
} from "@/lib/hyperliquid";
import { getPriceGroupingKey } from "@/lib/trade/orderbook";

const DISABLED_L2_PARAMS: L2SubscriptionParameters = { coin: "__disabled__" };
const DISABLED_L2_BOOK_PARAMS: SubParams<"l2Book"> = { coin: "" };
const MAX_LATCHED_L2_FAILURES = 32;
const L2_DECOMPRESSION_SUPPORTED = canUseL2Decompression();

export const L2_RETRY_INITIAL_WAIT_MS = 60_000;
export const L2_RETRY_MAX_WAIT_MS = 600_000;
// The primary must deliver for this long before a fallback is forgotten and the wait starts over.
export const L2_RECOVERY_OBSERVATION_MS = 600_000;

export type OrderbookFeedSource = "l2" | "l2Book-fast" | "l2Book-full";
export type OrderbookFeedSnapshot = L2BookSnapshot | SubEvent<"l2Book">;

interface UseOrderbookFeedParameters {
	compact: boolean;
	enabled: boolean;
	env: string;
	params: SubParams<"l2Book"> | null;
}

export interface OrderbookFeedResult extends Omit<SubscriptionResult<OrderbookFeedSnapshot>, "unsubscribe"> {
	source: OrderbookFeedSource;
}

type L2FallbackPhase = "waiting" | "probing" | "observing";

interface L2FallbackRecord {
	failures: number;
	phase: L2FallbackPhase;
}

interface L2PhaseRemaining {
	phase: L2FallbackPhase;
	remainingMs: number;
}

type L2FallbackRecords = ReadonlyMap<string, L2FallbackRecord>;

export function useOrderbookFeed({ compact, enabled, env, params }: UseOrderbookFeedParameters): OrderbookFeedResult {
	const l2Params = params ? toL2SubscriptionParameters(params) : DISABLED_L2_PARAMS;
	const l2Identity = params ? `${env}:${params.coin}:${getPriceGroupingKey(params)}` : `${env}:disabled`;
	const [fallbacks, setFallbacks] = useState<L2FallbackRecords>(() => new Map());
	const phaseRemainingRef = useRef(new Map<string, L2PhaseRemaining>());
	const reportedL2IdentitiesRef = useRef(new Set<string>());
	const pageActive = useSyncExternalStore(subscribePageActivity, isPageActive, isPageActiveOnServer);
	const fallback = fallbacks.get(l2Identity);
	const phase = fallback?.phase;
	const l2Supported = compact && ORDERBOOK_L2_FEATURES.incrementalFeedEnabled && L2_DECOMPRESSION_SUPPORTED;
	const l2Probing = phase === "probing" && pageActive;
	const l2Candidate = l2Supported && (phase === undefined || phase === "observing" || l2Probing);

	const l2Result = useL2BookSubscription(l2Params, {
		enabled: enabled && l2Candidate,
	});
	const currentL2Failure = enabled && l2Candidate && l2Result.status === "error";
	const l2SnapshotReady = l2Result.status === "active" && l2Result.data !== undefined && !l2Result.isStale;
	const l2Recovered = enabled && l2Probing && l2SnapshotReady;
	const usePublicFeed = !l2Candidate || currentL2Failure || (phase === "probing" && !l2Recovered);
	const publicResult = useSubscription("l2Book", params ?? DISABLED_L2_BOOK_PARAMS, {
		enabled: enabled && usePublicFeed,
	});
	const timedPhase = getTimedPhase(phase, enabled && l2Supported && pageActive, l2SnapshotReady);
	const failureCount = fallback?.failures;

	useEffect(() => {
		if (!currentL2Failure) return;
		phaseRemainingRef.current.delete(l2Identity);
		setFallbacks((current) => recordL2Failure(current, l2Identity));
		reportL2FallbackOnce(
			reportedL2IdentitiesRef.current,
			l2Identity,
			l2Result.error,
			getL2FallbackReason(l2Result.error),
		);
	}, [currentL2Failure, l2Identity, l2Result.error]);

	useEffect(() => {
		if (timedPhase === undefined || failureCount === undefined) return;
		const remaining = phaseRemainingRef.current;
		const saved = remaining.get(l2Identity);
		const durationMs = saved?.phase === timedPhase ? saved.remainingMs : getL2PhaseDurationMs(timedPhase, failureCount);
		const startedAt = performance.now();
		let elapsed = false;
		const timer = setTimeout(() => {
			elapsed = true;
			remaining.delete(l2Identity);
			setFallbacks((current) => completeL2Phase(current, l2Identity, timedPhase));
		}, durationMs);
		return () => {
			clearTimeout(timer);
			if (elapsed) return;
			setBoundedRemaining(remaining, l2Identity, {
				phase: timedPhase,
				remainingMs: Math.max(0, durationMs - (performance.now() - startedAt)),
			});
		};
	}, [failureCount, l2Identity, timedPhase]);

	useEffect(() => {
		if (!l2Recovered) return;
		phaseRemainingRef.current.delete(l2Identity);
		setFallbacks((current) => startL2Observation(current, l2Identity));
	}, [l2Identity, l2Recovered]);

	useEffect(() => {
		if (!enabled || !compact || !ORDERBOOK_L2_FEATURES.incrementalFeedEnabled || L2_DECOMPRESSION_SUPPORTED) {
			return;
		}
		const error = new L2BookStreamError("unsupported_decompression");
		reportL2FallbackOnce(reportedL2IdentitiesRef.current, l2Identity, error, "unsupported_decompression");
	}, [compact, enabled, l2Identity]);

	const source: OrderbookFeedSource = compact ? (usePublicFeed ? "l2Book-fast" : "l2") : "l2Book-full";
	const result = usePublicFeed ? publicResult : l2Result;

	return {
		source,
		data: result.data,
		status: result.status,
		error: result.error,
		isStale: result.isStale,
		lastMessageAt: result.lastMessageAt,
		monotonicLastMessageAt: result.monotonicLastMessageAt,
	};
}

export function getL2RetryWaitMs(failures: number): number {
	return Math.min(L2_RETRY_INITIAL_WAIT_MS * 2 ** Math.max(0, failures - 1), L2_RETRY_MAX_WAIT_MS);
}

function subscribePageActivity(listener: () => void): () => void {
	const stopVisibility = subscribeVisibility(listener);
	const stopNetwork = subscribeNetworkStatus(listener);
	return () => {
		stopVisibility();
		stopNetwork();
	};
}

function isPageActive(): boolean {
	return getVisibilityState() === "visible" && getNetworkState() === "online";
}

function isPageActiveOnServer(): boolean {
	return true;
}

function toL2SubscriptionParameters(params: SubParams<"l2Book">): L2SubscriptionParameters {
	if (params.nSigFigs == null) return { coin: params.coin };
	if (params.nSigFigs !== 5) return { coin: params.coin, nSigFigs: params.nSigFigs };
	return {
		coin: params.coin,
		nSigFigs: 5,
		...(params.mantissa == null ? {} : { mantissa: params.mantissa }),
	};
}

function getTimedPhase(
	phase: L2FallbackPhase | undefined,
	clockRunning: boolean,
	l2SnapshotReady: boolean,
): "waiting" | "observing" | undefined {
	if (!clockRunning) return undefined;
	if (phase === "waiting") return "waiting";
	if (phase === "observing" && l2SnapshotReady) return "observing";
	return undefined;
}

function getL2PhaseDurationMs(phase: "waiting" | "observing", failures: number): number {
	return phase === "waiting" ? getL2RetryWaitMs(failures) : L2_RECOVERY_OBSERVATION_MS;
}

// A failure counts once per attempt; a failure while observing continues the attempt that recovered.
function recordL2Failure(current: L2FallbackRecords, identity: string): L2FallbackRecords {
	const record = current.get(identity);
	if (record?.phase === "waiting") return current;
	const next = new Map(current);
	next.delete(identity);
	next.set(identity, { failures: (record?.failures ?? 0) + 1, phase: "waiting" });
	if (next.size > MAX_LATCHED_L2_FAILURES) {
		const oldest = next.keys().next().value;
		if (oldest !== undefined) next.delete(oldest);
	}
	return next;
}

function startL2Observation(current: L2FallbackRecords, identity: string): L2FallbackRecords {
	const record = current.get(identity);
	if (record?.phase !== "probing") return current;
	const next = new Map(current);
	next.set(identity, { ...record, phase: "observing" });
	return next;
}

function completeL2Phase(
	current: L2FallbackRecords,
	identity: string,
	phase: "waiting" | "observing",
): L2FallbackRecords {
	const record = current.get(identity);
	if (record?.phase !== phase) return current;
	const next = new Map(current);
	if (phase === "observing") next.delete(identity);
	else next.set(identity, { ...record, phase: "probing" });
	return next;
}

function setBoundedRemaining(remaining: Map<string, L2PhaseRemaining>, identity: string, value: L2PhaseRemaining) {
	remaining.delete(identity);
	remaining.set(identity, value);
	if (remaining.size > MAX_LATCHED_L2_FAILURES) {
		const oldest = remaining.keys().next().value;
		if (oldest !== undefined) remaining.delete(oldest);
	}
}

function getL2FallbackReason(error: unknown): L2BookStreamErrorCode {
	return error instanceof L2BookStreamError ? error.code : "subscribe_failed";
}

function reportL2FallbackOnce(
	reportedIdentities: Set<string>,
	identity: string,
	error: unknown,
	fallbackReason: L2BookStreamErrorCode,
) {
	if (reportedIdentities.has(identity)) return;
	reportedIdentities.add(identity);
	reportClientError(error, { kind: "orderbook_l2_fallback", fallbackReason });
}
