import { useLingui } from "@lingui/react/macro";
import type Big from "big.js";
import { useRef } from "react";
import { toast } from "sonner";
import { HL_ALL_DEXS } from "@/config/app";
import type { ExchangeOrder } from "@/config/trade";
import { getPositionDex } from "@/domain/market";
import { getCloseOrderFeedbackChildren, summarizeCloseOrderFeedback } from "@/domain/trade/close-order-feedback";
import { isLiveExecutionPriceReceiptFresh } from "@/domain/trade/market-price";
import { buildOrderPlan } from "@/domain/trade/order-intent";
import { throwIfAnyResponseError } from "@/domain/trade/orders";
import {
	type PositionMarketCloseResolution,
	resolvePositionMarketClosePercent,
	resolvePositionMarketCloseSize,
} from "@/domain/trade/position-market-close";
import { useTrackedOrder } from "@/hooks/trade/use-tracked-order";
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
import { getOrderAssetReservationState, runWithAvailableOrderAssetLocks } from "@/lib/trade/order-asset-lock";
import { dismissPositionMarketCloseConfirmation } from "@/lib/trade/position-market-close-confirmation-preference";
import type { PositionMarketCloseSubmitInput } from "@/lib/trade/position-market-close-submitter";
import {
	getPositionMarketClosePlanFeedback,
	localizedPositionSubmitFeedback,
	PositionSubmitFeedbackCause,
	positionSubmitFeedbackCause,
	positionSubmitFeedbackFromCause,
} from "@/lib/trade/position-submit-feedback";
import {
	getPositionMarketCloseActions,
	getPositionMarketCloseModal,
	type PositionMarketClosePresentation,
	type PositionMarketCloseSession,
} from "@/stores/use-global-modal-store";
import { useMarketOrderSlippageBpsString } from "@/stores/use-global-settings-store";
import { hasAcceptedHip3Disclaimer } from "@/stores/use-hip3-disclaimer-store";
import { addOrderQueueItem, getOrderQueueItem, updateOrderQueueItem } from "@/stores/use-order-queue-store";
import { getPersistedPendingOrderAssetState } from "@/stores/use-pending-order-store";
import { getPersistedPendingTwapAssetState } from "@/stores/use-pending-twap-store";

interface FreshCloseSnapshot {
	signedPositionSize: string;
	referencePx: string;
	marginMode: "cross" | "isolated";
	priceReceivedAt: number;
}

interface ExecutionContext {
	sessionId: string;
	owner: string;
	env: "Mainnet" | "Testnet";
	closeSize: string;
	freshSignedPositionSize: string;
	plannedLiveSignedPositionSize: string;
	marginMode: "cross" | "isolated";
	expectedOrder: ExchangeOrder;
	grouping: "na" | "normalTpsl" | "positionTpsl";
	priceReceivedAt: number;
}

interface LiveContext {
	clientKey: string;
	env: "Mainnet" | "Testnet";
	markets: ReturnType<typeof useMarkets>;
	userPositions: ReturnType<typeof useUserPositions>;
	activeTwaps: {
		status: SubscriptionStatus;
		isStale: boolean;
		data: SubEvent<"twapStates"> | undefined;
	};
}

