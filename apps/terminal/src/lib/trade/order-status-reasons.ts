import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { formatExchangeErrorText } from "@/lib/errors/exchange-error-text";
import type { Translate } from "@/lib/translate";

/**
 * Reasons for the rejected and canceled Hyperliquid order statuses (`OrderProcessingStatus` in the
 * SDK). The wording follows the official terminal's status tooltips.
 */
const STATUS_REASONS: Readonly<Record<string, MessageDescriptor>> = {
	badAloPxRejected: msg`Rejected because the Post Only order would have matched immediately`,
	badTriggerPxRejected: msg`Rejected due to an invalid TP/SL price`,
	insufficientSpotBalanceRejected: msg`Rejected due to insufficient spot balance`,
	iocCancelRejected: msg`Rejected because the IOC order could not match`,
	marketOrderNoLiquidityRejected: msg`Rejected due to a lack of liquidity for the market order`,
	minTradeNtlRejected: msg`Rejected because the order value is below the minimum`,
	openInterestIncreaseRejected: msg`Rejected because open interest would increase too quickly`,
	oracleRejected: msg`Rejected because the price is too far from the oracle price`,
	perpMarginRejected: msg`Rejected due to insufficient margin`,
	perpMaxPositionRejected: msg`Rejected because it exceeds the maximum position size at the current leverage`,
	positionFlipAtOpenInterestCapRejected: msg`Rejected due to the open interest cap`,
	positionIncreaseAtOpenInterestCapRejected: msg`Rejected due to the open interest cap`,
	reduceOnlyRejected: msg`Rejected because a Reduce Only order would increase the position`,
	rejected: msg`Rejected`,
	tickRejected: msg`Rejected due to an invalid tick price`,
	tooAggressiveAtOpenInterestCapRejected: msg`Rejected because the price is too aggressive at the open interest cap`,
	tooManyOpenOrdersRejected: msg`Rejected due to too many open orders`,
	canceled: msg`Canceled`,
	delistedCanceled: msg`Canceled because the asset was delisted`,
	internalCancel: msg`Canceled by the exchange`,
	liquidatedCanceled: msg`Canceled due to liquidation`,
	marginCanceled: msg`Canceled due to insufficient margin`,
	openInterestCapCanceled: msg`Canceled due to the open interest cap`,
	outcomeSettledCanceled: msg`Canceled because the outcome has settled`,
	reduceOnlyCanceled: msg`Canceled due to Reduce Only`,
	scheduledCancel: msg`Canceled by the scheduled cancel`,
	selfTradeCanceled: msg`Canceled by self-trade prevention`,
	siblingFilledCanceled: msg`Canceled because the linked order filled`,
	vaultWithdrawalCanceled: msg`Canceled due to a vault withdrawal`,
};

export function describeOrderStatusReason(status: string): MessageDescriptor | null {
	return Object.hasOwn(STATUS_REASONS, status) ? STATUS_REASONS[status] : null;
}

/**
 * Renders a per-order error line: an order status code from reconciliation, or an exchange
 * rejection text (translated when known, otherwise unchanged).
 */
export function formatOrderChildError(error: string, translate: Translate): string {
	const reason = describeOrderStatusReason(error);
	return reason ? translate(reason) : formatExchangeErrorText(error, translate);
}
