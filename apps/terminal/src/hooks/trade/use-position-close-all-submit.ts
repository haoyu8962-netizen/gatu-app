import { useLingui } from "@lingui/react/macro";
import { type MutableRefObject, useEffect, useRef, useState } from "react";
import { HL_ALL_DEXS } from "@/config/app";
import type { ExchangeOrder } from "@/config/trade";
import { getPositionDex } from "@/domain/market";
import { isLiveExecutionPriceReceiptFresh } from "@/domain/trade/market-price";
import { buildOrderPlan } from "@/domain/trade/order-intent";
import { isOrderBatchResolutionError, resolveOrderBatchResponse } from "@/domain/trade/order-tracking";
import {
	getPositionCloseAllQuoteSymbol,
	getPositionCloseAllSnapshotKey,
	POSITION_CLOSE_ALL_SNAPSHOT_MAX_AGE_MS,
	type PositionCloseAllSnapshot,
	type PositionCloseAllTarget,
} from "@/domain/trade/position-close-all";
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
	getPositionMarketClosePlanFeedback,
	localizedPositionSubmitFeedback,
	localizePositionSubmitFeedbackCause,
	type PositionSubmitFeedback,
	PositionSubmitFeedbackCause,
	partialCloseAllFeedback,
	positionSubmitFeedbackCause,
	positionSubmitFeedbackFromCause,
} from "@/lib/trade/position-submit-feedback";
import { useMarketOrderSlippageBpsString } from "@/stores/use-global-settings-store";
import { hasAcceptedHip3Disclaimer } from "@/stores/use-hip3-disclaimer-store";
import { getPersistedPendingOrderAssetState } from "@/stores/use-pending-order-store";
import { getPersistedPendingTwapAssetState } from "@/stores/use-pending-twap-store";

export type PositionCloseAllSubmitPhase = "idle" | "validating" | "submitting" | "reconciling" | "partial";

export type PositionCloseAllSubmitOutcome =
	| TrackedOrderResult
	| {
			state: "partial";
			acceptedCount: number;
			rejectedCount: number;
			totalCount: number;
	  };

interface FreshCloseTarget extends PositionCloseAllTarget {
	referencePx: string;
	priceReceivedAt: number;
}

