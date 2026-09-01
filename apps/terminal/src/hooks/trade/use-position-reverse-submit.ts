import { useLingui } from "@lingui/react/macro";
import { useEffect, useRef, useState } from "react";
import { HL_ALL_DEXS } from "@/config/app";
import type { ExchangeOrder } from "@/config/trade";
import { getPositionDex } from "@/domain/market";
import { isLiveExecutionPriceReceiptFresh } from "@/domain/trade/market-price";
import { throwIfAnyResponseError } from "@/domain/trade/orders";
import { buildPositionReverseOrder, type PositionReverseOrderError } from "@/domain/trade/position-reverse";
import { type TrackedOrderResult, useTrackedOrder } from "@/hooks/trade/use-tracked-order";
import {
	type ExchangeParams,
	parseAssetId,
	type SubEvent,
	type SubscriptionStatus,
	type UnifiedMarket,
	useHyperliquid,
	useMarkets,
	useSubscription,
	useUserPositions,
} from "@/lib/hyperliquid";
import { toBig } from "@/lib/trade/numbers";
import {
	getOrderAssetReservationState,
	type OrderAssetLockLease,
	runWithAvailableOrderAssetLocks,
} from "@/lib/trade/order-asset-lock";
import {
	formatPositionSubmitFeedback,
	formatTrackedPositionSubmitError,
	localizedPositionSubmitFeedback,
	localizePositionSubmitFeedbackCause,
	type PositionSubmitFeedback,
	PositionSubmitFeedbackCause,
	positionSubmitFeedbackCause,
	positionSubmitFeedbackFromCause,
} from "@/lib/trade/position-submit-feedback";
import { useMarketOrderSlippageBpsString } from "@/stores/use-global-settings-store";
import { hasAcceptedHip3Disclaimer } from "@/stores/use-hip3-disclaimer-store";
import { getPersistedPendingOrderAssetState } from "@/stores/use-pending-order-store";
import { getPersistedPendingTwapAssetState } from "@/stores/use-pending-twap-store";

export interface PositionReverseTarget {
	owner: string;
	env: "Mainnet" | "Testnet";
	coin: string;
	dex: string;
	assetId: number;
	szDecimals: number;
	signedPositionSize: string;
	marginMode: "cross" | "isolated";
}

export type PositionReverseSubmitPhase = "idle" | "validating" | "submitting" | "reconciling";

export type PositionReverseSubmitOutcome = TrackedOrderResult;

interface FreshReverseSnapshot {
	signedPositionSize: string;
	referencePx: string;
	marginMode: "cross" | "isolated";
	priceReceivedAt: number;
	positionReceivedAt: number;
}

interface ExecutionContext {
	lifecycleEpoch: number;
	targetKey: string;
	owner: string;
	env: "Mainnet" | "Testnet";
	freshSignedPositionSize: string;
	marginMode: "cross" | "isolated";
	expectedOrder: ExchangeOrder;
	grouping: "na";
	priceReceivedAt: number;
	positionReceivedAt: number;
}

interface LiveContext {
	clientKey: string;
	env: "Mainnet" | "Testnet";
	markets: ReturnType<typeof useMarkets>;
	userPositions: ReturnType<typeof useUserPositions>;
	activeTwaps: {
		status: SubscriptionStatus;
		isStale: boolean;
		lastMessageAt: number | undefined;
		data: SubEvent<"twapStates"> | undefined;
	};
}

const USER_STATE_MAX_AGE_MS = 60_000;

/**
 * Fail-closed submission boundary for reversing a perpetual position.
 *
 * The target is the immutable quantity the user confirmed. The order price is
 * refreshed under the exclusive asset lock, while any position-size change
 * invalidates the confirmation and requires the user to reopen the dialog.
 */
