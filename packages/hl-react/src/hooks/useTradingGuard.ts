import { useLayoutEffect, useRef, useState } from "react";
import { hasExchangeActionDeadlinePassed, startExchangeActionDeadline } from "../internal/exchange/request-scheduler";
import { useHyperliquid } from "../provider";
import { useHyperliquidOwnerSigner } from "../signing/owner-signer-provider";
import { useTradingAuthorization } from "../signing/use-trading-authorization";
import { useTradingStatus } from "../signing/use-trading-status";

type PendingAction = () => void | Promise<void>;

interface UseTradingGuardResult {
	isReady: boolean;
	isEnabling: boolean;
	needsTrading: boolean;
	/**
	 * An Agent-only session cannot sign the approvals it is missing (Agent approval and builder fee
	 * are user-signed by the master wallet), so the action stays unavailable instead of offering Enable.
	 */
	needsOwnerApproval: boolean;
	enableTrading: () => void;
	guardAction: (action: PendingAction) => void;
	error: Error | null;
	clearError: () => void;
}

interface UseTradingGuardOptions {
	requiresBuilderFee?: boolean;
}

export function useTradingGuard(options: UseTradingGuardOptions = {}): UseTradingGuardResult {
	const requiresBuilderFee = options.requiresBuilderFee !== false;
	const agentStatus = useTradingStatus();
	const { clientKey, env, sessionMode } = useHyperliquid();
	const ownerSigner = useHyperliquidOwnerSigner();
	const isReady = agentStatus.isSignerReady && (!requiresBuilderFee || agentStatus.isBuilderFeeReady);
	const isLoading = agentStatus.isSignerLoading || (requiresBuilderFee && agentStatus.isBuilderFeeLoading);
	const signaturesRequired = Number(agentStatus.needsAgent) + Number(requiresBuilderFee && agentStatus.needsBuilderFee);
	const {
		authorize,
		status: authorizationStatus,
		error: authorizationError,
	} = useTradingAuthorization({
		requiresBuilderFee,
	});
	const identityRef = useRef({ clientKey, env, sessionMode, ownerSigner, requiresBuilderFee });
	const previous = identityRef.current;
	if (
		previous.clientKey !== clientKey ||
		previous.env !== env ||
		previous.sessionMode !== sessionMode ||
		previous.ownerSigner !== ownerSigner ||
		previous.requiresBuilderFee !== requiresBuilderFee
	) {
		identityRef.current = { clientKey, env, sessionMode, ownerSigner, requiresBuilderFee };
	}
	const mounted = useRef(true);
	const inFlight = useRef<symbol | null>(null);
	const [localError, setLocalError] = useState<Error | null>(null);

	const isEnabling =
		authorizationStatus === "approving_fee" ||
		authorizationStatus === "approving_agent" ||
		authorizationStatus === "verifying";
	const needsOwnerApproval = sessionMode === "agent-only" && !isLoading && signaturesRequired > 0;
	const needsTrading = !isLoading && signaturesRequired > 0 && !needsOwnerApproval;

	useLayoutEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
			inFlight.current = null;
		};
	}, []);

	function runExplicitAction(action?: PendingAction, requireAuthorization = true) {
		if (isEnabling || inFlight.current) return;
		if (requireAuthorization && identityRef.current.sessionMode === "agent-only") return;
		const identity = identityRef.current;
		const attempt = Symbol("explicit-trading-action");
		const deadline = startExchangeActionDeadline();
		inFlight.current = attempt;
		setLocalError(null);
		const isCurrent = () => mounted.current && inFlight.current === attempt && identityRef.current === identity;
		void (async () => {
			try {
				identity.ownerSigner?.assertCurrent();
				if (requireAuthorization) {
					await authorize();
					// ADR 0053: an approval that finished after the limit hands the action back to a new click.
					if (hasExchangeActionDeadlinePassed(deadline)) return;
				}
				if (!isCurrent()) return;
				identity.ownerSigner?.assertCurrent();
				await action?.();
			} catch (error) {
				if (isCurrent()) setLocalError(error instanceof Error ? error : new Error(String(error)));
			} finally {
				if (inFlight.current === attempt) inFlight.current = null;
			}
		})();
	}

	function enableTrading() {
		runExplicitAction();
	}

	function guardAction(action: PendingAction) {
		runExplicitAction(action, !isReady);
	}

	function clearError() {
		setLocalError(null);
	}

	return {
		isReady,
		isEnabling,
		needsTrading,
		needsOwnerApproval,
		enableTrading,
		guardAction,
		error: localError ?? authorizationError,
		clearError,
	};
}
