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
	limitPrice: OpenOrderModifyTarget | null;
}

type OpenOrderModifyFormField = "size" | "triggerPrice" | "limitPrice";

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
	limitPrice?: string;
}

export interface ReadyOpenOrderModifyFormPlan {
	status: "ready";
	params: ExchangeParams<"batchModify">;
	normalizedSize: string;
	normalizedTriggerPrice: string | null;
	normalizedLimitPrice: string | null;
}

export type OpenOrderModifyFormPlan =
	| ReadyOpenOrderModifyFormPlan
	| {
			status: "blocked";
			reason: OpenOrderModifyBlockReason;
			field: OpenOrderModifyFormField | null;
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

function blocked(reason: OpenOrderModifyBlockReason, field: OpenOrderModifyFormField | null): OpenOrderModifyFormPlan {
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

	let limitPrice: OpenOrderModifyTarget | null = null;
	if (capabilities.limitPrice.supported) {
		const limit = createOpenOrderModifyTarget({ ...params, field: "limitPrice" });
		if (limit.status === "blocked") return limit;
		limitPrice = limit.target;
	}

	return { status: "ready", target: { size: size.target, triggerPrice, limitPrice } };
}

export function buildOpenOrderModifyFormPlan(params: BuildOpenOrderModifyFormPlanParams): OpenOrderModifyFormPlan {
	const sizeChanged = !numericValuesEqual(params.size, params.target.size.order.sz);
	const triggerChanged =
		params.target.triggerPrice !== null &&
		!numericValuesEqual(params.triggerPrice ?? "", params.target.triggerPrice.order.triggerPx);
	const limitChanged =
		params.target.limitPrice !== null &&
		params.limitPrice !== undefined &&
		!numericValuesEqual(params.limitPrice, params.target.limitPrice.order.limitPx);

	if (!sizeChanged && !triggerChanged && !limitChanged) return blocked("no-change", null);

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

	const limitPlan =
		limitChanged && params.target.limitPrice
			? buildOpenOrderModifyPlan({
					target: params.target.limitPrice,
					session: params.session,
					snapshot: params.snapshot,
					market: params.market,
					value: params.limitPrice ?? "",
				})
			: null;
	if (limitPlan?.status === "blocked") return blocked(limitPlan.reason, "limitPrice");

	const readySizePlan = sizePlan?.status === "ready" ? sizePlan : null;
	const readyTriggerPlan = triggerPlan?.status === "ready" ? triggerPlan : null;
	const readyLimitPlan = limitPlan?.status === "ready" ? limitPlan : null;
	const basePlan = readyTriggerPlan ?? readyLimitPlan ?? readySizePlan;
	if (!basePlan) return blocked("no-change", null);

	const baseModify = basePlan.params.modifies[0];
	if (!baseModify) return blocked("order-changed", null);
	let order = baseModify.order;
	if (readySizePlan && readySizePlan !== basePlan) {
		const sizeModify = readySizePlan.params.modifies[0];
		if (!sizeModify || sizeModify.oid !== baseModify.oid) return blocked("order-changed", null);
		order = { ...order, s: sizeModify.order.s };
	}
	if (readyLimitPlan && readyLimitPlan !== basePlan) {
		const limitModify = readyLimitPlan.params.modifies[0];
		if (!limitModify || limitModify.oid !== baseModify.oid) return blocked("order-changed", null);
		order = { ...order, p: limitModify.order.p };
	}

	return {
		status: "ready",
		params: { modifies: [{ oid: baseModify.oid, order }] },
		normalizedSize: readySizePlan?.normalizedValue ?? params.target.size.order.sz,
		normalizedTriggerPrice:
			params.target.triggerPrice === null
				? null
				: (readyTriggerPlan?.normalizedValue ?? params.target.triggerPrice.order.triggerPx),
		normalizedLimitPrice:
			params.target.limitPrice === null
				? null
				: (readyLimitPlan?.normalizedValue ?? params.target.limitPrice.order.limitPx),
	};
}
