import { createHash } from "node:crypto";
import { i18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { ApiRequestError, HttpRequestError } from "@nktkas/hyperliquid";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OrderBatchResolutionError, OrderTrackingInputError } from "@/domain/trade/order-tracking";
import { LocalizedActionError } from "@/lib/errors/localized-action-error";
import {
	formatPositionSubmitFeedback,
	formatTrackedPositionSubmitError,
	getPositionMarketClosePlanFeedback,
	localizePositionSubmitFeedbackCause,
	type PositionSubmitFeedback,
	PositionSubmitFeedbackCause,
	positionSubmitFeedbackFromCause,
} from "@/lib/trade/position-submit-feedback";
import type { Translate } from "@/lib/translate";

const translate: Translate = (descriptor) => i18n._(descriptor);

function messageId(message: string): string {
	return createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6);
}

describe("position submission feedback", () => {
	beforeEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
	});

	afterEach(() => {
		i18n.loadAndActivate({ locale: "en", messages: {} });
	});

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

	it("keeps every exchange rejection text of a rejected close batch", () => {
		const cause = new OrderBatchResolutionError({
			status: "rejected",
			totalCount: 2,
			acceptedCount: 0,
			rejectedCount: 2,
			errors: [
				{ index: 0, text: "No liquidity available for market order." },
				{ index: 1, text: "A rejection nobody documented" },
			],
		});

		const feedback = positionSubmitFeedbackFromCause(cause, "failed-submit-close-orders");

		expect(feedback).toEqual({
			kind: "exchange-error",
			entries: [
				{ index: 0, text: "No liquidity available for market order." },
				{ index: 1, text: "A rejection nobody documented" },
			],
		});
		expect(formatPositionSubmitFeedback(feedback, translate)).toBe(
			"Order 1: No liquidity is available for this market order.; Order 2: A rejection nobody documented",
		);
	});

	it("classifies SDK, transport and our own errors instead of keeping their text", () => {
		const exchangeText = "Order price too far from oracle";
		expect(
			positionSubmitFeedbackFromCause(
				new ApiRequestError({ status: "err", response: exchangeText }, exchangeText),
				"failed-reverse",
			),
		).toEqual({ kind: "exchange-error", entries: [{ text: exchangeText }] });
		expect(
			positionSubmitFeedbackFromCause(
				new HttpRequestError({ response: new Response("slow down", { status: 429 }) }),
				"failed-reverse",
			),
		).toEqual({ kind: "action-error", code: "rate-limited" });
		expect(
			positionSubmitFeedbackFromCause(new LocalizedActionError(msg`Position data is unavailable`), "failed-reverse"),
		).toEqual(msg`Position data is unavailable`);
		expect(
			positionSubmitFeedbackFromCause(new Error("Reverse plan lost its fresh snapshot"), "failed-reverse"),
		).toEqual({ kind: "localized", code: "failed-reverse" });
		expect(positionSubmitFeedbackFromCause("not an error", "failed-reverse")).toEqual({
			kind: "localized",
			code: "failed-reverse",
		});
	});

	it("maps an unrecognised close plan error to a localized message", () => {
		expect(getPositionMarketClosePlanFeedback("Market reference price must be greater than zero")).toEqual({
			kind: "localized",
			code: "failed-build-close-order",
		});
		expect(getPositionMarketClosePlanFeedback("Close size exceeds current position")).toEqual({
			kind: "localized",
			code: "close-size-exceeds-position",
		});
	});

	it.each<[PositionSubmitFeedback, string, string]>([
		[{ kind: "order-submission", code: "order-failed" }, "Order failed", "Order failed"],
		[
			{ kind: "exchange-error", entries: [{ index: 0, text: "Invalid TP/SL price." }] },
			"Invalid TP/SL price.",
			"Invalid TP/SL price.",
		],
		[{ kind: "action-error", code: "wallet-rejected" }, "Transaction was rejected", "wallet-rejected"],
		[msg`Position data is unavailable`, "Position data is unavailable", "Position data is unavailable"],
		[{ kind: "localized", code: "no-active-positions" }, "No active positions.", "No active positions."],
		[
			{ kind: "partial-close-all", acceptedCount: 1, totalCount: 2 },
			"1 of 2 close orders were fully filled. Review positions before retrying.",
			"1 of 2 close orders were accepted. Review positions before retrying.",
		],
	])("formats and describes every feedback kind: %o", (feedback, formatted, defaultMessage) => {
		expect(formatPositionSubmitFeedback(feedback, translate)).toBe(formatted);
		expect(new PositionSubmitFeedbackCause(feedback).message).toBe(defaultMessage);
	});

	it("formats a tracked request error in the active language with the caller's fallback", () => {
		expect(formatTrackedPositionSubmitError(null, "failed-limit-close", translate)).toBeNull();
		expect(formatTrackedPositionSubmitError(new Error("socket closed"), "failed-limit-close", translate)).toBe(
			"Failed to place limit close order",
		);
		const rejection = Object.assign(new Error("User rejected the request."), { code: 4001 });
		expect(formatTrackedPositionSubmitError(rejection, "failed-limit-close", translate)).toBe(
			"Transaction was rejected",
		);

		i18n.loadAndActivate({
			locale: "zh",
			messages: { [messageId("Failed to place limit close order")]: "限价平仓下单失败" },
		});
		expect(formatTrackedPositionSubmitError(new Error("socket closed"), "failed-limit-close", translate)).toBe(
			"限价平仓下单失败",
		);
	});
});