export function usePositionMarketCloseSubmit() {
	const { t } = useLingui();
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
	const liveContextRef = useRef<LiveContext>({ clientKey, env, markets, userPositions, activeTwaps });
	const executionContextRef = useRef<ExecutionContext | null>(null);
	liveContextRef.current = { clientKey, env, markets, userPositions, activeTwaps };

	function assertExecutionContext(params: ExchangeParams<"order">) {
		const execution = executionContextRef.current;
		if (!execution) throw positionSubmitFeedbackCause("trading-data-changed");

		const currentSession = getPositionMarketCloseModal();
		const live = liveContextRef.current;
		if (
			!currentSession ||
			currentSession.sessionId !== execution.sessionId ||
			currentSession.phase !== "submitting" ||
			live.env !== execution.env ||
			live.clientKey.toLowerCase() !== execution.owner
		) {
			throw positionSubmitFeedbackCause("trading-data-changed");
		}

		assertLivePositionMatches(currentSession, live, execution);
		if (!isLiveExecutionPriceReceiptFresh(execution.priceReceivedAt)) {
			throw positionSubmitFeedbackCause("trading-data-changed");
		}
		assertOrderMatchesExecution(params, execution);
	}

	const trackedOrder = useTrackedOrder({ executionGuard: assertExecutionContext });

	async function submit(input: PositionMarketCloseSubmitInput): Promise<void> {
		const actions = getPositionMarketCloseActions();
		const currentSession = getPositionMarketCloseModal();
		if (!currentSession || currentSession.sessionId !== input.sessionId || currentSession.phase !== "idle") return;

		const openedPresentation = currentSession.presentation;
		const queueId = addOrderQueueItem({
			id: `market-close:${input.sessionId}`,
			owner: currentSession.owner,
			env: currentSession.env,
			operation: "market-close",
			market: currentSession.position.coin,
			size: input.confirmedCloseSize ?? undefined,
			orderType: "market",
			countMode: "filled",
			status: "pending",
			children: [
				{
					assetId: currentSession.position.assetId,
					market: currentSession.position.coin,
					size: input.confirmedCloseSize ?? undefined,
					status: "pending",
				},
			],
		});
		actions.dismiss(input.sessionId);
		actions.updatePhase(input.sessionId, "validating");

		try {
			const confirmedCloseSize = resolveConfirmedCloseSize(openedPresentation, input.confirmedCloseSize);
			const lockResult = await runWithAvailableOrderAssetLocks(
				{
					env: currentSession.env,
					owner: currentSession.owner,
					assetIds: [currentSession.position.assetId],
				},
				async (assetLockLease) => {
					const lockedSession = getPositionMarketCloseModal();
					if (!lockedSession || lockedSession.sessionId !== input.sessionId || lockedSession.phase !== "validating") {
						throw positionSubmitFeedbackCause("trading-data-changed");
					}
					assertSessionIdentity(lockedSession, liveContextRef.current.clientKey, liveContextRef.current.env);
					assertLivePositionReady(lockedSession, liveContextRef.current);
					const reservationState = getOrderAssetReservationState(assetLockLease, {
						intentKey: `position-market-close:${lockedSession.sessionId}`,
						exclusiveAssetLock: true,
						isRiskReducing: true,
					});
					const pendingTwapState = getPersistedPendingTwapAssetState(
						lockedSession.env,
						lockedSession.owner,
						lockedSession.position.assetId,
					);
					const pendingOrderState = getPersistedPendingOrderAssetState(lockedSession.env, lockedSession.owner, [
						lockedSession.position.assetId,
					]);
					if (
						reservationState === "unavailable" ||
						pendingTwapState === "unavailable" ||
						pendingOrderState === "unavailable"
					) {
						throw positionSubmitFeedbackCause("coordination-unavailable");
					}
					if (reservationState === "conflict" || pendingTwapState === "pending" || pendingOrderState === "pending") {
						throw positionSubmitFeedbackCause("blocked-market");
					}

					const currentMarket = liveContextRef.current.markets.getMarket(lockedSession.position.coin);
					const fresh = await fetchFreshCloseSnapshot(lockedSession, currentMarket, info);
					const refreshedSession = getPositionMarketCloseModal();
					if (
						!refreshedSession ||
						refreshedSession.sessionId !== input.sessionId ||
						refreshedSession.phase !== "validating"
					) {
						throw positionSubmitFeedbackCause("trading-data-changed");
					}
					assertSessionIdentity(refreshedSession, liveContextRef.current.clientKey, liveContextRef.current.env);
					assertFreshSnapshotCompatibleWithLive(refreshedSession, fresh, liveContextRef.current);
					const plannedLivePosition = liveContextRef.current.userPositions.getPosition(
						refreshedSession.position.coin,
						refreshedSession.position.dex,
					);
					if (!plannedLivePosition || !toBig(plannedLivePosition.szi)) {
						throw positionSubmitFeedbackCause("trading-data-changed");
					}
					const closeResolution = resolveCurrentCloseSize(refreshedSession, fresh.signedPositionSize);
					assertPercentageCloseWithinLiveIntent(refreshedSession, plannedLivePosition.szi, closeResolution);
					assertCloseSizeWithinConfirmedSize(closeResolution, confirmedCloseSize);

					const plan = buildOrderPlan({
						kind: "marketClose",
						assetId: refreshedSession.position.assetId,
						signedPositionSize: fresh.signedPositionSize,
						closeSize: closeResolution.normalizedSize,
						szDecimals: refreshedSession.position.szDecimals,
						referencePx: fresh.referencePx,
						slippageBps,
					});
					if (plan.errors.length > 0 || plan.orders.length !== 1) {
						throw new PositionSubmitFeedbackCause(getPositionMarketClosePlanFeedback(plan.errors[0]));
					}
					if (input.dismissFutureConfirmation) {
						const preferenceStatus = dismissPositionMarketCloseConfirmation({
							owner: refreshedSession.owner,
							env: refreshedSession.env,
						});
						if (preferenceStatus !== "dismissed") {
							toast.warning(t`The order can continue, but this confirmation preference could not be saved.`);
						}
					}

					const order = plan.orders[0];
					const targets = [
						{
							assetId: refreshedSession.position.assetId,
							market: refreshedSession.position.coin,
							size: String(order.s),
						},
					];
					updateOrderQueueItem(queueId, {
						size: String(order.s),
						side: order.b ? "buy" : "sell",
						children: targets.map((target) => ({ ...target, status: "pending" })),
					});
					executionContextRef.current = {
						sessionId: refreshedSession.sessionId,
						owner: refreshedSession.owner,
						env: refreshedSession.env,
						closeSize: String(order.s),
						freshSignedPositionSize: fresh.signedPositionSize,
						plannedLiveSignedPositionSize: plannedLivePosition.szi,
						marginMode: fresh.marginMode,
						expectedOrder: order,
						grouping: plan.grouping,
						priceReceivedAt: fresh.priceReceivedAt,
					};
					actions.updatePhase(input.sessionId, "submitting");

					const submission = await trackedOrder.submitOrder(
						{ orders: plan.orders, grouping: plan.grouping },
						{
							assetLockLease,
							queueId,
							onResponse: (response) =>
								updateOrderQueueItem(queueId, { children: getCloseOrderFeedbackChildren(targets, response) }),
							riskContext: { marketKind: "perp", marginMode: fresh.marginMode },
							exclusiveAssetLock: true,
							confirmationMode: "filled",
							origin: { type: "positionMarketClose", sessionId: refreshedSession.sessionId },
						},
					);
					if (submission.state === "blocked") {
						updateOrderQueueItem(queueId, {
							status: "failed",
							error: localizedPositionSubmitFeedback("blocked-market"),
							children: targets.map((target) => ({ ...target, status: "rejected" })),
						});
						actions.updatePhase(input.sessionId, "idle");
						actions.close(input.sessionId);
						return;
					}
					if (submission.state === "reconciling") {
						updateOrderQueueItem(queueId, {
							status: "confirming",
							children: getOrderQueueItem(queueId)?.children?.map((child) =>
								child.status === "pending" ? { ...child, status: "unknown" } : child,
							),
						});
						actions.updatePhase(input.sessionId, "reconciling");
						return;
					}

					const statuses = submission.result.response?.data?.statuses;
					throwIfAnyResponseError(statuses);
					const filledSize = getFilledSize(statuses);
					if (!filledSize) {
						throw positionSubmitFeedbackCause("reconciling-order");
					}
					updateOrderQueueItem(queueId, {
						status: "success",
						outcome: "filled",
						size: filledSize,
						acceptedCount: 1,
						totalCount: 1,
					});
					actions.updatePhase(input.sessionId, "idle");
					actions.close(input.sessionId);
				},
			);
			if (!lockResult.supported) {
				throw positionSubmitFeedbackCause("coordination-unavailable");
			}
			if (!lockResult.acquired) {
				throw positionSubmitFeedbackCause("blocked-market");
			}
		} catch (error) {
			const feedback = positionSubmitFeedbackFromCause(error, "failed-market-close");
			const children = getOrderQueueItem(queueId)?.children ?? [];
			const summary = summarizeCloseOrderFeedback(children);
			const partial = summary.hasPartialFill || summary.filledCount > 0;
			updateOrderQueueItem(queueId, {
				status: partial ? "partial" : "failed",
				error: partial ? undefined : feedback,
				acceptedCount: summary.filledCount,
				totalCount: summary.totalCount,
				children: children.map((child) => (child.status === "pending" ? { ...child, status: "rejected" } : child)),
			});
			const activeSession = getPositionMarketCloseModal();
			if (activeSession?.sessionId === input.sessionId) {
				actions.updatePhase(input.sessionId, "idle");
				actions.close(input.sessionId);
			}
		} finally {
			if (executionContextRef.current?.sessionId === input.sessionId) executionContextRef.current = null;
		}
	}

	return { submit };
}

