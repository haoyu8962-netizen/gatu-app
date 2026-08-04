import { t } from "@lingui/core/macro";
import { useRef } from "react";
import { toast } from "sonner";
import { HL_ALL_DEXS } from "@/config/app";
import type { ExchangeOrder } from "@/config/trade";
import { getPositionDex } from "@/domain/market";
import { buildOrderPlan } from "@/domain/trade/order-intent";
import { throwIfAnyResponseError } from "@/domain/trade/orders";
import {
	type PositionMarketCloseResolution,
	resolvePositionMarketClosePercent,
	resolvePositionMarketCloseSize,
} from "@/domain/trade/position-market-close";
import { useTrackedOrder } from "@/hooks/trade/use-tracked-order";
import { formatToken } from "@/lib/format";
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
import { getPositionMarketCloseErrorMessage } from "@/lib/trade/position-market-close-errors";
import {
	getPositionMarketCloseActions,
	getPositionMarketCloseModal,
	type PositionMarketCloseSession,
	usePositionMarketCloseSession,
} from "@/stores/use-global-modal-store";
import { useMarketOrderSlippageBpsString } from "@/stores/use-global-settings-store";
import { hasAcceptedHip3Disclaimer } from "@/stores/use-hip3-disclaimer-store";
import { getPersistedPendingOrderAssetState } from "@/stores/use-pending-order-store";
import { getPersistedPendingTwapAssetState } from "@/stores/use-pending-twap-store";

interface SubmitInput {
	sessionId: string;
	dismissFutureConfirmation?: boolean;
}

interface FreshCloseSnapshot {
	signedPositionSize: string;
	referencePx: string;
	marginMode: "cross" | "isolated";
}

interface ExecutionContext {
	sessionId: string;
	owner: string;
	env: "Mainnet" | "Testnet";
	closeSize: string;
	freshSignedPositionSize: string;
	marginMode: "cross" | "isolated";
	expectedOrder: ExchangeOrder;
	grouping: "na" | "normalTpsl" | "positionTpsl";
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
	const session = usePositionMarketCloseSession();
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
		if (!execution)
			throw new Error(t`Trading data changed while this dialog was open. Close and reopen it before submitting.`);

		const currentSession = getPositionMarketCloseModal();
		const live = liveContextRef.current;
		if (
			!currentSession ||
			currentSession.sessionId !== execution.sessionId ||
			currentSession.phase !== "submitting" ||
			live.env !== execution.env ||
			live.clientKey.toLowerCase() !== execution.owner
		) {
			throw new Error(t`Trading data changed while this dialog was open. Close and reopen it before submitting.`);
		}

