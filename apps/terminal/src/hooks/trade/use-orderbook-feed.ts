import { useEffect, useRef, useState } from "react";
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

export function useOrderbookFeed({ compact, enabled, env, params }: UseOrderbookFeedParameters): OrderbookFeedResult {
	const l2Params = params ? toL2SubscriptionParameters(params) : DISABLED_L2_PARAMS;
	const l2Identity = params ? `${env}:${params.coin}:${getPriceGroupingKey(params)}` : `${env}:disabled`;
	const [failedL2Identities, setFailedL2Identities] = useState<ReadonlySet<string>>(() => new Set());
	const reportedL2IdentitiesRef = useRef(new Set<string>());
	const l2FailureLatched = failedL2Identities.has(l2Identity);
	const l2Candidate =
		compact && ORDERBOOK_L2_FEATURES.incrementalFeedEnabled && L2_DECOMPRESSION_SUPPORTED && !l2FailureLatched;

	const l2Result = useL2BookSubscription(l2Params, {
		enabled: enabled && l2Candidate,
	});
	const currentL2Failure = enabled && l2Candidate && l2Result.status === "error";
	const usePublicFeed = !l2Candidate || currentL2Failure;
	const publicResult = useSubscription("l2Book", params ?? DISABLED_L2_BOOK_PARAMS, {
		enabled: enabled && usePublicFeed,
	});

	useEffect(() => {
		if (!currentL2Failure) return;
		setFailedL2Identities((current) => addBoundedIdentity(current, l2Identity));
		reportL2FallbackOnce(
			reportedL2IdentitiesRef.current,
			l2Identity,
			l2Result.error,
			getL2FallbackReason(l2Result.error),
		);
	}, [currentL2Failure, l2Identity, l2Result.error]);

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

function toL2SubscriptionParameters(params: SubParams<"l2Book">): L2SubscriptionParameters {
	if (params.nSigFigs == null) return { coin: params.coin };
	if (params.nSigFigs !== 5) return { coin: params.coin, nSigFigs: params.nSigFigs };
	return {
		coin: params.coin,
		nSigFigs: 5,
		...(params.mantissa == null ? {} : { mantissa: params.mantissa }),
	};
}

function addBoundedIdentity(current: ReadonlySet<string>, identity: string): ReadonlySet<string> {
	if (current.has(identity)) return current;
	const next = new Set(current);
	next.add(identity);
	if (next.size > MAX_LATCHED_L2_FAILURES) {
		const oldest = next.values().next().value;
		if (oldest !== undefined) next.delete(oldest);
	}
	return next;
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
