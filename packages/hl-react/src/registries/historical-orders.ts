import type { HistoricalOrdersResponse } from "@nktkas/hyperliquid";

type HistoricalOrderSnapshot = Pick<HistoricalOrdersResponse[number], "status" | "statusTimestamp">;
type HistoricalOrderStatus = HistoricalOrderSnapshot["status"];

const STATUS_PHASE = {
	open: 0,
	triggered: 1,
	filled: 2,
	canceled: 2,
	rejected: 2,
	marginCanceled: 2,
	vaultWithdrawalCanceled: 2,
	openInterestCapCanceled: 2,
	selfTradeCanceled: 2,
	reduceOnlyCanceled: 2,
	siblingFilledCanceled: 2,
	delistedCanceled: 2,
	liquidatedCanceled: 2,
	scheduledCancel: 2,
	outcomeSettledCanceled: 2,
	internalCancel: 2,
	tickRejected: 2,
	minTradeNtlRejected: 2,
	perpMarginRejected: 2,
	reduceOnlyRejected: 2,
	badAloPxRejected: 2,
	iocCancelRejected: 2,
	badTriggerPxRejected: 2,
	marketOrderNoLiquidityRejected: 2,
	positionIncreaseAtOpenInterestCapRejected: 2,
	positionFlipAtOpenInterestCapRejected: 2,
	tooAggressiveAtOpenInterestCapRejected: 2,
	openInterestIncreaseRejected: 2,
	insufficientSpotBalanceRejected: 2,
	oracleRejected: 2,
	perpMaxPositionRejected: 2,
	tooManyOpenOrdersRejected: 2,
} as const satisfies Record<HistoricalOrderStatus, 0 | 1 | 2>;

export function shouldReplaceHistoricalOrder(
	existing: HistoricalOrderSnapshot,
	incoming: HistoricalOrderSnapshot,
): boolean {
	if (incoming.statusTimestamp !== existing.statusTimestamp) {
		return incoming.statusTimestamp > existing.statusTimestamp;
	}

	const existingPhase = STATUS_PHASE[existing.status];
	const incomingPhase = STATUS_PHASE[incoming.status];
	if (incomingPhase !== existingPhase) {
		return incomingPhase > existingPhase;
	}

	return incoming.status === existing.status;
}
