import type { ExchangeExecutionGuard } from "@gatu/hl-react";
import { t } from "@lingui/core/macro";
import { type LimitTif, type OrderType, TWAP_MINUTES_MAX, TWAP_MINUTES_MIN } from "@/config/trade";
import { buildOrderPlan } from "@/domain/trade/order-intent";
import { isOrderBatchResolutionError } from "@/domain/trade/order-tracking";
import { formatPriceForOrder, formatSizeForOrder, throwIfResponseError } from "@/domain/trade/orders";
import { buildTwapOrderDetails } from "@/domain/trade/twap-details";
import { formatOrderPlanError } from "@/lib/errors/format";
import { deriveOrderOutcome, extractStatusErrors } from "@/lib/trade/extract-order-status";
import type { MarginMode } from "@/lib/trade/margin-mode";
import { isPositive, toBig } from "@/lib/trade/numbers";
import type { Side } from "@/lib/trade/types";
import { useOrderEntryActions } from "@/stores/use-order-entry-store";
import { useOrderQueueActions } from "@/stores/use-order-queue-store";
import { useTrackedOrder } from "./use-tracked-order";
import { useTrackedTwapOrder } from "./use-tracked-twap-order";

interface SubmitMarket {
	assetId: number;
	kind: "spot" | "perp";
	name: string;
	szDecimals?: number;
}

export interface OrderSubmitInput {
	market: SubmitMarket;
	baseToken: string;
	side: Side;
	orderType: OrderType;
	sizeValue: number;
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
	handleSubmit: (input: OrderSubmitInput) => Promise<void>;
	isSubmitting: boolean;
}

interface UseOrderSubmitOptions {
	executionGuard?: ExchangeExecutionGuard<"order">;
	twapExecutionGuard?: ExchangeExecutionGuard<"twapOrder">;
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
	const { submitOrder, isPending: isSubmittingOrder } = useTrackedOrder({ executionGuard: options.executionGuard });
	const { submitTwap, isPending: isSubmittingTwap } = useTrackedTwapOrder({
		executionGuard: options.twapExecutionGuard,
	});
	const { addOrder, updateOrder } = useOrderQueueActions();
	const { resetForm } = useOrderEntryActions();

	const isSubmitting = isSubmittingOrder || isSubmittingTwap;

	async function handleSubmit(input: OrderSubmitInput) {
		const {
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
			twapTriggerPx,
			twapStopPx,
			tpSlEnabled,
			canUseTpSl,
			tpPriceNum,
			slPriceNum,
			twapOrder,
		} = input;

		const szDecimals = market.szDecimals ?? 0;
		const formattedSize = formatSizeForOrder(sizeValue, szDecimals);
		const formattedPrice = formatPriceForOrder(price, { assetId: market.assetId, szDecimals });
		const riskContext =
			market.kind === "spot" ? ({ marketKind: "spot" } as const) : ({ marketKind: "perp", marginMode } as const);

		const hasTp = tpSlEnabled && canUseTpSl && isPositive(tpPriceNum);
		const hasSl = tpSlEnabled && canUseTpSl && isPositive(slPriceNum);

		const orderId = addOrder({
			market: baseToken,
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
						error: t`TWAP minutes must be ${TWAP_MINUTES_MIN}-${TWAP_MINUTES_MAX}`,
					});
					return;
				}
				const details = buildTwapOrderDetails({
					triggerPx: toBig(twapTriggerPx)?.gt(0) ? twapTriggerPx : null,
					stopPx: toBig(twapStopPx)?.gt(0) ? twapStopPx : null,
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
								? t`Another TWAP order for this market is still being confirmed.`
								: t`TWAP order state is still loading. Please retry in a moment.`,
					});
					return;
				}
				if (submission.state === "reconciling") {
					resetForm();
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
					sizeValue,
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
					updateOrder(orderId, { status: "failed", error: plan.errors.map(formatOrderPlanError).join("; ") });
					return;
				}

				const submission = await submitOrder(
					{ orders: plan.orders, grouping: plan.grouping },
					{ queueId: orderId, riskContext },
				);
				if (submission.state === "blocked") {
					updateOrder(orderId, {
						status: "failed",
						error: t`Another order for this market is still being confirmed.`,
					});
					return;
				}
				if (submission.state === "reconciling") {
					resetForm();
					return;
				}

				const statuses = submission.result.response?.data?.statuses ?? [];
				const errors = extractStatusErrors(statuses);

				if (errors.length > 0) {
					updateOrder(orderId, { status: "failed", error: errors.join("; ") });
				} else {
					updateOrder(orderId, { status: "success", outcome: deriveOrderOutcome(statuses) });
				}
			}

			resetForm();
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
					resetForm();
					return;
				}
				updateOrder(orderId, {
					status: "failed",
					error: resolution.errors.join("; ") || t`The exchange did not accept the order.`,
				});
				return;
			}
			const errorMessage = error instanceof Error ? error.message : t`Order failed`;
			updateOrder(orderId, { status: "failed", error: errorMessage });
		}
	}

	return { handleSubmit, isSubmitting };
}
