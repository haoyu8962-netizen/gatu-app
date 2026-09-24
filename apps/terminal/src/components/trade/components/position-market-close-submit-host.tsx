import { useEffect, useLayoutEffect, useRef } from "react";
import { usePositionMarketCloseSubmit } from "@/hooks/trade/use-position-market-close-submit";
import {
	type PositionMarketCloseAttempt,
	registerPositionMarketCloseSubmitter,
} from "@/lib/trade/position-market-close-submitter";
import { discardPositionMarketCloseModal, getPositionMarketCloseModal } from "@/stores/use-global-modal-store";

export function PositionMarketCloseSubmitHost() {
	const { execute } = usePositionMarketCloseSubmit();
	const executeRef = useRef(execute);
	const runningAttemptsRef = useRef(new Set<PositionMarketCloseAttempt>());

	useLayoutEffect(() => {
		executeRef.current = execute;
	});

	useEffect(() => {
		const runningAttempts = runningAttemptsRef.current;
		const unregister = registerPositionMarketCloseSubmitter((attempt) => {
			runningAttempts.add(attempt);
			return executeRef.current(attempt).finally(() => runningAttempts.delete(attempt));
		});
		return () => {
			unregister();
			const session = getPositionMarketCloseModal();
			if (!session) return;
			const isRunningHere = [...runningAttempts].some((attempt) => attempt.sessionId === session.sessionId);
			if (session.phase === "reconciling" || (session.phase !== "idle" && isRunningHere)) {
				discardPositionMarketCloseModal();
			}
		};
	}, []);

	return null;
}