export function usePositionReverseSubmit(target: PositionReverseTarget) {
	const { i18n } = useLingui();
	const { clientKey, env, info } = useHyperliquid();
	const markets = useMarkets();
	const userPositions = useUserPositions();
	const address = clientKey === "disconnected" ? undefined : (clientKey as `0x${string}`);
	const activeTwaps = useSubscription(
		"twapStates",
		{ user: address ?? "0x0000000000000000000000000000000000000000", dex: HL_ALL_DEXS },
		{ enabled: !!address },
	);
	const slippageBps = useMarketOrderSlippageBpsString();
	const [phase, setPhaseState] = useState<PositionReverseSubmitPhase>("idle");
	const [error, setError] = useState<PositionSubmitFeedback | null>(null);
	const phaseRef = useRef<PositionReverseSubmitPhase>("idle");
	const targetRef = useRef(target);
	const slippageBpsRef = useRef(slippageBps);
	const liveContextRef = useRef<LiveContext>({ clientKey, env, markets, userPositions, activeTwaps });
	const executionContextRef = useRef<ExecutionContext | null>(null);
	const lifecycleRef = useRef({ mounted: false, epoch: 0 });
	targetRef.current = target;
	slippageBpsRef.current = slippageBps;
	liveContextRef.current = { clientKey, env, markets, userPositions, activeTwaps };

	useEffect(() => {
		const epoch = lifecycleRef.current.epoch + 1;
		lifecycleRef.current = { mounted: true, epoch };
		return () => {
			if (lifecycleRef.current.epoch !== epoch) return;
			lifecycleRef.current = { mounted: false, epoch: epoch + 1 };
			phaseRef.current = "idle";
			executionContextRef.current = null;
		};
	}, []);

	function setPhase(nextPhase: PositionReverseSubmitPhase): void {
		phaseRef.current = nextPhase;
		if (lifecycleRef.current.mounted) setPhaseState(nextPhase);
	}

	function assertLifecycleActive(epoch: number): void {
		if (!lifecycleRef.current.mounted || lifecycleRef.current.epoch !== epoch) {
			throw tradingDataChangedError();
		}
	}

	function assertExecutionContext(params: ExchangeParams<"order">): void {
		const execution = executionContextRef.current;
		if (!execution || phaseRef.current !== "submitting") throw tradingDataChangedError();
		assertLifecycleActive(execution.lifecycleEpoch);

		const currentTarget = targetRef.current;
		const live = liveContextRef.current;
		if (
			getTargetKey(currentTarget) !== execution.targetKey ||
			live.env !== execution.env ||
			live.clientKey === "disconnected" ||
			live.clientKey.toLowerCase() !== execution.owner
		) {
			throw tradingDataChangedError();
		}

		assertLivePositionMatches(currentTarget, live, execution);
		if (
			!isLiveExecutionPriceReceiptFresh(execution.priceReceivedAt) ||
			!isLiveExecutionPriceReceiptFresh(execution.positionReceivedAt)
		) {
			throw tradingDataChangedError();
		}
		assertOrderMatchesExecution(params, execution);
	}

	const trackedOrder = useTrackedOrder({ executionGuard: assertExecutionContext });

	async function submit(): Promise<PositionReverseSubmitOutcome> {
		if (phaseRef.current !== "idle") return { state: "blocked" };
		const lifecycleEpoch = lifecycleRef.current.epoch;
		assertLifecycleActive(lifecycleEpoch);

		setPhase("validating");
		setError(null);
		executionContextRef.current = null;
		const submittedTarget = { ...targetRef.current };
		const submittedTargetKey = getTargetKey(submittedTarget);
		const submittedSlippageBps = slippageBpsRef.current;

		try {
			const lockResult = await runWithAvailableOrderAssetLocks(
				{
					env: submittedTarget.env,
					owner: submittedTarget.owner,
					assetIds: [submittedTarget.assetId],
				},
				async (assetLockLease) => {
					assertTargetIsCurrent(lifecycleEpoch, submittedTargetKey, submittedTarget);
					const liveBeforeRefresh = liveContextRef.current;
					assertSessionIdentity(submittedTarget, liveBeforeRefresh.clientKey, liveBeforeRefresh.env);
					assertLivePositionReady(submittedTarget, liveBeforeRefresh);
					assertNoPendingCoordination(assetLockLease, submittedTarget);

					const currentMarket = liveBeforeRefresh.markets.getMarket(submittedTarget.coin);
					const fresh = await fetchFreshReverseSnapshot(submittedTarget, currentMarket, info);

					assertTargetIsCurrent(lifecycleEpoch, submittedTargetKey, submittedTarget);
					const liveAfterRefresh = liveContextRef.current;
					assertSessionIdentity(submittedTarget, liveAfterRefresh.clientKey, liveAfterRefresh.env);
					assertFreshSnapshotCompatibleWithLive(submittedTarget, fresh, liveAfterRefresh);
					assertNoPendingCoordination(assetLockLease, submittedTarget);

					const plan = buildPositionReverseOrder({
						assetId: submittedTarget.assetId,
						signedPositionSize: fresh.signedPositionSize,
						szDecimals: submittedTarget.szDecimals,
						referencePx: fresh.referencePx,
						slippageBps: submittedSlippageBps,
					});
					if (plan.errors.length > 0 || plan.orders.length !== 1) {
						throw new PositionSubmitFeedbackCause(getPositionReversePlanError(plan.errors[0]));
					}

					const order = plan.orders[0];
					executionContextRef.current = {
						lifecycleEpoch,
						targetKey: submittedTargetKey,
						owner: submittedTarget.owner.toLowerCase(),
						env: submittedTarget.env,
						freshSignedPositionSize: fresh.signedPositionSize,
						marginMode: fresh.marginMode,
						expectedOrder: order,
						grouping: plan.grouping,
						priceReceivedAt: fresh.priceReceivedAt,
						positionReceivedAt: fresh.positionReceivedAt,
					};
					assertLifecycleActive(lifecycleEpoch);
					setPhase("submitting");

					const outcome = await trackedOrder.submitOrder(
						{ orders: plan.orders, grouping: plan.grouping },
						{
							assetLockLease,
							riskContext: { marketKind: "perp", marginMode: fresh.marginMode },
							exclusiveAssetLock: true,
							confirmationMode: "filled",
						},
					);
					assertLifecycleActive(lifecycleEpoch);
					if (outcome.state === "blocked") {
						setPhase("idle");
						setError(localizedPositionSubmitFeedback("blocked-market"));
						return outcome;
					}
					if (outcome.state === "reconciling") {
						setPhase("reconciling");
						setError(localizedPositionSubmitFeedback("reconciling-order"));
						return outcome;
					}

					throwIfAnyResponseError(outcome.result.response?.data?.statuses);
					setPhase("idle");
					return outcome;
				},
			);
			assertLifecycleActive(lifecycleEpoch);
			if (!lockResult.supported) {
				throw positionSubmitFeedbackCause("coordination-unavailable");
			}
			if (!lockResult.acquired) {
				setPhase("idle");
				setError(localizedPositionSubmitFeedback("blocked-market"));
				return { state: "blocked" };
			}
			return lockResult.value;
		} catch (cause) {
			const submitError = positionSubmitFeedbackFromCause(cause, "failed-reverse");
			const message = formatPositionSubmitFeedback(submitError, (descriptor) => i18n._(descriptor));
			if (lifecycleRef.current.mounted && lifecycleRef.current.epoch === lifecycleEpoch) {
				setPhase("idle");
				setError(submitError);
			}
			throw localizePositionSubmitFeedbackCause(cause, submitError, message);
		} finally {
			executionContextRef.current = null;
		}
	}

	function assertTargetIsCurrent(
		lifecycleEpoch: number,
		targetKey: string,
		submittedTarget: PositionReverseTarget,
	): void {
		assertLifecycleActive(lifecycleEpoch);
		if (phaseRef.current !== "validating" || getTargetKey(targetRef.current) !== targetKey) {
			throw tradingDataChangedError();
		}
		if (getTargetKey(submittedTarget) !== targetKey) throw tradingDataChangedError();
	}

	function resetError(): void {
		if (phaseRef.current !== "idle") return;
		setError(null);
		trackedOrder.reset();
	}

	return {
		submit,
		phase,
		isPending: phase === "validating" || phase === "submitting" || trackedOrder.isPending,
		isReconciling: phase === "reconciling",
		error: error
			? formatPositionSubmitFeedback(error, (descriptor) => i18n._(descriptor))
			: formatTrackedPositionSubmitError(trackedOrder.error, (descriptor) => i18n._(descriptor)),
		resetError,
	};
}