function assertSessionIdentity(
	session: PositionMarketCloseSession,
	clientKey: string,
	env: "Mainnet" | "Testnet",
): void {
	if (clientKey === "disconnected" || clientKey.toLowerCase() !== session.owner || env !== session.env) {
		throw positionSubmitFeedbackCause("trading-data-changed");
	}
}

function assertLivePositionReady(session: PositionMarketCloseSession, live: LiveContext): void {
	const { markets, userPositions } = live;
	const market = markets.getMarket(session.position.coin);
	if (
		markets.isLoading ||
		markets.error ||
		!market ||
		market.kind === "spot" ||
		market.assetId !== session.position.assetId ||
		market.szDecimals !== session.position.szDecimals ||
		getPositionDex(market) !== session.position.dex
	) {
		throw positionSubmitFeedbackCause("trading-data-changed");
	}
	assertMarketAssetBinding(session, market, market.ctxIndex);
	if (market.kind === "builderPerp" && !hasAcceptedHip3Disclaimer()) {
		throw positionSubmitFeedbackCause("accept-hip3-market");
	}
	if (userPositions.isLoading || userPositions.hasError || userPositions.isStale) {
		throw positionSubmitFeedbackCause("failed-load-positions");
	}
	assertNoActiveTwap(session, live);

	const position = userPositions.getPosition(session.position.coin, session.position.dex);
	const currentSize = toBig(position?.szi);
	const openedSize = toBig(session.position.signedPositionSize);
	if (!position || !currentSize || currentSize.eq(0) || !openedSize || openedSize.eq(0)) {
		throw positionSubmitFeedbackCause("no-active-positions");
	}
	if (currentSize.gt(0) !== openedSize.gt(0)) {
		throw positionSubmitFeedbackCause("trading-data-changed");
	}
}

