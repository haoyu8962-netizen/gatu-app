import { i18n } from "@lingui/core";
import { describe, expect, it } from "vitest";
import { EntryExecutionError } from "@/domain/trade/order/entry-execution-guard";
import { OrderTrackingInputError } from "@/domain/trade/order-tracking";
import { SpotSwapExecutionError } from "@/domain/trade/spot-swap-execution-guard";
import { TwapOrderDetailsError } from "@/domain/trade/twap-details";
import {
	formatOrderSubmissionFeedback,
	getDefaultOrderSubmissionFeedbackMessage,
	getOrderPlanSubmissionFeedback,
	getOrderSubmissionFeedback,
	orderSubmissionFeedback,
} from "@/lib/trade/order-submission-feedback";

const OPEN_INTEREST_CAP_COPY =
	"The limit order would be canceled after resting because open interest is capped. Use market orders to close positions.";

describe("order submission feedback", () => {
	it.each([
		[new EntryExecutionError("mark-price-unavailable"), "live-trading-data-unavailable"],
		[new EntryExecutionError("position-data-unavailable"), "live-position-unavailable"],
		[new EntryExecutionError("slippage-limit-exceeded"), "order-conditions-changed"],
		[new EntryExecutionError("reduce-only-position-changed"), "reduce-only-position-changed"],
		[new EntryExecutionError("open-interest-capped"), "open-interest-capped"],
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

	it("translates the open-interest cap rejection at render time with the validator copy", () => {
		const feedback = orderSubmissionFeedback("open-interest-capped");
		const descriptors: unknown[] = [];
		const english = formatOrderSubmissionFeedback(feedback, (descriptor) => {
			descriptors.push(descriptor);
			return i18n._(descriptor);
		});
		const descriptor = descriptors[0] as { id: string };

		expect(new EntryExecutionError("open-interest-capped").message).toBe(OPEN_INTEREST_CAP_COPY);
		expect(getDefaultOrderSubmissionFeedbackMessage(feedback)).toBe(OPEN_INTEREST_CAP_COPY);
		expect(english).toBe(OPEN_INTEREST_CAP_COPY);

		i18n.loadAndActivate({ locale: "zh", messages: { [descriptor.id]: "未平仓量已达上限" } });
		try {
			expect(formatOrderSubmissionFeedback(feedback, (next) => i18n._(next))).toBe("未平仓量已达上限");
		} finally {
			i18n.loadAndActivate({ locale: "en", messages: {} });
		}
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
