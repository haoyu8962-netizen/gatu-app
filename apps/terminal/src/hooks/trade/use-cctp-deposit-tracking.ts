import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import type { Hash } from "viem";
import { isDefinitiveDepositSourceFailure } from "@/lib/hyperliquid/deposit-source-error";
import {
	type CctpDepositEnvironment,
	fetchArbitrumCctpSourceReceiptStatus,
	fetchCircleCctpDepositStatus,
	getCctpDepositTrackingStorageSnapshot,
	readCctpDepositTrackingRecords,
	removeCctpDepositTrackingRecord,
	removeCctpSponsoredAuthorizationIntent,
	subscribeCctpDepositTrackingRecords,
} from "@/lib/trade/cctp-deposit-tracking";

const CCTP_DEPOSIT_STATUS_POLL_MS = 5_000;
const EMPTY_TRACKING_SNAPSHOT = "";

function getServerTrackingSnapshot() {
	return EMPTY_TRACKING_SNAPSHOT;
}

export function useCctpDepositTracking({
	enabled,
	env,
	owner,
	poll = true,
	removeOnForwardSubmitted = false,
	sourceHash,
}: {
	enabled: boolean;
	env: CctpDepositEnvironment;
	owner: string | undefined;
	poll?: boolean;
	removeOnForwardSubmitted?: boolean;
	sourceHash?: Hash;
}) {
	const subscribe = useCallback(
		(onStoreChange: () => void) => {
			if (!enabled || !owner) return () => undefined;
			try {
				return subscribeCctpDepositTrackingRecords(env, owner, onStoreChange);
			} catch {
				return () => undefined;
			}
		},
		[enabled, env, owner],
	);
	const getSnapshot = useCallback(() => {
		if (!enabled || !owner) return EMPTY_TRACKING_SNAPSHOT;
		try {
			return getCctpDepositTrackingStorageSnapshot(env, owner);
		} catch {
			return "unavailable";
		}
	}, [enabled, env, owner]);
	const trackingSnapshot = useSyncExternalStore(subscribe, getSnapshot, getServerTrackingSnapshot);
	const recoveryRecord = (() => {
		void trackingSnapshot;
		if (!enabled || !owner) return null;
		try {
			const records = readCctpDepositTrackingRecords(env, owner);
			return (sourceHash ? records.find((record) => record.sourceHash === sourceHash) : records[0]) ?? null;
		} catch {
			return null;
		}
	})();
	const activeTrackedSourceHash = sourceHash ?? recoveryRecord?.sourceHash;
	const trackingScope = `${env}:${owner?.toLowerCase() ?? ""}`;
	const definitiveFailureRef = useRef<{
		error: Error;
		scope: string;
		sourceHash: Hash;
	} | null>(null);
	useEffect(() => {
		const previousFailure = definitiveFailureRef.current;
		if (
			previousFailure &&
			(previousFailure.scope !== trackingScope ||
				(activeTrackedSourceHash && previousFailure.sourceHash !== activeTrackedSourceHash))
		) {
			definitiveFailureRef.current = null;
		}
	}, [activeTrackedSourceHash, trackingScope]);
	const retainedDefinitiveFailure =
		definitiveFailureRef.current?.scope === trackingScope &&
		(!activeTrackedSourceHash || definitiveFailureRef.current.sourceHash === activeTrackedSourceHash)
			? definitiveFailureRef.current
			: null;
	const trackedSourceHash = activeTrackedSourceHash ?? retainedDefinitiveFailure?.sourceHash;
	const query = useQuery({
		queryKey: [
			"circle",
			"cctp",
			"deposit-status",
			env,
			trackedSourceHash,
			recoveryRecord?.amount,
			recoveryRecord?.mode,
			recoveryRecord?.authNonce,
		],
		queryFn: async ({ signal }) => {
			if (!recoveryRecord) return { status: "waiting" } as const;
			const sourceReceipt = await fetchArbitrumCctpSourceReceiptStatus({
				amount: recoveryRecord.amount,
				env,
				owner: recoveryRecord.owner,
				sourceHash: trackedSourceHash ?? "",
				...(recoveryRecord.mode === "sponsored"
					? { mode: "sponsored" as const, authNonce: recoveryRecord.authNonce }
					: { mode: "direct" as const }),
				signal,
			});
			if (sourceReceipt.status === "pending") return { status: "waiting" } as const;
			if (recoveryRecord.mode === "sponsored") {
				try {
					removeCctpSponsoredAuthorizationIntent(env, recoveryRecord.owner, recoveryRecord.authNonce);
				} catch {
					// A consumed authorization may safely retain its expiring local tombstone.
				}
			}
			return fetchCircleCctpDepositStatus({
				amount: recoveryRecord.amount,
				env,
				mode: recoveryRecord.mode,
				owner: recoveryRecord.owner,
				sourceHash: trackedSourceHash ?? "",
				signal,
			});
		},
		enabled: enabled && poll && !!owner && !!activeTrackedSourceHash && !!recoveryRecord && !retainedDefinitiveFailure,
		refetchInterval: poll
			? (state) =>
					state.state.data?.status === "forward-submitted" || isDefinitiveDepositSourceFailure(state.state.error)
						? false
						: CCTP_DEPOSIT_STATUS_POLL_MS
			: false,
		refetchIntervalInBackground: false,
		refetchOnWindowFocus: poll,
		retry: (failureCount, error) => !isDefinitiveDepositSourceFailure(error) && failureCount < 2,
		staleTime: 0,
	});

	useEffect(() => {
		if (!owner || !trackedSourceHash || !isDefinitiveDepositSourceFailure(query.error)) return;
		definitiveFailureRef.current = {
			error: query.error,
			scope: trackingScope,
			sourceHash: trackedSourceHash,
		};
		if (recoveryRecord?.sourceHash !== trackedSourceHash) return;
		try {
			removeCctpDepositTrackingRecord(env, owner, trackedSourceHash);
		} catch {}
	}, [env, owner, query.error, recoveryRecord?.sourceHash, trackedSourceHash, trackingScope]);

	useEffect(() => {
		if (!removeOnForwardSubmitted || !owner || !trackedSourceHash || query.data?.status !== "forward-submitted") {
			return;
		}
		try {
			removeCctpDepositTrackingRecord(env, owner, trackedSourceHash);
		} catch {
			// Keep the recovery record when browser storage cannot be updated.
		}
	}, [env, owner, query.data?.status, removeOnForwardSubmitted, trackedSourceHash]);

	const definitiveFailure =
		(isDefinitiveDepositSourceFailure(query.error) ? query.error : null) ?? retainedDefinitiveFailure?.error ?? null;

	return {
		...query,
		error: definitiveFailure ?? query.error,
		isError: !!definitiveFailure || query.isError,
		recoveryRecord,
		trackedSourceHash,
	};
}