function assertSessionIdentity(target: PositionReverseTarget, clientKey: string, env: "Mainnet" | "Testnet"): void {
	if (clientKey === "disconnected" || clientKey.toLowerCase() !== target.owner.toLowerCase() || env !== target.env) {
		throw tradingDataChangedError();
	}
}

function assertLivePositionReady(target: PositionReverseTarget, live: LiveContext): void {
	const market = live.markets.getMarket(target.coin);
	if (
		live.markets.isLoading ||
		live.markets.error ||
		!market ||
		market.kind === "spot" ||
		market.assetId !== target.assetId ||
		market.szDecimals !== target.szDecimals ||
		getPositionDex(market) !== target.dex
	) {
		throw tradingDataChangedError();
	}
	assertMarketAssetBinding(target, market, market.ctxIndex);
	if (market.kind === "builderPerp" && !hasAcceptedHip3Disclaimer()) {
		throw positionSubmitFeedbackCause("accept-hip3-market");
	}
	const positionAge =
		live.userPositions.receivedAt === undefined ? Number.POSITIVE_INFINITY : Date.now() - live.userPositions.receivedAt;
	if (
		live.userPositions.isLoading ||
		live.userPositions.hasError ||
		live.userPositions.isStale ||
		positionAge < 0 ||
		positionAge > USER_STATE_MAX_AGE_MS
	) {
		throw positionSubmitFeedbackCause("failed-load-positions");
	}
	assertNoActiveTwap(target, live);

	const position = live.userPositions.getPosition(target.coin, target.dex);
	const currentSize = toBig(position?.szi);
	const openedSize = toBig(target.signedPositionSize);
	if (!position || !currentSize || currentSize.eq(0) || !openedSize || openedSize.eq(0)) {
		throw positionSubmitFeedbackCause("no-active-positions");
	}
	if (!currentSize.eq(openedSize) || position.leverage.type !== target.marginMode) {
		throw tradingDataChangedError();
	}
}

