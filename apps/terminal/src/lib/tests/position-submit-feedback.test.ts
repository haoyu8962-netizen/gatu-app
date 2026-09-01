import { describe, expect, it } from "vitest";
import { OrderTrackingInputError } from "@/domain/trade/order-tracking";
import {
	localizePositionSubmitFeedbackCause,
	PositionSubmitFeedbackCause,
	positionSubmitFeedbackFromCause,
} from "@/lib/trade/position-submit-feedback";

describe("position submission feedback", () => {
	it.each([
		["secure-random-unavailable", "secure-random-unavailable"],
		["order-request-invalid", "order-conditions-changed"],
	] as const)("maps %s tracking failures to localized feedback", (reason, code) => {
		const cause = new OrderTrackingInputError(reason);

		expect(positionSubmitFeedbackFromCause(cause, "failed-market-close")).toEqual({
			kind: "order-submission",
			code,
		});
	});

	it("wraps mapped domain errors with the localized rejection message", () => {
		const cause = new OrderTrackingInputError("secure-random-unavailable");
		const feedback = positionSubmitFeedbackFromCause(cause, "failed-reverse");

		const localizedCause = localizePositionSubmitFeedbackCause(cause, feedback, "本地化错误");

		expect(localizedCause).toBeInstanceOf(PositionSubmitFeedbackCause);
		expect(localizedCause).not.toBe(cause);
		expect(localizedCause.message).toBe("本地化错误");
	});
});
