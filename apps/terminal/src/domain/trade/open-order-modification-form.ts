import {
	buildOpenOrderModifyPlan,
	createOpenOrderModifyTarget,
	getOpenOrderModifyCapabilities,
	type OpenOrderModifyBlockReason,
	type OpenOrderModifyMarketBinding,
	type OpenOrderModifySessionBinding,
	type OpenOrderModifySnapshot,
	type OpenOrderModifyTarget,
} from "@/domain/trade/open-order-modification";
import type { ExchangeParams } from "@/lib/hyperliquid";
import { toBig } from "@/lib/trade/numbers";
import type { OpenOrder } from "@/lib/trade/open-orders";

export interface OpenOrderModifyFormTarget {
	size: OpenOrderModifyTarget;
	triggerPrice: OpenOrderModifyTarget | null;
}

export type CreateOpenOrderModifyFormTargetResult =
	| { status: "ready"; target: OpenOrderModifyFormTarget }
	| { status: "blocked"; reason: OpenOrderModifyBlockReason };

export interface BuildOpenOrderModifyFormPlanParams {
	target: OpenOrderModifyFormTarget;
	session: OpenOrderModifySessionBinding;
	snapshot: OpenOrderModifySnapshot;
	market: OpenOrderModifyMarketBinding;
	size: string;
	triggerPrice?: string;
}

export interface ReadyOpenOrderModifyFormPlan {
	status: "ready";
	params: ExchangeParams<"batchModify">;
	normalizedSize: string;
	normalizedTriggerPrice: string | null;
}

export type OpenOrderModifyFormPlan =
	| ReadyOpenOrderModifyFormPlan
	| {
			status: "blocked";
			reason: OpenOrderModifyBlockReason;
			field: "size" | "triggerPrice" | null;
	  };

interface CreateOpenOrderModifyFormTargetParams {
	owner: string;
	env: "Mainnet" | "Testnet";
	market: OpenOrderModifyMarketBinding;
	order: OpenOrder;
}

function numericValuesEqual(left: string, right: string): boolean {
	const leftValue = toBig(left);
	const rightValue = toBig(right);
	return leftValue !== null && rightValue !== null && leftValue.eq(rightValue);
}

function blocked(reason: OpenOrderModifyBlockReason, field: "size" | "triggerPrice" | null): OpenOrderModifyFormPlan {
	return { status: "blocked", reason, field };
}

export function createOpenOrderModifyFormTarget(
	params: CreateOpenOrderModifyFormTargetParams,
): CreateOpenOrderModifyFormTargetResult {
	const capabilities = getOpenOrderModifyCapabilities(params.order);
	if (!capabilities.size.supported || capabilities.size.reason) {
		return { status: "blocked", reason: capabilities.size.reason ?? "invalid-order-shape" };
	}

	const size = createOpenOrderModifyTarget({ ...params, field: "size" });
	if (size.status === "blocked") return size;

	let triggerPrice: OpenOrderModifyTarget | null = null;
	if (capabilities.triggerPrice.supported) {
		const trigger = createOpenOrderModifyTarget({ ...params, field: "triggerPrice" });
		if (trigger.status === "blocked") return trigger;
		triggerPrice = trigger.target;
	}

	return { status: "ready", target: { size: size.target, triggerPrice } };
}

export function buildOpenOrderModifyFormPlan(params: BuildOpenOrderModifyFormPlanParams): OpenOrderModifyFormPlan {
	const sizeChanged = !numericValuesEqual(params.size, params.target.size.order.sz);
	const triggerChanged =
		params.target.triggerPrice !== null &&
		!numericValuesEqual(params.triggerPrice ?? "", params.target.triggerPrice.order.triggerPx);

	if (!sizeChanged && !triggerChanged) return blocked("no-change", null);

	const sizePlan = sizeChanged
		? buildOpenOrderModifyPlan({
				target: params.target.size,
				session: params.session,
				snapshot: params.snapshot,
				market: params.market,
				value: params.size,
			})
		: null;
	if (sizePlan?.status === "blocked") return blocked(sizePlan.reason, "size");

	const triggerPlan = triggerChanged
		? params.target.triggerPrice
			? buildOpenOrderModifyPlan({
					target: params.target.triggerPrice,
					session: params.session,
					snapshot: params.snapshot,
					market: params.market,
					value: params.triggerPrice ?? "",
				})
			: null
		: null;
	if (triggerPlan?.status === "blocked") return blocked(triggerPlan.reason, "triggerPrice");

	const readySizePlan = sizePlan?.status === "ready" ? sizePlan : null;
	const readyTriggerPlan = triggerPlan?.status === "ready" ? triggerPlan : null;
	const basePlan = readyTriggerPlan ?? readySizePlan;
	if (!basePlan) return blocked("no-change", null);

	let nextParams = basePlan.params;
	if (readySizePlan && readyTriggerPlan) {
		const sizeModify = readySizePlan.params.modifies[0];
		const triggerModify = readyTriggerPlan.params.modifies[0];
		if (!sizeModify || !triggerModify || sizeModify.oid !== triggerModify.oid) {
			return blocked("order-changed", null);
		}
		nextParams = {
			modifies: [
				{
					oid: triggerModify.oid,
					order: { ...triggerModify.order, s: sizeModify.order.s },
				},
			],
		};
	}

	return {
		status: "ready",
		params: nextParams,
		normalizedSize: readySizePlan?.normalizedValue ?? params.target.size.order.sz,
		normalizedTriggerPrice:
			params.target.triggerPrice === null
				? null
				: (readyTriggerPlan?.normalizedValue ?? params.target.triggerPrice.order.triggerPx),
	};
}
