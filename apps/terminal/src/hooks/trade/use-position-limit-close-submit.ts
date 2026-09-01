import { useLingui } from "@lingui/react/macro";
import { useRef, useState } from "react";
import type { ExchangeOrder } from "@/config/trade";
import { getPositionDex } from "@/domain/market";
import { buildOrderPlan } from "@/domain/trade/order-intent";
import { throwIfAnyResponseError } from "@/domain/trade/orders";
import { type TrackedOrderResult, useTrackedOrder } from "@/hooks/trade/use-tracked-order";
import {
	type ExchangeParams,
	parseAssetId,
	type UnifiedMarket,
	useHyperliquid,
	useMarkets,
	useUserPositions,
} from "@/lib/hyperliquid";
import { toBig } from "@/lib/trade/numbers";
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
import { hasAcceptedHip3Disclaimer } from "@/stores/use-hip3-disclaimer-store";

export interface PositionLimitCloseTarget {
	owner: string;
	env: "Mainnet" | "Testnet";
	coin: string;
	dex: string;
	assetId: number;
	szDecimals: number;
	signedPositionSize: string;
	marginMode: "cross" | "isolated";
}

export interface PositionLimitCloseSubmitInput {
	price: string;
	size: string;
}

export type PositionLimitCloseSubmitPhase = "idle" | "validating" | "submitting" | "reconciling";

export type PositionLimitCloseSubmitOutcome = TrackedOrderResult;

interface FreshPositionSnapshot {
	signedPositionSize: string;
	marginMode: "cross" | "isolated";
}

interface ExecutionContext {
	targetKey: string;
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
}

/**
 * Safety boundary for a reduce-only GTC limit close.
 *
 * The target must be an immutable snapshot from the moment the dialog opens. In
 * particular, owner/env/dex are deliberately explicit so an account or market
 * switch cannot silently redirect an already-open confirmation.
 */
