import { useEffect, useLayoutEffect, useRef } from "react";
import { usePositionMarketCloseSubmit } from "@/hooks/trade/use-position-market-close-submit";
import { registerPositionMarketCloseSubmitter } from "@/lib/trade/position-market-close-submitter";
import { discardPositionMarketCloseModal, getPositionMarketCloseModal } from "@/stores/use-global-modal-store";

export function PositionMarketCloseSubmitHost() {
	const { submit } = usePositionMarketCloseSubmit();
	const submitRef = useRef(submit);
	const runningSessionIdsRef = useRef(new Set<string>());

	useLayoutEffect(() => {
		submitRef.current = submit;
	});

	useEffect(() => {
		const runningSessionIds = runningSessionIdsRef.current;
		const unregister = registerPositionMarketCloseSubmitter((input) => {
			runningSessionIds.add(input.sessionId);
			return submitRef.current(input).finally(() => runningSessionIds.delete(input.sessionId));
		});
		return () => {
			unregister();
			const session = getPositionMarketCloseModal();
			if (
				session?.phase === "reconciling" ||
				(session && session.phase !== "idle" && runningSessionIds.has(session.sessionId))
			) {
				discardPositionMarketCloseModal();
			}
		};
	}, []);

	return null;
}
