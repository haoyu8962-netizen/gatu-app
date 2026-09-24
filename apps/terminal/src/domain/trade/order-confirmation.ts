import { i18n, type MessageDescriptor } from "@lingui/core";
import { msg, t } from "@lingui/core/macro";
import { FALLBACK_VALUE_PLACEHOLDER } from "@/config/app";
import { type LimitTif, ORDER_TYPE_MESSAGES, type OrderType } from "@/config/trade";
import type { OrderFeeQuote } from "@/domain/trade/order-fee-quote";
import { formatDuration, formatPrice, formatToken } from "@/lib/format";
import type { MarginMode } from "@/lib/trade/margin-mode";
import { isPositive } from "@/lib/trade/numbers";
import {
	isScaleOrderType,
	isTriggerOrderType,
	isTwapOrderType,
	usesLimitPrice as usesLimitPriceForOrder,
} from "@/lib/trade/order-types";
import { getTifOptionLabel } from "@/lib/trade/tif";
import { getTwapStopPriceLabel } from "@/lib/trade/twap-labels";
import type { Side } from "@/lib/trade/types";
import { formatPriceForOrder, formatSizeForOrder } from "./orders";

export type OrderConfirmationTone = "up" | "down";

export interface OrderConfirmationRow {
	key: string;
	label: string;
	value: string;
	tone?: OrderConfirmationTone;
}

export interface OrderConfirmationDraft {
	assetId: number;
	marketLabel: string;
	marketKind: "perp" | "spot";
	isLeveraged: boolean;
	side: Side;
	orderType: OrderType;
	tif: LimitTif;
	baseToken: string;
	szDecimals: number | undefined;
	sizeValue: number;
	sizeForOrder?: string;
	orderValue: number;
	limitPrice: number | null;
	triggerPrice: number | null;
	scaleStartPrice: number | null;
	scaleEndPrice: number | null;
	scaleLevels: number | null;
	scaleSkew: number | null;
	twapMinutes: number | null;
	twapRandomize: boolean;
	twapTriggerPrice: number | null;
	twapStopPrice: number | null;
	tpSlEnabled: boolean;
	tpPrice: number | null;
	slPrice: number | null;
	reduceOnly: boolean;
	leverage: number | null;
	marginMode: MarginMode;
	marginRequired: number | null;
	feeQuote: OrderFeeQuote;
	liqPrice: number | null;
	liqWarning: boolean;
	slippagePercent: number;
}

export function buildOrderConfirmationRows(
	draft: OrderConfirmationDraft,
	translate: (message: MessageDescriptor) => string = translateOrderMessage,
): OrderConfirmationRow[] {
	const tone: OrderConfirmationTone = draft.side === "buy" ? "up" : "down";
	return [
		{ key: "action", label: t`Action`, value: getOrderConfirmationSideLabel(draft, translate), tone },
		...getOrderTypeRows(draft, translate),
		{ key: "size", label: t`Size`, value: getSizeValue(draft), tone },
		...getPriceRows(draft, translate),
		...getTpSlRows(draft),
		...getReduceOnlyRows(draft),
		...getLiquidationRows(draft),
	];
}

function translateOrderMessage(message: MessageDescriptor): string {
	return i18n._(message);
}

export function getOrderConfirmationSideLabel(
	draft: Pick<OrderConfirmationDraft, "marketKind" | "side">,
	translate: (message: MessageDescriptor) => string = translateOrderMessage,
): string {
	if (draft.marketKind === "spot") return translate(draft.side === "buy" ? msg`Buy` : msg`Sell`);
	return translate(draft.side === "buy" ? msg`Long` : msg`Short`);
}

export function getOrderConfirmationSubmitLabel(
	draft: Pick<OrderConfirmationDraft, "marketKind" | "side">,
	translate: (message: MessageDescriptor) => string = translateOrderMessage,
): string {
	if (draft.marketKind === "spot") return getOrderConfirmationSideLabel(draft, translate);
	return translate(draft.side === "buy" ? msg`Buy / Long` : msg`Sell / Short`);
}

function getOrderTypeRows(
	draft: OrderConfirmationDraft,
	translate: (message: MessageDescriptor) => string,
): OrderConfirmationRow[] {
	if (draft.orderType === "market") return [];
	const label = translate(ORDER_TYPE_MESSAGES[draft.orderType]);
	if (draft.orderType !== "limit") return [{ key: "orderType", label: t`Type`, value: label }];
	if (draft.tif === "Gtc") return [];
	const tifLabel = getTifOptionLabel(draft.tif, translate(msg`Post Only`));
	return [{ key: "orderType", label: t`Type`, value: `${label} · ${tifLabel}` }];
}

function getMarketExecutionLabel(): string {
	return t({ message: "Market", context: "Order type" });
}

function getSizeValue(draft: OrderConfirmationDraft): string {
	if (!isPositive(draft.sizeValue)) return FALLBACK_VALUE_PLACEHOLDER;
	const submittedSize = formatSizeForOrder(draft.sizeForOrder ?? draft.sizeValue, draft.szDecimals ?? 0);
	return formatToken(submittedSize, { decimals: draft.szDecimals, symbol: draft.baseToken });
}

