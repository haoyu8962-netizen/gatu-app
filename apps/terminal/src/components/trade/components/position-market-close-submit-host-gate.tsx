import { useEffect, useSyncExternalStore } from "react";
import { abandonWaitingPositionMarketCloseAttempts } from "@/lib/trade/position-market-close-submitter";
import { usePositionMarketCloseSession } from "@/stores/use-global-modal-store";
import {
	getLoadedPositionMarketCloseSubmitHost,
	getUnloadedPositionMarketCloseSubmitHost,
	subscribeToPositionMarketCloseSubmitHost,
	warmPositionMarketCloseSubmitHost,
} from "./position-market-close-submit-host-loader";

export function PositionMarketCloseSubmitHostGate() {
	const SubmitHost = useSyncExternalStore(
		subscribeToPositionMarketCloseSubmitHost,
		getLoadedPositionMarketCloseSubmitHost,
		getUnloadedPositionMarketCloseSubmitHost,
	);
	const hasSession = usePositionMarketCloseSession() !== null;

	useEffect(() => {
		if (hasSession) warmPositionMarketCloseSubmitHost();
	}, [hasSession]);

	useEffect(() => () => abandonWaitingPositionMarketCloseAttempts(), []);

	return SubmitHost ? <SubmitHost /> : null;
}