function assertNoActiveTwap(session: PositionMarketCloseSession, live: LiveContext): void {
	if (live.activeTwaps.status !== "active" || live.activeTwaps.isStale || live.activeTwaps.data === undefined) {
		throw positionSubmitFeedbackCause("trading-data-changed");
	}
	if (live.activeTwaps.data.states.some(([, state]) => state.coin === session.position.coin)) {
		throw positionSubmitFeedbackCause("blocked-market");
	}
}

function resolveCurrentCloseSize(
	session: PositionMarketCloseSession,
	freshSignedPositionSize: string,
): PositionMarketCloseResolution {
	const input = {
		signedPositionSize: freshSignedPositionSize,
		szDecimals: session.position.szDecimals,
	};
	const resolution =
		session.sizingIntent.kind === "size"
			? resolvePositionMarketCloseSize({ ...input, closeSize: session.sizingIntent.value })
			: resolvePositionMarketClosePercent({
					...input,
					percent: session.sizingIntent.kind === "max" ? "100" : session.sizingIntent.value,
				});
	if (resolution.errors.length > 0) {
		throw new PositionSubmitFeedbackCause(getPositionMarketClosePlanFeedback(resolution.errors[0]));
	}
	return resolution;
}

function assertPercentageCloseWithinLiveIntent(
	session: PositionMarketCloseSession,
	liveSignedPositionSize: string,
	closeResolution: PositionMarketCloseResolution,
): void {
	if (session.sizingIntent.kind !== "percent") return;
	const liveResolution = resolvePositionMarketClosePercent({
		signedPositionSize: liveSignedPositionSize,
		szDecimals: session.position.szDecimals,
		percent: session.sizingIntent.value,
	});
	const plannedCloseSize = toBig(closeResolution.normalizedSize);
	const liveIntentLimit = toBig(liveResolution.normalizedSize);
	if (
		liveResolution.errors.length > 0 ||
		!plannedCloseSize ||
		!liveIntentLimit ||
		plannedCloseSize.gt(liveIntentLimit)
	) {
		throw positionSubmitFeedbackCause("trading-data-changed");
	}
}

