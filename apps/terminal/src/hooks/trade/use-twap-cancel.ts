import { t } from "@lingui/core/macro";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { isAmbiguousOrderRequestError } from "@/domain/trade/order-tracking";
import { type ExchangeParams, useExchange, useHyperliquid, useMarkets } from "@/lib/hyperliquid";
import { runWithAvailableOrderAssetLocks } from "@/lib/trade/order-asset-lock";
import {
	getPendingTradingActionActions,
	getPendingTradingActionSnapshot,
	getPendingTradingActionToastId,
	usePendingTwapCancellations,
} from "@/stores/use-pending-trading-action-store";

export interface TwapCancelFeedback {
	tone: "error" | "warning";
	message: string;
}

interface StoredTwapCancelFeedback extends TwapCancelFeedback {
	actionId?: string;
	env: "Mainnet" | "Testnet";
	owner: string | null;
}

interface TwapCancelExecutionContext {
	actionId: string;
	guardPasses: number;
	env: "Mainnet" | "Testnet";
	owner: string;
	params: ExchangeParams<"twapCancel">;
}

export function useTwapCancel() {
	const markets = useMarkets();
	const { clientKey, env } = useHyperliquid();
	const liveIdentityRef = useRef({ clientKey, env });
	liveIdentityRef.current = { clientKey, env };
	const executionRef = useRef<TwapCancelExecutionContext | null>(null);

	function assertTwapCancelExecution(params: ExchangeParams<"twapCancel">) {
		const execution = executionRef.current;
		const liveIdentity = liveIdentityRef.current;
		const pending = execution
			? getPendingTradingActionSnapshot().twapCancellations.find((action) => action.id === execution.actionId)
			: undefined;
		if (
			!execution ||
			params.a !== execution.params.a ||
			params.t !== execution.params.t ||
			liveIdentity.clientKey === "disconnected" ||
			liveIdentity.clientKey.toLowerCase() !== execution.owner ||
			liveIdentity.env !== execution.env ||
			pending?.phase !== "submitting" ||
			pending.env !== execution.env ||
			pending.owner !== execution.owner ||
			pending.twapId !== execution.params.t ||
			pending.assetId !== execution.params.a
		) {
			throw new Error(t`The trading account or network changed. Review active TWAP orders before retrying.`);
		}
		execution.guardPasses += 1;
		if (execution.guardPasses >= 2) {
			getPendingTradingActionActions().markTwapCancellationRequestStarted(execution.actionId);
		}
	}

	const { mutateAsync: cancel, reset } = useExchange("twapCancel", {
		executionGuard: assertTwapCancelExecution,
	});
	const cancellations = usePendingTwapCancellations();
	const mountedRef = useRef(false);
	const [storedFeedback, setFeedback] = useState<StoredTwapCancelFeedback | null>(null);
	const normalizedOwner = clientKey === "disconnected" ? null : clientKey.toLowerCase();
	const activeCancellations = normalizedOwner
		? cancellations.filter((action) => action.env === env && action.owner === normalizedOwner)
		: [];
	const cancellingTwapId = activeCancellations[0]?.twapId ?? null;
	const storedFeedbackMatchesIdentity = storedFeedback?.env === env && storedFeedback.owner === normalizedOwner;
	const storedFeedbackActionActive =
		!storedFeedback?.actionId || activeCancellations.some((action) => action.id === storedFeedback.actionId);
	const feedback =
		storedFeedback && storedFeedbackMatchesIdentity && storedFeedbackActionActive
			? { tone: storedFeedback.tone, message: storedFeedback.message }
			: null;

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
		};
	}, []);

	async function cancelTwap(coin: string, twapId: number): Promise<void> {
		if (activeCancellations.some((action) => action.twapId === twapId)) return;

		const assetId = markets.getAssetId(coin);
		if (typeof assetId !== "number") {
			const message = t`Unable to identify this TWAP market. Refresh market data before retrying.`;
			setFeedback({ tone: "error", message, env, owner: normalizedOwner });
			toast.error(message);
			return;
		}

		if (clientKey === "disconnected") {
			const message = t`Safe order coordination across tabs is unavailable in this browser.`;
			setFeedback({ tone: "error", message, env, owner: null });
			toast.error(message);
			return;
		}

		const action = getPendingTradingActionActions().claimTwapCancellation({
			env,
			owner: clientKey,
			twapId,
			assetId,
		});
		if (!action) return;
		const execution: TwapCancelExecutionContext = {
			actionId: action.id,
			guardPasses: 0,
			env: action.env,
			owner: action.owner,
			params: { a: assetId, t: twapId },
		};
		executionRef.current = execution;
		reset();
		setFeedback(null);
		try {
			const lockResult = await runWithAvailableOrderAssetLocks(
				{ env, owner: clientKey, assetIds: [assetId] },
				async () => {
					await cancel(execution.params);
				},
			);
			if (!lockResult.supported || !lockResult.acquired) {
				getPendingTradingActionActions().resolveTwapCancellation(action.id);
				const message = t`Safe order coordination across tabs is unavailable in this browser.`;
				if (mountedRef.current && isTwapExecutionIdentityCurrent(execution, liveIdentityRef.current)) {
					setFeedback({ tone: "error", message, env: execution.env, owner: execution.owner });
					toast.error(message);
				}
				return;
			}
			getPendingTradingActionActions().markTwapCancellationAwaiting(action.id);
		} catch (error) {
			if (execution.guardPasses >= 2 && isAmbiguousOrderRequestError(error)) {
				getPendingTradingActionActions().markTwapCancellationUnconfirmed(action.id);
				const message = t`TWAP cancellation was submitted, but its status could not be confirmed. Check the active TWAP list before retrying.`;
				if (mountedRef.current && isTwapExecutionIdentityCurrent(execution, liveIdentityRef.current)) {
					setFeedback({
						tone: "warning",
						message,
						actionId: action.id,
						env: execution.env,
						owner: execution.owner,
					});
					toast.warning(message, { id: getPendingTradingActionToastId(action.id) });
				}
				return;
			}

			getPendingTradingActionActions().resolveTwapCancellation(action.id);
			const message = error instanceof Error ? error.message : t`Failed to cancel TWAP order.`;
			if (mountedRef.current && isTwapExecutionIdentityCurrent(execution, liveIdentityRef.current)) {
				setFeedback({ tone: "error", message, env: execution.env, owner: execution.owner });
				toast.error(message);
			}
		} finally {
			if (executionRef.current === execution) executionRef.current = null;
		}
	}

	return { cancelTwap, cancellingTwapId, feedback };
}

function isTwapExecutionIdentityCurrent(
	execution: TwapCancelExecutionContext,
	liveIdentity: { clientKey: string; env: "Mainnet" | "Testnet" },
): boolean {
	return (
		liveIdentity.clientKey !== "disconnected" &&
		liveIdentity.clientKey.toLowerCase() === execution.owner &&
		liveIdentity.env === execution.env
	);
}
