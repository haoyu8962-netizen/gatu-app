import { useEffect, useRef, useState } from "react";
import { useAgentStatus } from "../signing/use-agent-status";
import { useTradingAuthorization } from "../signing/use-trading-authorization";

type PendingAction = () => void | Promise<void>;

interface UseTradingGuardResult {
	isReady: boolean;
	isEnabling: boolean;
	needsTrading: boolean;
	enableTrading: () => void;
	guardAction: (action: PendingAction) => void;
	error: Error | null;
	clearError: () => void;
}

export function useTradingGuard(): UseTradingGuardResult {
	const { isReady, isLoading, signaturesRequired } = useAgentStatus();
	const { authorize, status: authorizationStatus, error: authorizationError } = useTradingAuthorization();
	const pendingActionRef = useRef<PendingAction | null>(null);
	const prevIsReadyRef = useRef(isReady);
	const [localError, setLocalError] = useState<Error | null>(null);

	const isEnabling =
		authorizationStatus === "approving_fee" ||
		authorizationStatus === "approving_agent" ||
		authorizationStatus === "verifying";
	const needsTrading = !isLoading && signaturesRequired > 0;

	useEffect(() => {
		const wasReady = prevIsReadyRef.current;

		if (!wasReady && isReady && pendingActionRef.current) {
			const action = pendingActionRef.current;
			pendingActionRef.current = null;
			Promise.resolve(action()).catch((err) => {
				setLocalError(err instanceof Error ? err : new Error(String(err)));
			});
		}

		if (wasReady && !isReady) {
			pendingActionRef.current = null;
		}

		prevIsReadyRef.current = isReady;
	}, [isReady]);

	function enableTrading() {
		if (isEnabling) return;
		setLocalError(null);
		authorize().catch((err) => {
			pendingActionRef.current = null;
			const error = err instanceof Error ? err : new Error(String(err));
			setLocalError(error);
		});
	}

	function guardAction(action: PendingAction) {
		setLocalError(null);
		if (isReady) {
			Promise.resolve(action()).catch((err) => {
				setLocalError(err instanceof Error ? err : new Error(String(err)));
			});
			return;
		}
		pendingActionRef.current = action;
		enableTrading();
	}

	function clearError() {
		setLocalError(null);
	}

	return {
		isReady,
		isEnabling,
		needsTrading,
		enableTrading,
		guardAction,
		error: localError ?? authorizationError,
		clearError,
	};
}
