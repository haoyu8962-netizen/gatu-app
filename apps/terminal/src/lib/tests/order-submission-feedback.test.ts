import { describe, expect, it } from "vitest";
import { EntryExecutionError } from "@/domain/trade/order/entry-execution-guard";
import { OrderTrackingInputError } from "@/domain/trade/order-tracking";
import { SpotSwapExecutionError } from "@/domain/trade/spot-swap-execution-guard";
import { TwapOrderDetailsError } from "@/domain/trade/twap-details";
import { getOrderPlanSubmissionFeedback, getOrderSubmissionFeedback } from "@/lib/trade/order-submission-feedback";

describe("order submission feedback", () => {
	it.each([
		[new EntryExecutionError("mark-price-unavailable"), "live-trading-data-unavailable"],
		[new EntryExecutionError("position-data-unavailable"), "live-position-unavailable"],
		[new EntryExecutionError("slippage-limit-exceeded"), "order-conditions-changed"],
		[new EntryExecutionError("reduce-only-position-changed"), "reduce-only-position-changed"],
		[new EntryExecutionError("twap-duration-invalid"), "twap-minutes-range"],
		[new EntryExecutionError("twap-notional-too-small"), "twap-min-notional"],
		[new SpotSwapExecutionError("balance-changed"), "balance-changed"],
		[new SpotSwapExecutionError("balance-unavailable"), "live-trading-data-unavailable"],
		[new SpotSwapExecutionError("quote-changed"), "order-conditions-changed"],
		[new TwapOrderDetailsError(), "order-conditions-changed"],
		[new OrderTrackingInputError("secure-random-unavailable"), "secure-random-unavailable"],
	] as const)("maps internal execution failures to stable localized feedback", (error, code) => {
		expect(getOrderSubmissionFeedback(error)).toEqual({ kind: "order-submission", code });
	});

	it("maps known plan errors without persisting the current locale", () => {
		expect(getOrderPlanSubmissionFeedback("Order market precision is invalid")).toEqual({
			kind: "order-submission",
			code: "market-precision-invalid",
		});
		expect(getOrderPlanSubmissionFeedback("Enter a valid scale price range")).toEqual({
			kind: "order-submission",
			code: "scale-price-range",
		});
		expect(getOrderPlanSubmissionFeedback("Unexpected internal plan text")).toEqual({
			kind: "order-submission",
			code: "order-conditions-changed",
		});
	});
});