function assertNoActiveTwap(target: PositionReverseTarget, live: LiveContext): void {
	const twapAge =
		live.activeTwaps.lastMessageAt === undefined
			? Number.POSITIVE_INFINITY
			: Date.now() - live.activeTwaps.lastMessageAt;
	if (
		live.activeTwaps.status !== "active" ||
		live.activeTwaps.isStale ||
		live.activeTwaps.data === undefined ||
		twapAge < 0 ||
		twapAge > USER_STATE_MAX_AGE_MS
	) {
		throw tradingDataChangedError();
	}
	if (live.activeTwaps.data.states.some(([, state]) => state.coin === target.coin)) {
		throw positionSubmitFeedbackCause("blocked-market");
	}
}

function assertNoPendingCoordination(lease: OrderAssetLockLease, target: PositionReverseTarget): void {
	const reservationState = getOrderAssetReservationState(lease, {
		intentKey: `position-reverse:${getTargetKey(target)}`,
		exclusiveAssetLock: true,
		isRiskReducing: false,
	});
	const pendingTwapState = getPersistedPendingTwapAssetState(target.env, target.owner, target.assetId);
	const pendingOrderState = getPersistedPendingOrderAssetState(target.env, target.owner, [target.assetId]);
	if (reservationState === "unavailable" || pendingTwapState === "unavailable" || pendingOrderState === "unavailable") {
		throw positionSubmitFeedbackCause("coordination-unavailable");
	}
	if (reservationState === "conflict" || pendingTwapState === "pending" || pendingOrderState === "pending") {
		throw positionSubmitFeedbackCause("blocked-market");
	}
}

function assertFreshSnapshotCompatibleWithLive(
	target: PositionReverseTarget,
	fresh: FreshReverseSnapshot,
	live: LiveContext,
): void {
	assertLivePositionReady(target, live);
	const position = live.userPositions.getPosition(target.coin, target.dex);
	const currentSize = toBig(position?.szi);
	const freshSize = toBig(fresh.signedPositionSize);
	const confirmedSize = toBig(target.signedPositionSize);
	if (
		!currentSize ||
		!freshSize ||
		!confirmedSize ||
		currentSize.eq(0) ||
		freshSize.eq(0) ||
		!currentSize.eq(freshSize) ||
		!freshSize.eq(confirmedSize) ||
		position?.leverage.type !== fresh.marginMode ||
		fresh.marginMode !== target.marginMode
	) {
		throw tradingDataChangedError();
	}
}

function assertLivePositionMatches(
	target: PositionReverseTarget,
	live: LiveContext,
	execution: ExecutionContext,
): void {
	assertLivePositionReady(target, live);
	const position = live.userPositions.getPosition(target.coin, target.dex);
	const currentSize = toBig(position?.szi);
	const freshSize = toBig(execution.freshSignedPositionSize);
	if (
		!currentSize ||
		!freshSize ||
		currentSize.eq(0) ||
		freshSize.eq(0) ||
		currentSize.gt(0) !== freshSize.gt(0) ||
		!currentSize.eq(freshSize) ||
		position?.leverage.type !== execution.marginMode
	) {
		throw tradingDataChangedError();
	}
}

