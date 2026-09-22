import type { ExchangeExecutionGuard, HyperliquidExchangeSessionLease } from "@gatu/hl-react";
import { type LimitTif, type OrderType, TWAP_MINUTES_MAX, TWAP_MINUTES_MIN } from "@/config/trade";
import { getOrderExecutionSummary, type OrderExecutionSummary } from "@/domain/trade/order-execution-summary";
import { buildOrderPlan } from "@/domain/trade/order-intent";
import { isOrderBatchResolutionError, type TrackedOrderParams } from "@/domain/trade/order-tracking";
import { formatPriceForOrder, formatSizeForOrder, throwIfResponseError } from "@/domain/trade/orders";
import { buildTwapOrderDetails } from "@/domain/trade/twap-details";
import { useHyperliquid } from "@/lib/hyperliquid";
import { deriveOrderOutcome, extractStatusErrors } from "@/lib/trade/extract-order-status";
import type { MarginMode } from "@/lib/trade/margin-mode";
import { isPositive, toBig } from "@/lib/trade/numbers";
import {
	getOrderPlanSubmissionFeedback,
	getOrderSubmissionFeedback,
	orderSubmissionFeedback,
} from "@/lib/trade/order-submission-feedback";
import type { Side } from "@/lib/trade/types";
import {
	getOrderEntryDraftResetToken,
	type OrderEntryDraftResetToken,
	useOrderEntryActions,
} from "@/stores/use-order-entry-store";
import { useOrderQueueActions } from "@/stores/use-order-queue-store";
import { useTrackedOrder } from "./use-tracked-order";
import { useTrackedTwapOrder } from "./use-tracked-twap-order";

interface SubmitMarket {
	assetId: number;
	kind: "spot" | "perp";
	name: string;
	szDecimals?: number;
}

export interface OrderSubmitDraftResetToken {
	orderEntry: OrderEntryDraftResetToken;
	exchangeSession: HyperliquidExchangeSessionLease;
}

export interface OrderSubmitInput {
	draftResetToken: OrderSubmitDraftResetToken;
	market: SubmitMarket;
	baseToken: string;
	quoteToken?: string;
	side: Side;
	orderType: OrderType;
	sizeValue: number;
	sizeForOrder?: string;
	price: number;
	executionReferencePx: number;
	markPx: number;
	marginMode: MarginMode;
	slippageBps: number;
	reduceOnly: boolean;
	tif: LimitTif;
	limitPriceInput: string;
	triggerPriceInput: string;
	scaleStartPriceInput: string;
	scaleEndPriceInput: string;
	scaleLevelsNum: number | null;
	scaleSkewInput: string;
	twapMinutesNum: number | null;
	twapRandomize: boolean;
	twapAdvancedEnabled: boolean;
	twapTriggerPx: string | null;
	twapStopPx: string | null;
	tpSlEnabled: boolean;
	canUseTpSl: boolean;
	tpPriceNum: number | null;
	slPriceNum: number | null;
	twapOrder: boolean;
	scaleOrder: boolean;
	triggerOrder: boolean;
}

/**
 * The price fields an order-entry surface must re-read at submit time. Everything else in
 * `OrderSubmitInput` is user intent that must stay frozen once a confirmation is shown.
 */
export type OrderSubmitLivePrices = Pick<OrderSubmitInput, "price" | "executionReferencePx" | "markPx">;

export type OrderSubmitDraftInput = Omit<OrderSubmitInput, keyof OrderSubmitLivePrices>;

interface UseOrderSubmitResult {
	captureDraftResetToken: () => OrderSubmitDraftResetToken | null;
	isDraftResetTokenCurrent: (token: OrderSubmitDraftResetToken) => boolean;
	handleSubmit: (input: OrderSubmitInput) => Promise<void>;
	isSubmitting: boolean;
}

interface UseOrderSubmitOptions {
	executionGuard?: ExchangeExecutionGuard<"order">;
	twapExecutionGuard?: ExchangeExecutionGuard<"twapOrder">;
	/**
	 * Runs wherever the shared order-entry store is reset, so a surface that keeps part of its
	 * form outside that store (the mobile panel holds size and reduce-only locally)
	 * clears exactly on the outcomes that clear the store.
	 */
	onReset?: () => void;
}

