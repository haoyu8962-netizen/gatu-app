/** @vitest-environment jsdom */

import type { HistoricalOrdersResponse } from "@nktkas/hyperliquid";
import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useOrderDisplayLabels } from "@/hooks/trade/use-order-display-labels";
import { createI18nRoot } from "./harness/react";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

type HistoricalOrderStatus = HistoricalOrdersResponse[number]["status"];

const CANCELED_WITH_REASON = [
	"vaultWithdrawalCanceled",
	"openInterestCapCanceled",
	"selfTradeCanceled",
	"reduceOnlyCanceled",
	"siblingFilledCanceled",
	"delistedCanceled",
	"liquidatedCanceled",
	"outcomeSettledCanceled",
	"scheduledCancel",
	"internalCancel",
] as const satisfies readonly HistoricalOrderStatus[];

const REJECTED_WITH_REASON = [
	"tickRejected",
	"minTradeNtlRejected",
	"perpMarginRejected",
	"reduceOnlyRejected",
	"badAloPxRejected",
	"iocCancelRejected",
	"badTriggerPxRejected",
	"marketOrderNoLiquidityRejected",
	"positionIncreaseAtOpenInterestCapRejected",
	"positionFlipAtOpenInterestCapRejected",
	"tooAggressiveAtOpenInterestCapRejected",
	"openInterestIncreaseRejected",
	"insufficientSpotBalanceRejected",
	"oracleRejected",
	"perpMaxPositionRejected",
	"tooManyOpenOrdersRejected",
] as const satisfies readonly HistoricalOrderStatus[];

const PLAIN = ["open", "filled", "canceled", "triggered", "rejected", "marginCanceled"] as const;

type UnlistedStatus = Exclude<
	HistoricalOrderStatus,
	(typeof CANCELED_WITH_REASON)[number] | (typeof REJECTED_WITH_REASON)[number] | (typeof PLAIN)[number]
>;
const everyStatusListed: [UnlistedStatus] extends [never] ? true : false = true;

let labels: ReturnType<typeof useOrderDisplayLabels> | null = null;

function Probe() {
	labels = useOrderDisplayLabels();
	return null;
}

function historicalOrder(status: HistoricalOrderStatus, sz = "0.0") {
	return { status, statusTimestamp: 1, order: { sz } } as unknown as HistoricalOrdersResponse[number];
}

describe("historical order status presentation", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		act(() => root.render(<Probe />));
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		labels = null;
	});

	it("covers every status the SDK can return", () => {
		expect(everyStatusListed).toBe(true);
		expect(CANCELED_WITH_REASON.length + REJECTED_WITH_REASON.length + PLAIN.length).toBe(32);
	});

	it("folds canceled and rejected statuses into one label each with their own reason, as the official terminal does", () => {
		for (const status of CANCELED_WITH_REASON) {
			const presentation = labels?.getHistoricalOrderStatusPresentation(historicalOrder(status));
			expect(presentation?.label, status).toBe("Canceled");
			expect(presentation?.reason, status).toMatch(/^Canceled /);
		}
		for (const status of REJECTED_WITH_REASON) {
			const presentation = labels?.getHistoricalOrderStatusPresentation(historicalOrder(status));
			expect(presentation?.label, status).toBe("Rejected");
			expect(presentation?.reason, status).toMatch(/^Rejected /);
		}
		for (const [status, reason] of [
			["vaultWithdrawalCanceled", "Canceled due to a vault withdrawal"],
			["siblingFilledCanceled", "Canceled because the linked order filled"],
			["iocCancelRejected", "Rejected because the IOC order could not match"],
			["tooManyOpenOrdersRejected", "Rejected due to too many open orders"],
		] as const) {
			expect(labels?.getHistoricalOrderStatusPresentation(historicalOrder(status))?.reason).toBe(reason);
		}
	});

	it("names margin cancellations and partial fills, and gives plain statuses no reason", () => {
		expect(labels?.getHistoricalOrderStatusPresentation(historicalOrder("marginCanceled"))).toEqual({
			label: "Margin Canceled",
			reason: "Canceled due to insufficient margin",
		});
		expect(labels?.getHistoricalOrderStatusPresentation(historicalOrder("filled", "0.5"))).toEqual({
			label: "Partially filled",
			reason: null,
		});
		for (const [status, label] of [
			["filled", "Filled"],
			["open", "Open"],
			["triggered", "Triggered"],
			["canceled", "Canceled"],
			["rejected", "Rejected"],
		] as const) {
			expect(labels?.getHistoricalOrderStatusPresentation(historicalOrder(status))).toEqual({ label, reason: null });
		}
		expect(labels?.getHistoricalOrderStatusPresentation(historicalOrder("open", "0.5"))?.label).toBe("Open");
		expect(labels?.getHistoricalOrderStatusPresentation(historicalOrder("filled", "bad"))?.label).toBe("Filled");
	});
});