async function fetchFreshReverseSnapshot(
	target: PositionReverseTarget,
	expectedMarket: UnifiedMarket | undefined,
	info: ReturnType<typeof useHyperliquid>["info"],
): Promise<FreshReverseSnapshot> {
	const [accountSnapshot, marketSnapshot] = await Promise.all([
		info
			.clearinghouseState({ user: target.owner as `0x${string}`, dex: target.dex })
			.then((data) => ({ data, positionReceivedAt: performance.now() })),
		info.metaAndAssetCtxs({ dex: target.dex }).then((data) => ({ data, priceReceivedAt: performance.now() })),
	]);
	const accountState = accountSnapshot.data;
	const marketData = marketSnapshot.data;
	const [meta, assetContexts] = marketData;
	const marketIndex = meta.universe.findIndex((asset) => asset.name === target.coin);
	const metadata = meta.universe[marketIndex];
	const context = assetContexts[marketIndex];
	const midPx = toBig(context?.midPx);
	const markPx = toBig(context?.markPx);
	const referencePx = midPx?.gt(0) ? context?.midPx : markPx?.gt(0) ? context?.markPx : undefined;
	if (marketIndex < 0 || !metadata || metadata.szDecimals !== target.szDecimals || !context || !referencePx) {
		throw tradingDataChangedError();
	}
	assertMarketAssetBinding(target, expectedMarket, marketIndex);

	const position = accountState.assetPositions.find((entry) => entry.position.coin === target.coin)?.position;
	const signedPositionSize = toBig(position?.szi);
	const openedPositionSize = toBig(target.signedPositionSize);
	if (!position || !signedPositionSize || signedPositionSize.eq(0) || !openedPositionSize || openedPositionSize.eq(0)) {
		throw positionSubmitFeedbackCause("no-active-positions");
	}
	if (!signedPositionSize.eq(openedPositionSize) || position.leverage.type !== target.marginMode) {
		throw tradingDataChangedError();
	}

	return {
		signedPositionSize: position.szi,
		referencePx: String(referencePx),
		marginMode: position.leverage.type,
		priceReceivedAt: marketSnapshot.priceReceivedAt,
		positionReceivedAt: accountSnapshot.positionReceivedAt,
	};
}

function assertMarketAssetBinding(
	target: PositionReverseTarget,
	market: UnifiedMarket | undefined,
	contextIndex: number,
): void {
	if (!market || market.ctxIndex !== contextIndex || market.kind === "spot") throw tradingDataChangedError();
	const parsedAssetId = parseAssetId(target.assetId);
	const isValidMainPerp =
		market.kind === "perp" && parsedAssetId.kind === "perp" && parsedAssetId.index === contextIndex;
	const isValidBuilderPerp =
		market.kind === "builderPerp" &&
		parsedAssetId.kind === "builderPerp" &&
		parsedAssetId.index === contextIndex &&
		parsedAssetId.dexIndex === market.dexIndex;
	if (!isValidMainPerp && !isValidBuilderPerp) throw tradingDataChangedError();
}

function assertOrderMatchesExecution(params: ExchangeParams<"order">, execution: ExecutionContext): void {
	if (params.grouping !== execution.grouping || params.orders.length !== 1) throw tradingDataChangedError();
	const order = params.orders[0];
	const expected = execution.expectedOrder;
	if (
		order.a !== expected.a ||
		order.b !== expected.b ||
		order.p !== expected.p ||
		order.s !== expected.s ||
		order.r !== expected.r ||
		JSON.stringify(order.t) !== JSON.stringify(expected.t)
	) {
		throw tradingDataChangedError();
	}
}

function getTargetKey(target: PositionReverseTarget): string {
	return [
		target.owner.toLowerCase(),
		target.env,
		target.dex,
		target.coin,
		target.assetId,
		target.szDecimals,
		target.signedPositionSize,
		target.marginMode,
	].join(":");
}

function tradingDataChangedError(): Error {
	return positionSubmitFeedbackCause("trading-data-changed");
}

function getPositionReversePlanError(error: PositionReverseOrderError | undefined): PositionSubmitFeedback {
	switch (error) {
		case "position-size-below-precision":
			return localizedPositionSubmitFeedback("position-size-below-precision");
		case "invalid-position-size":
			return localizedPositionSubmitFeedback("no-active-positions");
		default:
			return localizedPositionSubmitFeedback("failed-reverse");
	}
}