function resolveConfirmedCloseSize(
	openedPresentation: PositionMarketClosePresentation,
	confirmedCloseSize: string | null,
): Big | null {
	if (openedPresentation === "direct" && confirmedCloseSize === null) return null;
	const confirmed = openedPresentation === "confirmation" ? toBig(confirmedCloseSize) : null;
	if (!confirmed?.gt(0)) throw positionSubmitFeedbackCause("trading-data-changed");
	return confirmed;
}

function assertCloseSizeWithinConfirmedSize(
	closeResolution: PositionMarketCloseResolution,
	confirmedCloseSize: Big | null,
): void {
	if (!confirmedCloseSize) return;
	const plannedCloseSize = toBig(closeResolution.normalizedSize);
	if (!plannedCloseSize || plannedCloseSize.gt(confirmedCloseSize)) {
		throw positionSubmitFeedbackCause("close-size-exceeds-confirmed");
	}
}

function assertFreshSnapshotCompatibleWithLive(
	session: PositionMarketCloseSession,
	fresh: FreshCloseSnapshot,
	live: LiveContext,
): void {
	assertLivePositionReady(session, live);
	const currentPosition = live.userPositions.getPosition(session.position.coin, session.position.dex);
	const currentSize = toBig(currentPosition?.szi);
	const freshSize = toBig(fresh.signedPositionSize);
	if (
		!currentSize ||
		!freshSize ||
		currentSize.gt(0) !== freshSize.gt(0) ||
		currentPosition?.leverage.type !== fresh.marginMode
	) {
		throw positionSubmitFeedbackCause("trading-data-changed");
	}
}

function assertLivePositionMatches(
	session: PositionMarketCloseSession,
	live: LiveContext,
	execution: ExecutionContext,
): void {
	assertLivePositionReady(session, live);
	const currentPosition = live.userPositions.getPosition(session.position.coin, session.position.dex);
	const currentSize = toBig(currentPosition?.szi);
	const expectedSize = toBig(execution.freshSignedPositionSize);
	const plannedLiveSize = toBig(execution.plannedLiveSignedPositionSize);
	const closeSize = toBig(execution.closeSize);
	if (
		!currentSize ||
		!expectedSize ||
		!plannedLiveSize ||
		!closeSize ||
		currentSize.gt(0) !== expectedSize.gt(0) ||
		!currentSize.eq(plannedLiveSize) ||
		currentSize.abs().lt(closeSize) ||
		currentPosition?.leverage.type !== execution.marginMode
	) {
		throw positionSubmitFeedbackCause("trading-data-changed");
	}
}

