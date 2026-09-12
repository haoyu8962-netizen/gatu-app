import { i18n, type MessageDescriptor } from "@lingui/core";
import { msg, t } from "@lingui/core/macro";
import { FALLBACK_VALUE_PLACEHOLDER } from "@/config/app";
import { type LimitTif, ORDER_TYPE_MESSAGES, type OrderType } from "@/config/trade";
import { formatOrderFeeRatePercent, type OrderFeeQuote } from "@/domain/trade/order-fee-quote";
import { formatDuration, formatPrice, formatToken, formatUSD } from "@/lib/format";
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
	marginRequired: number;
	feeQuote: OrderFeeQuote;
	liqPrice: number | null;
	liqWarning: boolean;
	slippagePercent: number;
}

export function buildOrderConfirmationRows(
	draft: OrderConfirmationDraft,
	translate: (message: MessageDescriptor) => string = translateOrderMessage,
): OrderConfirmationRow[] {
	return [
		{ key: "market", label: t`Market`, value: draft.marketLabel },
		{
			key: "side",
			label: t`Side`,
			value: getOrderConfirmationSideLabel(draft, translate),
			tone: draft.side === "buy" ? "up" : "down",
		},
		{ key: "orderType", label: t`Type`, value: getOrderTypeValue(draft, translate) },
		{ key: "size", label: t`Size`, value: getSizeValue(draft) },
		...getPriceRows(draft, translate),
		...getTpSlRows(draft),
		...getReduceOnlyRows(draft),
		...getLeverageRows(draft),
		{ key: "orderValue", label: t`Order Value`, value: formatAmount(draft.orderValue) },
		...getMarginRows(draft),
		...getFeeRows(draft),
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

function getOrderTypeValue(draft: OrderConfirmationDraft, translate: (message: MessageDescriptor) => string): string {
	const label = translate(ORDER_TYPE_MESSAGES[draft.orderType]);
	if (draft.orderType !== "limit") return label;
	return `${label} · ${getTifOptionLabel(draft.tif, translate(msg`Post Only`))}`;
}

function getMarketExecutionLabel(): string {
	return t({ message: "Market", context: "Order type" });
}

function getSizeValue(draft: OrderConfirmationDraft): string {
	if (!isPositive(draft.sizeValue)) return FALLBACK_VALUE_PLACEHOLDER;
	const submittedSize = formatSizeForOrder(draft.sizeValue, draft.szDecimals ?? 0);
	const size = formatToken(submittedSize, { decimals: draft.szDecimals, symbol: draft.baseToken });
	if (!isPositive(draft.orderValue)) return size;
	return `${size} (${formatUSD(draft.orderValue, { compact: false })})`;
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
	return [
		{ key: "price", label: t`Price`, value: getMarketExecutionLabel() },
		{ key: "slippage", label: t`Slippage`, value: `${draft.slippagePercent}%` },
	];
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

function getLeverageRows(draft: OrderConfirmationDraft): OrderConfirmationRow[] {
	if (!draft.isLeveraged) return [];
	const marginLabel = draft.marginMode === "isolated" ? t`Isolated` : t`Cross`;
	const leverageLabel = isPositive(draft.leverage) ? `${draft.leverage}x` : FALLBACK_VALUE_PLACEHOLDER;
	return [{ key: "leverage", label: t`Leverage`, value: `${marginLabel} · ${leverageLabel}` }];
}

function getMarginRows(draft: OrderConfirmationDraft): OrderConfirmationRow[] {
	if (!draft.isLeveraged) return [];
	return [
		{ key: "marginRequired", label: t`Margin Req.`, value: formatAmount(draft.marginRequired) },
		{
			key: "liqPrice",
			label: t`Liq. Price`,
			value: formatEstimatedPrice(draft, draft.liqPrice),
			tone: draft.liqWarning && isPositive(draft.liqPrice) ? "down" : undefined,
		},
	];
}

function getFeeRows(draft: OrderConfirmationDraft): OrderConfirmationRow[] {
	return [{ key: "fee", label: t`Est. Fee`, value: getTotalFeeValue(draft) }];
}

function getTotalFeeValue(draft: OrderConfirmationDraft): string {
	const rate = formatOrderFeeRatePercent(draft.feeQuote.totalRate);
	if (!isPositive(draft.feeQuote.orderValue)) return rate;
	return `${rate} (${formatUSD(draft.feeQuote.totalAmount)})`;
}

function getRuntimeValue(minutes: number | null): string {
	if (!isPositive(minutes)) return FALLBACK_VALUE_PLACEHOLDER;
	return formatDuration(Math.round(minutes));
}

function formatAmount(value: number): string {
	if (!isPositive(value)) return FALLBACK_VALUE_PLACEHOLDER;
	return formatUSD(value, { compact: false });
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