function getPriceRows(
	draft: OrderConfirmationDraft,
	translate: (message: MessageDescriptor) => string,
): OrderConfirmationRow[] {
	if (isTwapOrderType(draft.orderType)) return getTwapPriceRows(draft, translate);
	if (isScaleOrderType(draft.orderType)) return getScalePriceRows(draft);
	if (isTriggerOrderType(draft.orderType)) return getTriggerPriceRows(draft);
	if (usesLimitPriceForOrder(draft.orderType)) {
		return [{ key: "price", label: t`Price`, value: formatSubmittedPrice(draft, draft.limitPrice) }];
	}
	return [{ key: "price", label: t`Price`, value: getMarketExecutionLabel() }];
}

function getTwapPriceRows(
	draft: OrderConfirmationDraft,
	translate: (message: MessageDescriptor) => string,
): OrderConfirmationRow[] {
	const rows: OrderConfirmationRow[] = [
		{ key: "price", label: t`Price`, value: getMarketExecutionLabel() },
		{ key: "twapRuntime", label: t`Runtime`, value: getRuntimeValue(draft.twapMinutes) },
		{ key: "twapRandomize", label: t`Randomize timing`, value: draft.twapRandomize ? t`Yes` : t`No` },
	];
	if (isPositive(draft.twapTriggerPrice)) {
		rows.push({
			key: "twapTrigger",
			label: t`Trigger Price`,
			value: formatSubmittedPrice(draft, draft.twapTriggerPrice),
		});
	}
	if (isPositive(draft.twapStopPrice)) {
		rows.push({
			key: "twapStop",
			label: getTwapStopPriceLabel(draft.side, { buy: translate(msg`Max Price`), sell: translate(msg`Min Price`) }),
			value: formatSubmittedPrice(draft, draft.twapStopPrice),
		});
	}
	return rows;
}

function getScalePriceRows(draft: OrderConfirmationDraft): OrderConfirmationRow[] {
	return [
		{ key: "scaleStart", label: t`Start Price`, value: formatSubmittedPrice(draft, draft.scaleStartPrice) },
		{ key: "scaleEnd", label: t`End Price`, value: formatSubmittedPrice(draft, draft.scaleEndPrice) },
		{ key: "scaleLevels", label: t`Number of Orders`, value: formatCount(draft.scaleLevels) },
		{ key: "scaleSkew", label: t`Size Skew`, value: formatCount(draft.scaleSkew) },
	];
}

function getTriggerPriceRows(draft: OrderConfirmationDraft): OrderConfirmationRow[] {
	const limitRow: OrderConfirmationRow = usesLimitPriceForOrder(draft.orderType)
		? { key: "price", label: t`Price`, value: formatSubmittedPrice(draft, draft.limitPrice) }
		: { key: "price", label: t`Price`, value: getMarketExecutionLabel() };
	return [
		{ key: "trigger", label: t`Trigger Price`, value: formatSubmittedPrice(draft, draft.triggerPrice) },
		limitRow,
	];
}

function getTpSlRows(draft: OrderConfirmationDraft): OrderConfirmationRow[] {
	if (!draft.tpSlEnabled) return [];
	const rows: OrderConfirmationRow[] = [];
	if (isPositive(draft.tpPrice)) {
		rows.push({ key: "takeProfit", label: t`Take Profit`, value: formatSubmittedPrice(draft, draft.tpPrice) });
	}
	if (isPositive(draft.slPrice)) {
		rows.push({ key: "stopLoss", label: t`Stop Loss`, value: formatSubmittedPrice(draft, draft.slPrice) });
	}
	return rows;
}

function getReduceOnlyRows(draft: OrderConfirmationDraft): OrderConfirmationRow[] {
	if (!draft.reduceOnly) return [];
	return [{ key: "reduceOnly", label: t`Reduce Only`, value: t`Yes` }];
}

function getLiquidationRows(draft: OrderConfirmationDraft): OrderConfirmationRow[] {
	if (!draft.isLeveraged) return [];
	return [
		{
			key: "liqPrice",
			label: t`Estimated Liquidation Price`,
			value: formatEstimatedPrice(draft, draft.liqPrice),
			tone: draft.liqWarning && isPositive(draft.liqPrice) ? "down" : undefined,
		},
	];
}

function getRuntimeValue(minutes: number | null): string {
	if (!isPositive(minutes)) return FALLBACK_VALUE_PLACEHOLDER;
	return formatDuration(Math.round(minutes));
}

function formatCount(value: number | null): string {
	if (!isPositive(value)) return FALLBACK_VALUE_PLACEHOLDER;
	return String(value);
}

function formatSubmittedPrice(draft: OrderConfirmationDraft, value: number | null): string {
	if (!isPositive(value)) return FALLBACK_VALUE_PLACEHOLDER;
	const submitted = formatPriceForOrder(value, { assetId: draft.assetId, szDecimals: draft.szDecimals ?? 0 });
	return formatEstimatedPrice(draft, Number(submitted));
}

function formatEstimatedPrice(draft: OrderConfirmationDraft, value: number | null): string {
	if (!isPositive(value)) return FALLBACK_VALUE_PLACEHOLDER;
	return formatPrice(value, { szDecimals: draft.szDecimals, marketType: draft.marketKind });
}