interface ExecutionContext {
	lifecycleEpoch: number;
	snapshotKey: string;
	owner: string;
	env: "Mainnet" | "Testnet";
	freshTargets: FreshCloseTarget[];
	expectedOrders: ExchangeOrder[];
	grouping: "na";
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

export function usePositionCloseAllSubmit(snapshot: PositionCloseAllSnapshot) {
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
	const [phase, setPhaseState] = useState<PositionCloseAllSubmitPhase>("idle");
	const [error, setError] = useState<PositionSubmitFeedback | null>(null);
	const phaseRef = useRef<PositionCloseAllSubmitPhase>("idle");
	const snapshotRef = useRef(snapshot);
	const slippageBpsRef = useRef(slippageBps);
	const liveContextRef = useRef<LiveContext>({ clientKey, env, markets, userPositions, activeTwaps });
	const executionContextRef = useRef<ExecutionContext | null>(null);
	const lifecycleRef = useRef({ mounted: false, epoch: 0 });
	snapshotRef.current = snapshot;
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

	function setPhase(nextPhase: PositionCloseAllSubmitPhase): void {
		phaseRef.current = nextPhase;
		if (lifecycleRef.current.mounted) setPhaseState(nextPhase);
	}

	function assertLifecycleActive(epoch: number): void {
		if (!lifecycleRef.current.mounted || lifecycleRef.current.epoch !== epoch) throw tradingDataChangedError();
	}

	function assertExecutionContext(params: ExchangeParams<"order">): void {
		const execution = executionContextRef.current;
		if (!execution || phaseRef.current !== "submitting") throw tradingDataChangedError();
		assertLifecycleActive(execution.lifecycleEpoch);

		const currentSnapshot = snapshotRef.current;
		const live = liveContextRef.current;
		if (
			getPositionCloseAllSnapshotKey(currentSnapshot) !== execution.snapshotKey ||
			live.env !== execution.env ||
			live.clientKey === "disconnected" ||
			live.clientKey.toLowerCase() !== execution.owner
		) {
			throw tradingDataChangedError();
		}

		assertLiveSnapshotReady(currentSnapshot, live);
		assertFreshTargetsMatchLive(execution.freshTargets, live);
		if (execution.freshTargets.some((target) => !isLiveExecutionPriceReceiptFresh(target.priceReceivedAt))) {
			throw tradingDataChangedError();
		}
		assertOrdersMatchExecution(params, execution);
	}

	const trackedOrder = useTrackedOrder({ executionGuard: assertExecutionContext });

	async function submit(): Promise<PositionCloseAllSubmitOutcome> {
		if (phaseRef.current !== "idle") return { state: "blocked" };
		const lifecycleEpoch = lifecycleRef.current.epoch;
		assertLifecycleActive(lifecycleEpoch);

		setPhase("validating");
		setError(null);
		executionContextRef.current = null;
		const submittedSnapshot = cloneSnapshot(snapshotRef.current);
		const submittedSnapshotKey = getPositionCloseAllSnapshotKey(submittedSnapshot);
		const submittedSlippageBps = slippageBpsRef.current;
		const assetIds = submittedSnapshot.targets.map((target) => target.assetId);

		try {
			assertSnapshotFresh(submittedSnapshot);
			const lockResult = await runWithAvailableOrderAssetLocks(
				{ env: submittedSnapshot.env, owner: submittedSnapshot.owner, assetIds },
				async (assetLockLease) => {
					assertSnapshotIsCurrent(lifecycleEpoch, submittedSnapshotKey, submittedSnapshot);
					const liveBeforeRefresh = liveContextRef.current;
					assertSessionIdentity(submittedSnapshot, liveBeforeRefresh.clientKey, liveBeforeRefresh.env);
					assertLiveSnapshotReady(submittedSnapshot, liveBeforeRefresh);
					assertNoPendingCoordination(assetLockLease, submittedSnapshot);

					const freshTargets = await fetchFreshCloseTargets(submittedSnapshot, liveBeforeRefresh.markets, info);

					assertSnapshotIsCurrent(lifecycleEpoch, submittedSnapshotKey, submittedSnapshot);
					const liveAfterRefresh = liveContextRef.current;
					assertSessionIdentity(submittedSnapshot, liveAfterRefresh.clientKey, liveAfterRefresh.env);
					assertLiveSnapshotReady(submittedSnapshot, liveAfterRefresh);
					assertFreshTargetsMatchLive(freshTargets, liveAfterRefresh);
					assertNoPendingCoordination(assetLockLease, submittedSnapshot);

					const orders = buildCloseOrders(freshTargets, submittedSlippageBps);
					executionContextRef.current = {
						lifecycleEpoch,
						snapshotKey: submittedSnapshotKey,
						owner: submittedSnapshot.owner,
						env: submittedSnapshot.env,
						freshTargets,
						expectedOrders: orders,
						grouping: "na",
					};
					assertLifecycleActive(lifecycleEpoch);
					setPhase("submitting");

					const outcome = await trackedOrder.submitOrder(
						{ orders, grouping: "na" },
						{
							assetLockLease,
							riskContext: { marketKind: "perp", marginMode: getBatchMarginMode(freshTargets) },
							exclusiveAssetLock: true,
							confirmationMode: "filled",
							finalConfirmation: async () =>
								confirmCloseTargetsAreFlat({
									lifecycleEpoch,
									snapshot: submittedSnapshot,
									freshTargets,
									info,
									assertLifecycleActive,
									liveContextRef,
								}),
						},
					);
					assertLifecycleActive(lifecycleEpoch);
					if (outcome.state === "blocked") {
						setPhase("idle");
						setError(localizedPositionSubmitFeedback("blocked-markets"));
						return outcome;
					}
					if (outcome.state === "reconciling") {
						setPhase("reconciling");
						setError(localizedPositionSubmitFeedback("reconciling-close-orders"));
						return outcome;
					}

					const resolution = resolveOrderBatchResponse(
						{ response: outcome.result.response },
						submittedSnapshot.targets.length,
					);
					if (resolution?.status === "partial") {
						setPhase("partial");
						return { ...resolution, state: "partial" as const };
					}
					if (resolution?.status === "rejected") {
						if (resolution.errors[0]) throw new Error(resolution.errors[0]);
						throw positionSubmitFeedbackCause("close-orders-rejected");
					}

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
				setError(localizedPositionSubmitFeedback("blocked-markets"));
				return { state: "blocked" };
			}
			return lockResult.value;
		} catch (cause) {
			if (isOrderBatchResolutionError(cause) && cause.resolution.status === "partial") {
				const result = { state: "partial", ...cause.resolution } as const;
				if (lifecycleRef.current.mounted && lifecycleRef.current.epoch === lifecycleEpoch) {
					setPhase("partial");
					setError(partialCloseAllFeedback(result.acceptedCount, result.totalCount));
				}
				return result;
			}

			const submitError = positionSubmitFeedbackFromCause(cause, "failed-submit-close-orders");
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

	function assertSnapshotIsCurrent(
		lifecycleEpoch: number,
		snapshotKey: string,
		submittedSnapshot: PositionCloseAllSnapshot,
	): void {
		assertLifecycleActive(lifecycleEpoch);
		if (
			phaseRef.current !== "validating" ||
			getPositionCloseAllSnapshotKey(snapshotRef.current) !== snapshotKey ||
			getPositionCloseAllSnapshotKey(submittedSnapshot) !== snapshotKey
		) {
			throw tradingDataChangedError();
		}
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
		isPartial: phase === "partial",
		error: error
			? formatPositionSubmitFeedback(error, (descriptor) => i18n._(descriptor))
			: formatTrackedPositionSubmitError(trackedOrder.error, (descriptor) => i18n._(descriptor)),
		resetError,
	};
}

function cloneSnapshot(snapshot: PositionCloseAllSnapshot): PositionCloseAllSnapshot {
	return {
		...snapshot,
		targets: snapshot.targets.map((target) => ({ ...target })),
		summaryTotals: snapshot.summaryTotals.map((total) => ({ ...total })),
	};
}

function assertSnapshotFresh(snapshot: PositionCloseAllSnapshot): void {
	const ageMs = Date.now() - snapshot.capturedAtMs;
	if (!Number.isFinite(snapshot.capturedAtMs) || ageMs < 0 || ageMs > POSITION_CLOSE_ALL_SNAPSHOT_MAX_AGE_MS) {
		throw positionSubmitFeedbackCause("close-all-preview-expired");
	}
}

interface ConfirmCloseTargetsAreFlatInput {
	lifecycleEpoch: number;
	snapshot: PositionCloseAllSnapshot;
	freshTargets: readonly FreshCloseTarget[];
	info: ReturnType<typeof useHyperliquid>["info"];
	assertLifecycleActive: (epoch: number) => void;
	liveContextRef: MutableRefObject<LiveContext>;
}

async function confirmCloseTargetsAreFlat({
	lifecycleEpoch,
	snapshot,
	freshTargets,
	info,
	assertLifecycleActive,
	liveContextRef,
}: ConfirmCloseTargetsAreFlatInput): Promise<boolean> {
	assertLifecycleActive(lifecycleEpoch);
	assertSessionIdentity(snapshot, liveContextRef.current.clientKey, liveContextRef.current.env);
	const targetsByDex = new Map<string, FreshCloseTarget[]>();
	for (const target of freshTargets) {
		const targets = targetsByDex.get(target.dex) ?? [];
		targets.push(target);
		targetsByDex.set(target.dex, targets);
	}

	const confirmations = await Promise.all(
		Array.from(targetsByDex, async ([dex, targets]) => {
			const state = await info.clearinghouseState({ user: snapshot.owner as `0x${string}`, dex });
			return targets.every((target) => {
				const position = state.assetPositions.find((entry) => entry.position.coin === target.coin)?.position;
				const size = toBig(position?.szi ?? "0");
				return size?.eq(0) === true;
			});
		}),
	);

	assertLifecycleActive(lifecycleEpoch);
	assertSessionIdentity(snapshot, liveContextRef.current.clientKey, liveContextRef.current.env);
	return confirmations.every(Boolean);
}

function assertSessionIdentity(
	snapshot: PositionCloseAllSnapshot,
	clientKey: string,
	env: "Mainnet" | "Testnet",
): void {
	if (clientKey === "disconnected" || clientKey.toLowerCase() !== snapshot.owner || env !== snapshot.env) {
		throw tradingDataChangedError();
	}
}

function assertLiveSnapshotReady(snapshot: PositionCloseAllSnapshot, live: LiveContext): void {
	if (live.markets.isLoading || live.markets.error) throw tradingDataChangedError();
	if (live.userPositions.isLoading || live.userPositions.hasError || live.userPositions.isStale) {
		throw positionSubmitFeedbackCause("failed-load-positions");
	}
	if (live.activeTwaps.status !== "active" || live.activeTwaps.isStale || live.activeTwaps.data === undefined) {
		throw tradingDataChangedError();
	}

	const expectedKeys = new Set(snapshot.targets.map(getTargetMarketKey));
	const liveKeys = new Set(live.userPositions.positions.map((position) => `${position.dex}:${position.coin}`));
	if (expectedKeys.size !== liveKeys.size || [...expectedKeys].some((key) => !liveKeys.has(key))) {
		throw tradingDataChangedError();
	}

	for (const target of snapshot.targets) {
		const market = live.markets.getMarket(target.coin);
		if (
			!market ||
			market.kind === "spot" ||
			market.assetId !== target.assetId ||
			market.szDecimals !== target.szDecimals ||
			getPositionDex(market) !== target.dex ||
			getPositionCloseAllQuoteSymbol(market) !== target.quoteSymbol
		) {
			throw tradingDataChangedError();
		}
		assertMarketAssetBinding(target, market, market.ctxIndex);
		if (market.kind === "builderPerp" && !hasAcceptedHip3Disclaimer()) {
			throw positionSubmitFeedbackCause("accept-hip3-markets");
		}

		const position = live.userPositions.getPosition(target.coin, target.dex);
		const liveSize = toBig(position?.szi);
		const confirmedSize = toBig(target.signedPositionSize);
		if (
			!position ||
			!liveSize ||
			!confirmedSize ||
			liveSize.eq(0) ||
			!liveSize.eq(confirmedSize) ||
			position.leverage.type !== target.marginMode
		) {
			throw tradingDataChangedError();
		}
	}

	if (live.activeTwaps.data.states.some(([, state]) => snapshot.targets.some((target) => target.coin === state.coin))) {
		throw positionSubmitFeedbackCause("active-twap");
	}
}

function assertFreshTargetsMatchLive(freshTargets: readonly FreshCloseTarget[], live: LiveContext): void {
	for (const fresh of freshTargets) {
		const position = live.userPositions.getPosition(fresh.coin, fresh.dex);
		const liveSize = toBig(position?.szi);
		const freshSize = toBig(fresh.signedPositionSize);
		if (
			!position ||
			!liveSize ||
			!freshSize ||
			liveSize.eq(0) ||
			!liveSize.eq(freshSize) ||
			position.leverage.type !== fresh.marginMode
		) {
			throw tradingDataChangedError();
		}
	}
}

function assertNoPendingCoordination(lease: OrderAssetLockLease, snapshot: PositionCloseAllSnapshot): void {
	const assetIds = snapshot.targets.map((target) => target.assetId);
	const reservationState = getOrderAssetReservationState(lease, {
		intentKey: `position-close-all:${getPositionCloseAllSnapshotKey(snapshot)}`,
		exclusiveAssetLock: true,
		isRiskReducing: true,
	});
	const pendingOrderState = getPersistedPendingOrderAssetState(snapshot.env, snapshot.owner, assetIds);
	const pendingTwapStates = snapshot.targets.map((target) =>
		getPersistedPendingTwapAssetState(snapshot.env, snapshot.owner, target.assetId),
	);
	if (
		reservationState === "unavailable" ||
		pendingOrderState === "unavailable" ||
		pendingTwapStates.some((state) => state === "unavailable")
	) {
		throw positionSubmitFeedbackCause("coordination-unavailable");
	}
	if (
		reservationState === "conflict" ||
		pendingOrderState === "pending" ||
		pendingTwapStates.some((state) => state === "pending")
	) {
		throw positionSubmitFeedbackCause("blocked-markets");
	}
}

async function fetchFreshCloseTargets(
	snapshot: PositionCloseAllSnapshot,
	markets: ReturnType<typeof useMarkets>,
	info: ReturnType<typeof useHyperliquid>["info"],
): Promise<FreshCloseTarget[]> {
	const targetsByDex = new Map<string, PositionCloseAllTarget[]>();
	for (const target of snapshot.targets) {
		const current = targetsByDex.get(target.dex) ?? [];
		current.push(target);
		targetsByDex.set(target.dex, current);
	}

	const results = await Promise.all(
		Array.from(targetsByDex, async ([dex, targets]) => {
			const [accountState, marketSnapshot] = await Promise.all([
				info.clearinghouseState({ user: snapshot.owner as `0x${string}`, dex }),
				info.metaAndAssetCtxs({ dex }).then((data) => ({ data, priceReceivedAt: performance.now() })),
			]);
			const marketData = marketSnapshot.data;
			const [meta, assetContexts] = marketData;
			const expectedCoins = new Set(targets.map((target) => target.coin));
			const freshPositionCoins = accountState.assetPositions
				.filter((entry) => toBig(entry.position.szi)?.abs().gt(0))
				.map((entry) => entry.position.coin);
			if (
				freshPositionCoins.length !== expectedCoins.size ||
				freshPositionCoins.some((coin) => !expectedCoins.has(coin))
			) {
				throw tradingDataChangedError();
			}

			return targets.map((target): FreshCloseTarget => {
				const marketIndex = meta.universe.findIndex((asset) => asset.name === target.coin);
				const metadata = meta.universe[marketIndex];
				const context = assetContexts[marketIndex];
				const midPx = toBig(context?.midPx);
				const markPx = toBig(context?.markPx);
				const referencePx = midPx?.gt(0) ? context?.midPx : markPx?.gt(0) ? context?.markPx : undefined;
				if (marketIndex < 0 || !metadata || metadata.szDecimals !== target.szDecimals || !context || !referencePx) {
					throw tradingDataChangedError();
				}
				assertMarketAssetBinding(target, markets.getMarket(target.coin), marketIndex, meta.collateralToken);

				const position = accountState.assetPositions.find((entry) => entry.position.coin === target.coin)?.position;
				const freshSize = toBig(position?.szi);
				const confirmedSize = toBig(target.signedPositionSize);
				if (
					!position ||
					!freshSize ||
					!confirmedSize ||
					freshSize.eq(0) ||
					!freshSize.eq(confirmedSize) ||
					position.leverage.type !== target.marginMode
				) {
					throw tradingDataChangedError();
				}

				return {
					...target,
					signedPositionSize: position.szi,
					referencePx,
					priceReceivedAt: marketSnapshot.priceReceivedAt,
				};
			});
		}),
	);

	return results.flat().sort((left, right) => left.assetId - right.assetId || left.dex.localeCompare(right.dex));
}

function buildCloseOrders(freshTargets: readonly FreshCloseTarget[], slippageBps: string): ExchangeOrder[] {
	return freshTargets.map((target) => {
		const plan = buildOrderPlan({
			kind: "marketClose",
			assetId: target.assetId,
			signedPositionSize: target.signedPositionSize,
			closeSize: toBig(target.signedPositionSize)?.abs().toString() ?? "0",
			szDecimals: target.szDecimals,
			referencePx: target.referencePx,
			slippageBps,
		});
		if (plan.errors.length > 0 || plan.orders.length !== 1) {
			throw new PositionSubmitFeedbackCause(
				plan.errors[0]
					? getPositionMarketClosePlanFeedback(plan.errors[0])
					: localizedPositionSubmitFeedback("failed-build-close-order"),
			);
		}
		return plan.orders[0];
	});
}

function assertMarketAssetBinding(
	target: PositionCloseAllTarget,
	market: UnifiedMarket | undefined,
	contextIndex: number,
	collateralToken?: number,
): void {
	if (
		!market ||
		market.ctxIndex !== contextIndex ||
		market.kind === "spot" ||
		getPositionCloseAllQuoteSymbol(market) !== target.quoteSymbol
	) {
		throw tradingDataChangedError();
	}
	const parsedAssetId = parseAssetId(target.assetId);
	const isValidMainPerp =
		market.kind === "perp" && parsedAssetId.kind === "perp" && parsedAssetId.index === contextIndex;
	const isValidBuilderPerp =
		market.kind === "builderPerp" &&
		parsedAssetId.kind === "builderPerp" &&
		parsedAssetId.index === contextIndex &&
		parsedAssetId.dexIndex === market.dexIndex &&
		(collateralToken === undefined || market.quoteToken?.index === collateralToken);
	if (!isValidMainPerp && !isValidBuilderPerp) throw tradingDataChangedError();
}

function assertOrdersMatchExecution(params: ExchangeParams<"order">, execution: ExecutionContext): void {
	if (params.grouping !== execution.grouping || params.orders.length !== execution.expectedOrders.length) {
		throw tradingDataChangedError();
	}
	for (let index = 0; index < execution.expectedOrders.length; index += 1) {
		const order = params.orders[index];
		const expected = execution.expectedOrders[index];
		if (
			!order ||
			!expected ||
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
}

function getBatchMarginMode(targets: readonly FreshCloseTarget[]): "cross" | "isolated" | "mixed" {
	const modes = new Set(targets.map((target) => target.marginMode));
	if (modes.size > 1) return "mixed";
	return targets[0]?.marginMode ?? "cross";
}

function getTargetMarketKey(target: PositionCloseAllTarget): string {
	return `${target.dex}:${target.coin}`;
}

function tradingDataChangedError(): Error {
	return positionSubmitFeedbackCause("positions-changed");
}