type QueueOrderType = "twap" | "scale" | "trigger" | "limit" | "market";

function getQueueOrderType(input: OrderSubmitInput): QueueOrderType {
	if (input.twapOrder) return "twap";
	if (input.scaleOrder) return "scale";
	if (input.triggerOrder) return "trigger";
	if (input.orderType === "limit") return "limit";
	return "market";
}

export function useOrderSubmit(options: UseOrderSubmitOptions = {}): UseOrderSubmitResult {
	const { exchangeSession, clientKey, sessionMode, env } = useHyperliquid();
	const { submitOrder, isPending: isSubmittingOrder } = useTrackedOrder({ executionGuard: options.executionGuard });
	const { submitTwap, isPending: isSubmittingTwap } = useTrackedTwapOrder({
		executionGuard: options.twapExecutionGuard,
	});
	const { addOrder, updateOrder } = useOrderQueueActions();
	const { resetFormIfCurrent } = useOrderEntryActions();

	const isSubmitting = isSubmittingOrder || isSubmittingTwap;

	function captureDraftResetToken(): OrderSubmitDraftResetToken | null {
		if (clientKey === "disconnected" || sessionMode === "disconnected" || !exchangeSession.active) return null;
		return { exchangeSession, orderEntry: getOrderEntryDraftResetToken() };
	}

	function isExchangeSessionCurrent(token: OrderSubmitDraftResetToken) {
		return (
			exchangeSession.active &&
			token?.exchangeSession === exchangeSession &&
			clientKey !== "disconnected" &&
			sessionMode !== "disconnected"
		);
	}

	function isDraftResetTokenCurrent(token: OrderSubmitDraftResetToken) {
		if (!isExchangeSessionCurrent(token)) return false;
		const current = getOrderEntryDraftResetToken();
		return (
			current.marketIdentity === token.orderEntry.marketIdentity &&
			current.draftRevision === token.orderEntry.draftRevision
		);
	}

	function resetSubmittedForm(token: OrderSubmitDraftResetToken) {
		if (isExchangeSessionCurrent(token) && resetFormIfCurrent(token.orderEntry)) options.onReset?.();
	}

	async function handleSubmit(input: OrderSubmitInput) {
		if (!isDraftResetTokenCurrent(input.draftResetToken)) return;
		const {
			draftResetToken,
			market,
			baseToken,
			side,
			orderType,
			sizeValue,
			price,
			executionReferencePx,
			markPx,
			marginMode,
			slippageBps,
			reduceOnly,
			tif,
			limitPriceInput,
			triggerPriceInput,
			scaleStartPriceInput,
			scaleEndPriceInput,
			scaleLevelsNum,
			scaleSkewInput,
			twapMinutesNum,
			twapRandomize,
			twapAdvancedEnabled,
			twapTriggerPx,
			twapStopPx,
			tpSlEnabled,
			canUseTpSl,
			tpPriceNum,
			slPriceNum,
			twapOrder,
		} = input;

		const szDecimals = market.szDecimals ?? 0;
		const formattedSize = formatSizeForOrder(input.sizeForOrder ?? sizeValue, szDecimals);
		const formattedPrice = formatPriceForOrder(price, { assetId: market.assetId, szDecimals });
		const riskContext =
			market.kind === "spot" ? ({ marketKind: "spot" } as const) : ({ marketKind: "perp", marginMode } as const);

		const hasTp = tpSlEnabled && canUseTpSl && isPositive(tpPriceNum);
		const hasSl = tpSlEnabled && canUseTpSl && isPositive(slPriceNum);

		const orderId = addOrder({
			owner: clientKey,
			env,
			market: baseToken,
			quoteToken: input.quoteToken,
			side,
			size: formattedSize,
			price: formattedPrice,
			orderType: getQueueOrderType(input),
			tpPrice: hasTp ? formatPriceForOrder(tpPriceNum ?? 0, { assetId: market.assetId, szDecimals }) : undefined,
			slPrice: hasSl ? formatPriceForOrder(slPriceNum ?? 0, { assetId: market.assetId, szDecimals }) : undefined,
			status: "pending",
		});

		try {
			if (twapOrder) {
				const minutes = twapMinutesNum;
				if (
					minutes === null ||
					!Number.isSafeInteger(minutes) ||
					minutes < TWAP_MINUTES_MIN ||
					minutes > TWAP_MINUTES_MAX
				) {
					updateOrder(orderId, {
						status: "failed",
						error: orderSubmissionFeedback("twap-minutes-range"),
					});
					return;
				}
				const details = buildTwapOrderDetails({
					triggerPx: twapAdvancedEnabled && toBig(twapTriggerPx)?.gt(0) ? twapTriggerPx : null,
					stopPx: twapAdvancedEnabled && toBig(twapStopPx)?.gt(0) ? twapStopPx : null,
					markPx,
				});
				const submission = await submitTwap(
					{
						twap: {
							a: market.assetId,
							b: side === "buy",
							s: formattedSize,
							r: reduceOnly,
							m: minutes,
							t: twapRandomize,
						},
						...(details ? { details } : {}),
					},
					{ coin: market.name, queueId: orderId, riskContext },
				);
				if (submission.state === "blocked") {
					updateOrder(orderId, {
						status: "failed",
						error:
							submission.reason === "pending"
								? orderSubmissionFeedback("blocked-twap")
								: orderSubmissionFeedback("twap-state-unavailable"),
					});
					return;
				}
				if (submission.state === "reconciling") {
					resetSubmittedForm(draftResetToken);
					return;
				}
				throwIfResponseError(submission.result.response?.data?.status);
				updateOrder(orderId, { status: "success", outcome: "twapStarted" });
			} else {
				const plan = buildOrderPlan({
					kind: "entry",
					assetId: market.assetId,
					side,
					orderType,
					sizeValue: input.sizeForOrder ?? sizeValue,
					szDecimals,
					markPx: executionReferencePx,
					price,
					slippageBps,
					reduceOnly,
					tif,
					limitPriceInput,
					triggerPriceInput,
					scaleStartPriceInput,
					scaleEndPriceInput,
					scaleLevelsNum,
					scaleSkewInput,
					tpSlEnabled,
					canUseTpSl,
					tpPriceNum,
					slPriceNum,
				});

				if (plan.errors.length > 0) {
					updateOrder(orderId, { status: "failed", error: getOrderPlanSubmissionFeedback(plan.errors[0]) });
					return;
				}

				let execution: OrderExecutionSummary | undefined;
				function updateExecution(response: unknown, orders: TrackedOrderParams["orders"]) {
					execution = getOrderExecutionSummary(orders, response, input.scaleOrder ? orders.length : 1);
					if (execution) updateOrder(orderId, { execution });
				}
				const submission = await submitOrder(
					{ orders: plan.orders, grouping: plan.grouping },
					{ queueId: orderId, riskContext, onResponse: updateExecution },
				);
				if (submission.state === "blocked") {
					updateOrder(orderId, {
						status: "failed",
						error: orderSubmissionFeedback("blocked-order"),
					});
					return;
				}
				if (submission.state === "reconciling") {
					resetSubmittedForm(draftResetToken);
					return;
				}

				const statuses = submission.result.response?.data?.statuses ?? [];
				const errors = extractStatusErrors(statuses);

				if (errors.length > 0) {
					updateOrder(orderId, { status: "failed", error: errors.join("; ") });
				} else {
					updateOrder(orderId, {
						status: execution?.completeness === "partial" ? "partial" : "success",
						outcome: deriveOrderOutcome(statuses),
					});
				}
			}

			resetSubmittedForm(draftResetToken);
		} catch (error) {
			if (isOrderBatchResolutionError(error)) {
				const { resolution } = error;
				if (resolution.status === "partial") {
					updateOrder(orderId, {
						status: "partial",
						acceptedCount: resolution.acceptedCount,
						totalCount: resolution.totalCount,
						error: resolution.errors.join("; ") || undefined,
					});
					resetSubmittedForm(draftResetToken);
					return;
				}
				updateOrder(orderId, {
					status: "failed",
					error: resolution.errors.join("; ") || orderSubmissionFeedback("exchange-order-rejected"),
				});
				return;
			}
			const errorMessage =
				getOrderSubmissionFeedback(error) ??
				(error instanceof Error ? error.message : orderSubmissionFeedback("order-failed"));
			updateOrder(orderId, { status: "failed", error: errorMessage });
		}
	}

	return { captureDraftResetToken, isDraftResetTokenCurrent, handleSubmit, isSubmitting };
}