		assertLivePositionMatches(currentSession, live, execution);
		assertOrderMatchesExecution(params, execution);
	}

	const trackedOrder = useTrackedOrder({ executionGuard: assertExecutionContext });

	async function submit(input: SubmitInput): Promise<void> {
		const actions = getPositionMarketCloseActions();
		const currentSession = getPositionMarketCloseModal();
		if (!currentSession || currentSession.sessionId !== input.sessionId || currentSession.phase !== "idle") return;

		actions.updatePhase(input.sessionId, "validating");
		actions.setError(input.sessionId, null);
		executionContextRef.current = null;

		try {
			const lockResult = await runWithAvailableOrderAssetLocks(
				{
					env: currentSession.env,
					owner: currentSession.owner,
					assetIds: [currentSession.position.assetId],
				},
				async (assetLockLease) => {
					const lockedSession = getPositionMarketCloseModal();
					if (!lockedSession || lockedSession.sessionId !== input.sessionId || lockedSession.phase !== "validating") {
						throw new Error(t`Trading data changed while this dialog was open. Close and reopen it before submitting.`);
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
						throw new Error(t`Safe order coordination across tabs is unavailable in this browser.`);
					}
					if (reservationState === "conflict" || pendingTwapState === "pending" || pendingOrderState === "pending") {
						throw new Error(t`Another order for this market is still being confirmed.`);
					}

					const currentMarket = liveContextRef.current.markets.getMarket(lockedSession.position.coin);
					const fresh = await fetchFreshCloseSnapshot(lockedSession, currentMarket, info);
					const refreshedSession = getPositionMarketCloseModal();
					if (
						!refreshedSession ||
						refreshedSession.sessionId !== input.sessionId ||
						refreshedSession.phase !== "validating"
					) {
						throw new Error(t`Trading data changed while this dialog was open. Close and reopen it before submitting.`);
					}
					assertSessionIdentity(refreshedSession, liveContextRef.current.clientKey, liveContextRef.current.env);
					assertFreshSnapshotCompatibleWithLive(refreshedSession, fresh, liveContextRef.current);
					const closeResolution = resolveCurrentCloseSize(refreshedSession, fresh.signedPositionSize);

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
						throw new Error(
							plan.errors[0] ? getPositionMarketCloseErrorMessage(plan.errors[0]) : t`Failed to close position`,
						);
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
					executionContextRef.current = {
						sessionId: refreshedSession.sessionId,
						owner: refreshedSession.owner,
						env: refreshedSession.env,
						closeSize: String(order.s),
						freshSignedPositionSize: fresh.signedPositionSize,
						marginMode: fresh.marginMode,
						expectedOrder: order,
						grouping: plan.grouping,
					};
					actions.updatePhase(input.sessionId, "submitting");

					const submission = await trackedOrder.submitOrder(
						{ orders: plan.orders, grouping: plan.grouping },
						{
							assetLockLease,
							riskContext: { marketKind: "perp", marginMode: fresh.marginMode },
							exclusiveAssetLock: true,
							confirmationMode: "filled",
							origin: { type: "positionMarketClose", sessionId: refreshedSession.sessionId },
						},
					);
					if (submission.state === "blocked") {
						actions.updatePhase(input.sessionId, "idle");
						actions.setError(input.sessionId, t`Another order for this market is still being confirmed.`);
						return;
					}
					if (submission.state === "reconciling") {
						actions.updatePhase(input.sessionId, "reconciling");
						actions.setError(input.sessionId, t`Order submitted. Confirming exchange status; do not retry.`);
						return;
					}

					const statuses = submission.result.response?.data?.statuses;
					throwIfAnyResponseError(statuses);
					const filledSize = getFilledSize(statuses);
					if (!filledSize) {
						throw new Error(t`Order submitted. Confirming exchange status; do not retry.`);
					}
					toast.success(t`Close order submitted`, {
						description: formatToken(filledSize, {
							decimals: refreshedSession.position.szDecimals,
							symbol: currentMarket?.shortName ?? refreshedSession.position.coin.split(":").pop(),
						}),
					});
					actions.updatePhase(input.sessionId, "idle");
					actions.close(input.sessionId);
				},
			);
			if (!lockResult.supported) {
				throw new Error(t`Safe order coordination across tabs is unavailable in this browser.`);
			}
			if (!lockResult.acquired) {
				throw new Error(t`Another order for this market is still being confirmed.`);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : t`Failed to close position`;
			const activeSession = getPositionMarketCloseModal();
			if (activeSession?.sessionId === input.sessionId) {
				actions.updatePhase(input.sessionId, "idle");
				actions.setError(input.sessionId, message);
			}
			toast.error(message);
		} finally {
			executionContextRef.current = null;
		}
	}

	function resetError(): void {
		const currentSession = getPositionMarketCloseModal();
		if (currentSession) getPositionMarketCloseActions().setError(currentSession.sessionId, null);
		trackedOrder.reset();
	}

	return {
		submit,
		isPending: session?.phase === "validating" || session?.phase === "submitting",
		isReconciling: session?.phase === "reconciling",
		error: session?.error ?? trackedOrder.error?.message ?? null,
		resetError,
	};
}