function assertOrderMatchesExecution(params: ExchangeParams<"order">, execution: ExecutionContext): void {
	if (params.grouping !== execution.grouping || params.orders.length !== 1) {
		throw positionSubmitFeedbackCause("trading-data-changed");
	}
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
		throw positionSubmitFeedbackCause("trading-data-changed");
	}
}

async function fetchFreshCloseSnapshot(
	session: PositionMarketCloseSession,
	expectedMarket: UnifiedMarket | undefined,
	info: ReturnType<typeof useHyperliquid>["info"],
): Promise<FreshCloseSnapshot> {
	const [accountState, marketSnapshot] = await Promise.all([
		info.clearinghouseState({ user: session.owner as `0x${string}`, dex: session.position.dex }),
		info.metaAndAssetCtxs({ dex: session.position.dex }).then((data) => ({ data, priceReceivedAt: performance.now() })),
	]);
	const marketData = marketSnapshot.data;
	const [meta, assetContexts] = marketData;
	const marketIndex = meta.universe.findIndex((asset) => asset.name === session.position.coin);
	const metadata = meta.universe[marketIndex];
	const context = assetContexts[marketIndex];
	const referencePx = toBig(context?.midPx)?.gt(0) ? context?.midPx : context?.markPx;
	if (
		marketIndex < 0 ||
		!metadata ||
		metadata.szDecimals !== session.position.szDecimals ||
		!context ||
		!toBig(referencePx)?.gt(0)
	) {
		throw positionSubmitFeedbackCause("trading-data-changed");
	}
	assertMarketAssetBinding(session, expectedMarket, marketIndex);

	const position = accountState.assetPositions.find((entry) => entry.position.coin === session.position.coin)?.position;
	const signedPositionSize = toBig(position?.szi);
	const openedPositionSize = toBig(session.position.signedPositionSize);
	if (
		!position ||
		!signedPositionSize ||
		signedPositionSize.eq(0) ||
		!openedPositionSize ||
		openedPositionSize.eq(0) ||
		signedPositionSize.gt(0) !== openedPositionSize.gt(0)
	) {
		throw positionSubmitFeedbackCause("no-active-positions");
	}

	return {
		signedPositionSize: position.szi,
		referencePx: String(referencePx),
		marginMode: position.leverage.type,
		priceReceivedAt: marketSnapshot.priceReceivedAt,
	};
}

function assertMarketAssetBinding(
	session: PositionMarketCloseSession,
	market: UnifiedMarket | undefined,
	contextIndex: number,
): void {
	if (!market || market.ctxIndex !== contextIndex || market.kind === "spot") {
		throw positionSubmitFeedbackCause("trading-data-changed");
	}
	const parsedAssetId = parseAssetId(session.position.assetId);
	const isValidMainPerp =
		market.kind === "perp" && parsedAssetId.kind === "perp" && parsedAssetId.index === contextIndex;
	const isValidBuilderPerp =
		market.kind === "builderPerp" &&
		parsedAssetId.kind === "builderPerp" &&
		parsedAssetId.index === contextIndex &&
		parsedAssetId.dexIndex === market.dexIndex;
	if (!isValidMainPerp && !isValidBuilderPerp) {
		throw positionSubmitFeedbackCause("trading-data-changed");
	}
}

function getFilledSize(statuses: unknown[] | undefined): string | null {
	for (const status of statuses ?? []) {
		if (!status || typeof status !== "object" || !("filled" in status)) continue;
		const filled = status.filled;
		if (filled && typeof filled === "object" && "totalSz" in filled && typeof filled.totalSz === "string") {
			return filled.totalSz;
		}
	}
	return null;
}