export function usePositionLimitCloseSubmit(target: PositionLimitCloseTarget) {
	const { i18n } = useLingui();
	const { clientKey, env, info } = useHyperliquid();
	const markets = useMarkets();
	const userPositions = useUserPositions();
	const [phase, setPhaseState] = useState<PositionLimitCloseSubmitPhase>("idle");
	const [error, setError] = useState<PositionSubmitFeedback | null>(null);
	const phaseRef = useRef<PositionLimitCloseSubmitPhase>("idle");
	const targetRef = useRef(target);
	const liveContextRef = useRef<LiveContext>({ clientKey, env, markets, userPositions });
	const executionContextRef = useRef<ExecutionContext | null>(null);
	targetRef.current = target;
	liveContextRef.current = { clientKey, env, markets, userPositions };

	function setPhase(nextPhase: PositionLimitCloseSubmitPhase): void {
		phaseRef.current = nextPhase;
		setPhaseState(nextPhase);
	}
	function getPhase(): PositionLimitCloseSubmitPhase {
		return phaseRef.current;
	}

	function assertExecutionContext(params: ExchangeParams<"order">): void {
		const execution = executionContextRef.current;
		if (!execution || phaseRef.current !== "submitting") throw tradingDataChangedError();

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

		assertLivePositionReady(currentTarget, live, execution.closeSize, execution.marginMode);
		const currentPosition = live.userPositions.getPosition(currentTarget.coin, currentTarget.dex);
		const currentSize = toBig(currentPosition?.szi);
		const freshSize = toBig(execution.freshSignedPositionSize);
		if (!currentSize || !freshSize || currentSize.gt(0) !== freshSize.gt(0)) throw tradingDataChangedError();
		assertOrderMatchesExecution(params, execution);
	}

	const trackedOrder = useTrackedOrder({ executionGuard: assertExecutionContext });

	async function submit(input: PositionLimitCloseSubmitInput): Promise<PositionLimitCloseSubmitOutcome> {
		if (phaseRef.current !== "idle") return { state: "blocked" };

		const requestedPrice = toBig(input.price);
		const requestedSize = toBig(input.size);
		if (!requestedPrice || requestedPrice.lte(0)) {
			return failBeforeSubmission(localizedPositionSubmitFeedback("enter-limit-price"));
		}
		if (!requestedSize || requestedSize.lte(0)) {
			return failBeforeSubmission(localizedPositionSubmitFeedback("close-size-positive"));
		}

		setPhase("validating");
		setError(null);
		executionContextRef.current = null;
		const submittedTarget = targetRef.current;
		const submittedTargetKey = getTargetKey(submittedTarget);

		try {
			const liveBeforeRefresh = liveContextRef.current;
			assertSessionIdentity(submittedTarget, liveBeforeRefresh.clientKey, liveBeforeRefresh.env);
			assertLivePositionReady(submittedTarget, liveBeforeRefresh, input.size, submittedTarget.marginMode);

			const currentMarket = liveBeforeRefresh.markets.getMarket(submittedTarget.coin);
			const fresh = await fetchFreshPositionSnapshot(submittedTarget, currentMarket, info);
			if (getPhase() !== "validating" || getTargetKey(targetRef.current) !== submittedTargetKey) {
				throw tradingDataChangedError();
			}

			const liveAfterRefresh = liveContextRef.current;
			assertSessionIdentity(submittedTarget, liveAfterRefresh.clientKey, liveAfterRefresh.env);
			assertLivePositionReady(submittedTarget, liveAfterRefresh, input.size, fresh.marginMode);
			assertFreshSnapshotCompatibleWithRequest(submittedTarget, fresh, input.size, liveAfterRefresh);

			const freshSize = toBig(fresh.signedPositionSize);
			if (!freshSize) throw tradingDataChangedError();
			const plan = buildOrderPlan({
				kind: "limitClose",
				assetId: submittedTarget.assetId,
				size: input.size,
				szDecimals: submittedTarget.szDecimals,
				isLong: freshSize.gt(0),
				price: input.price,
			});
			if (plan.errors.length > 0 || plan.orders.length !== 1) {
				throw new PositionSubmitFeedbackCause(getLimitClosePlanError(plan.errors[0]));
			}

			const order = plan.orders[0];
			executionContextRef.current = {
				targetKey: submittedTargetKey,
				owner: submittedTarget.owner.toLowerCase(),
				env: submittedTarget.env,
				closeSize: String(order.s),
				freshSignedPositionSize: fresh.signedPositionSize,
				marginMode: fresh.marginMode,
				expectedOrder: order,
				grouping: plan.grouping,
			};
			setPhase("submitting");

			const outcome = await trackedOrder.submitOrder(
				{ orders: plan.orders, grouping: plan.grouping },
				{
					riskContext: { marketKind: "perp", marginMode: fresh.marginMode },
					exclusiveAssetLock: false,
					confirmationMode: "accepted",
				},
			);
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
		} catch (cause) {
			const submitError = positionSubmitFeedbackFromCause(cause, "failed-limit-close");
			const message = formatPositionSubmitFeedback(submitError, (descriptor) => i18n._(descriptor));
			setPhase("idle");
			setError(submitError);
			throw localizePositionSubmitFeedbackCause(cause, submitError, message);
		} finally {
			executionContextRef.current = null;
		}
	}

	function failBeforeSubmission(submitError: PositionSubmitFeedback): never {
		const message = formatPositionSubmitFeedback(submitError, (descriptor) => i18n._(descriptor));
		setError(submitError);
		throw new PositionSubmitFeedbackCause(submitError, message);
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

function assertSessionIdentity(target: PositionLimitCloseTarget, clientKey: string, env: "Mainnet" | "Testnet"): void {
	if (clientKey === "disconnected" || clientKey.toLowerCase() !== target.owner.toLowerCase() || env !== target.env) {
		throw tradingDataChangedError();
	}
}

function assertLivePositionReady(
	target: PositionLimitCloseTarget,
	live: LiveContext,
	closeSize: string,
	expectedMarginMode: "cross" | "isolated",
): void {
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
	if (live.userPositions.isLoading || live.userPositions.hasError || live.userPositions.isStale) {
		throw positionSubmitFeedbackCause("failed-load-positions");
	}

	const position = live.userPositions.getPosition(target.coin, target.dex);
	const currentSize = toBig(position?.szi);
	const openedSize = toBig(target.signedPositionSize);
	const requestedSize = toBig(closeSize);
	if (!position || !currentSize || currentSize.eq(0) || !openedSize || openedSize.eq(0)) {
		throw positionSubmitFeedbackCause("no-active-positions");
	}
	if (currentSize.gt(0) !== openedSize.gt(0)) throw tradingDataChangedError();
	if (!requestedSize || requestedSize.lte(0) || requestedSize.gt(currentSize.abs())) {
		throw positionSubmitFeedbackCause("close-size-exceeds-position");
	}
	if (position.leverage.type !== expectedMarginMode) throw tradingDataChangedError();
}

function assertFreshSnapshotCompatibleWithRequest(
	target: PositionLimitCloseTarget,
	fresh: FreshPositionSnapshot,
	closeSize: string,
	live: LiveContext,
): void {
	const freshSize = toBig(fresh.signedPositionSize);
	const requestedSize = toBig(closeSize);
	const currentSize = toBig(live.userPositions.getPosition(target.coin, target.dex)?.szi);
	if (
		!freshSize ||
		!requestedSize ||
		!currentSize ||
		freshSize.eq(0) ||
		freshSize.gt(0) !== currentSize.gt(0) ||
		requestedSize.gt(freshSize.abs()) ||
		fresh.marginMode !== target.marginMode
	) {
		throw tradingDataChangedError();
	}
}

async function fetchFreshPositionSnapshot(
	target: PositionLimitCloseTarget,
	expectedMarket: UnifiedMarket | undefined,
	info: ReturnType<typeof useHyperliquid>["info"],
): Promise<FreshPositionSnapshot> {
	const [accountState, marketData] = await Promise.all([
		info.clearinghouseState({ user: target.owner as `0x${string}`, dex: target.dex }),
		info.metaAndAssetCtxs({ dex: target.dex }),
	]);
	const [meta] = marketData;
	const marketIndex = meta.universe.findIndex((asset) => asset.name === target.coin);
	const metadata = meta.universe[marketIndex];
	if (marketIndex < 0 || !metadata || metadata.szDecimals !== target.szDecimals) throw tradingDataChangedError();
	assertMarketAssetBinding(target, expectedMarket, marketIndex);

	const position = accountState.assetPositions.find((entry) => entry.position.coin === target.coin)?.position;
	const signedPositionSize = toBig(position?.szi);
	const openedPositionSize = toBig(target.signedPositionSize);
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
		marginMode: position.leverage.type,
	};
}

function assertMarketAssetBinding(
	target: PositionLimitCloseTarget,
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

function getTargetKey(target: PositionLimitCloseTarget): string {
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

function getLimitClosePlanError(error: string | undefined): PositionSubmitFeedback {
	switch (error) {
		case "Close size is below market precision":
			return localizedPositionSubmitFeedback("close-size-below-precision");
		case "Close size must be greater than zero":
			return localizedPositionSubmitFeedback("close-size-positive");
		case "Limit price is below market precision":
		case "Limit price must be greater than zero":
			return localizedPositionSubmitFeedback("enter-limit-price");
		default:
			return localizedPositionSubmitFeedback("failed-limit-close");
	}
}