function assertSessionIdentity(
	session: PositionMarketCloseSession,
	clientKey: string,
	env: "Mainnet" | "Testnet",
): void {
	if (clientKey === "disconnected" || clientKey.toLowerCase() !== session.owner || env !== session.env) {
		throw new Error(t`Trading data changed while this dialog was open. Close and reopen it before submitting.`);
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
		throw new Error(t`Trading data changed while this dialog was open. Close and reopen it before submitting.`);
	}
	assertMarketAssetBinding(session, market, market.ctxIndex);
	if (market.kind === "builderPerp" && !hasAcceptedHip3Disclaimer()) {
		throw new Error(t`Accept the HIP-3 deployer disclaimer before trading this market.`);
	}
	if (userPositions.isLoading || userPositions.hasError || userPositions.isStale) {
		throw new Error(t`Failed to load positions.`);
	}
	assertNoActiveTwap(session, live);

	const position = userPositions.getPosition(session.position.coin, session.position.dex);
	const currentSize = toBig(position?.szi);
	const openedSize = toBig(session.position.signedPositionSize);
	if (!position || !currentSize || currentSize.eq(0) || !openedSize || openedSize.eq(0)) {
		throw new Error(t`No active positions.`);
	}
	if (currentSize.gt(0) !== openedSize.gt(0)) {
		throw new Error(t`Trading data changed while this dialog was open. Close and reopen it before submitting.`);
	}
}

function assertNoActiveTwap(session: PositionMarketCloseSession, live: LiveContext): void {
	if (live.activeTwaps.status !== "active" || live.activeTwaps.isStale || live.activeTwaps.data === undefined) {
		throw new Error(t`Trading data changed while this dialog was open. Close and reopen it before submitting.`);
	}
	if (live.activeTwaps.data.states.some(([, state]) => state.coin === session.position.coin)) {
		throw new Error(t`Another order for this market is still being confirmed.`);
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
	if (resolution.errors.length > 0) throw new Error(getPositionMarketCloseErrorMessage(resolution.errors[0]));
	return resolution;
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
		throw new Error(t`Trading data changed while this dialog was open. Close and reopen it before submitting.`);
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
	const closeSize = toBig(execution.closeSize);
	if (
		!currentSize ||
		!expectedSize ||
		!closeSize ||
		currentSize.gt(0) !== expectedSize.gt(0) ||
		currentSize.abs().lt(closeSize) ||
		currentPosition?.leverage.type !== execution.marginMode
	) {
		throw new Error(t`Trading data changed while this dialog was open. Close and reopen it before submitting.`);
	}
}

function assertOrderMatchesExecution(params: ExchangeParams<"order">, execution: ExecutionContext): void {
	if (params.grouping !== execution.grouping || params.orders.length !== 1) {
		throw new Error(t`Trading data changed while this dialog was open. Close and reopen it before submitting.`);
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
		throw new Error(t`Trading data changed while this dialog was open. Close and reopen it before submitting.`);
	}
}

async function fetchFreshCloseSnapshot(
	session: PositionMarketCloseSession,
	expectedMarket: UnifiedMarket | undefined,
	info: ReturnType<typeof useHyperliquid>["info"],
): Promise<FreshCloseSnapshot> {
	const [accountState, marketData] = await Promise.all([
		info.clearinghouseState({ user: session.owner as `0x${string}`, dex: session.position.dex }),
		info.metaAndAssetCtxs({ dex: session.position.dex }),
	]);
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
		throw new Error(t`Trading data changed while this dialog was open. Close and reopen it before submitting.`);
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
		throw new Error(t`No active positions.`);
	}

	return {
		signedPositionSize: position.szi,
		referencePx: String(referencePx),
		marginMode: position.leverage.type,
	};
}

function assertMarketAssetBinding(
	session: PositionMarketCloseSession,
	market: UnifiedMarket | undefined,
	contextIndex: number,
): void {
	if (!market || market.ctxIndex !== contextIndex || market.kind === "spot") {
		throw new Error(t`Trading data changed while this dialog was open. Close and reopen it before submitting.`);
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
		throw new Error(t`Trading data changed while this dialog was open. Close and reopen it before submitting.`);
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
