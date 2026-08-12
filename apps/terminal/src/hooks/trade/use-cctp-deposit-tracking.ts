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
	sourceHash,
}: {
	enabled: boolean;
	env: CctpDepositEnvironment;
	owner: string | undefined;
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
		queryKey: ["circle", "cctp", "deposit-status", env, trackedSourceHash, recoveryRecord?.amount],
		queryFn: async ({ signal }) => {
			if (recoveryRecord) {
				const sourceReceipt = await fetchArbitrumCctpSourceReceiptStatus({
					amount: recoveryRecord.amount,
					env,
					owner: recoveryRecord.owner,
					sourceHash: trackedSourceHash ?? "",
					signal,
				});
				if (sourceReceipt.status === "pending") return { status: "waiting" } as const;
			}
			return fetchCircleCctpDepositStatus({ env, sourceHash: trackedSourceHash ?? "", signal });
		},
		enabled: enabled && !!owner && !!activeTrackedSourceHash && !retainedDefinitiveFailure,
		refetchInterval: (state) =>
			state.state.data?.status === "forward-submitted" || isDefinitiveDepositSourceFailure(state.state.error)
				? false
				: CCTP_DEPOSIT_STATUS_POLL_MS,
		refetchIntervalInBackground: false,
		refetchOnWindowFocus: true,
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
