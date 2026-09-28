import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { i18n, type Messages } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { AbstractWalletError, ApiRequestError, HttpRequestError } from "@nktkas/hyperliquid";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	classifyActionError,
	classifyActionErrorOr,
	describeActionError,
	exchangeActionFailure,
	formatActionFailure,
} from "@/lib/errors/action-error";
import {
	describeExchangeErrorText,
	formatExchangeErrorText,
	parseExchangeErrorText,
} from "@/lib/errors/exchange-error-text";
import { LocalizedActionError } from "@/lib/errors/localized-action-error";
import { describeOrderStatusReason, formatOrderChildError } from "@/lib/trade/order-status-reasons";
import type { Translate } from "@/lib/translate";

const translate: Translate = (descriptor) => i18n._(descriptor);

const zhCatalog = readFileSync(resolve(process.cwd(), "src/locales/zh/messages.po"), "utf8");

function productionChinese(english: string | undefined): string | undefined {
	if (!english) return undefined;
	const msgid = english.replace(/[\\"]/g, (character) => `\\${character}`);
	const start = zhCatalog.indexOf(`msgid "${msgid}"\nmsgstr "`);
	if (start < 0) return undefined;
	const valueStart = start + `msgid "${msgid}"\nmsgstr "`.length;
	return zhCatalog.slice(valueStart, zhCatalog.indexOf('"\n', valueStart)) || undefined;
}

const ORDER_STATUS_CODES = [
	"badAloPxRejected",
	"badTriggerPxRejected",
	"insufficientSpotBalanceRejected",
	"iocCancelRejected",
	"marketOrderNoLiquidityRejected",
	"minTradeNtlRejected",
	"openInterestIncreaseRejected",
	"oracleRejected",
	"perpMarginRejected",
	"perpMaxPositionRejected",
	"positionFlipAtOpenInterestCapRejected",
	"positionIncreaseAtOpenInterestCapRejected",
	"reduceOnlyRejected",
	"rejected",
	"tickRejected",
	"tooAggressiveAtOpenInterestCapRejected",
	"tooManyOpenOrdersRejected",
	"canceled",
	"delistedCanceled",
	"internalCancel",
	"liquidatedCanceled",
	"marginCanceled",
	"openInterestCapCanceled",
	"outcomeSettledCanceled",
	"reduceOnlyCanceled",
	"scheduledCancel",
	"selfTradeCanceled",
	"siblingFilledCanceled",
	"vaultWithdrawalCanceled",
];

function messageId(message: string): string {
	return createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6);
}

const DOCUMENTED_EXCHANGE_ERRORS = [
	"Price must be divisible by tick size.",
	"Order must have minimum value of $10.",
	"Order must have minimum value of 10 USDC.",
	"Insufficient margin to place order.",
	"Reduce only order would increase position.",
	"Post only order would have immediately matched, bbo was 100.5@101.",
	"Order could not immediately match against any resting orders.",
	"Invalid TP/SL price.",
	"No liquidity available for market order.",
	"Order would increase open interest while open interest is capped",
	"Order rejected due to price more aggressive than oracle while at open interest cap",
	"Order would increase open interest too quickly",
	"(Spot-only) Order has insufficient spot balance to trade",
	"Order price too far from oracle",
	"Order would cause position to exceed margin tier limit at current leverage",
	"Order was never placed, already canceled, or filled.",
];

const LEVERAGE_DECREASE_ERROR =
	"Cross position does not have sufficient margin available to decrease leverage. To decrease leverage, deposit more collateral.";
const LEVERAGE_DECREASE_MESSAGE =
	"Cross positions do not have enough available margin to lower the leverage. Deposit more collateral to lower it.";

beforeEach(() => {
	i18n.loadAndActivate({ locale: "en", messages: {} });
});

afterEach(() => {
	i18n.loadAndActivate({ locale: "en", messages: {} });
});

describe("exchange rejection texts", () => {
	it.each(DOCUMENTED_EXCHANGE_ERRORS)("recognises the documented text %s", (text) => {
		expect(describeExchangeErrorText(text)).not.toBeNull();
	});

	it("recognises the leverage decrease rejection a user reported", () => {
		expect(formatExchangeErrorText(LEVERAGE_DECREASE_ERROR, translate)).toBe(LEVERAGE_DECREASE_MESSAGE);
	});

	it("keeps the values the exchange reported", () => {
		expect(formatExchangeErrorText("Order must have minimum value of $10.", translate)).toBe(
			"Order value must be at least $10.",
		);
		expect(formatExchangeErrorText("Order must have minimum value of 10 USDH.", translate)).toBe(
			"Order value must be at least 10 USDH.",
		);
		expect(
			formatExchangeErrorText("Post only order would have immediately matched, bbo was 100.5@101.", translate),
		).toBe("A Post Only order would have matched immediately. Best bid and offer: 100.5@101.");
	});

	it("shows an unknown exchange text unchanged and in full", () => {
		const unknown = `Unrecognised rejection ${"x".repeat(160)}\nsecond line`;
		expect(describeExchangeErrorText(unknown)).toBeNull();
		expect(formatExchangeErrorText(unknown, translate)).toBe(unknown);
	});

	it("parses the order tracking batch format", () => {
		expect(parseExchangeErrorText("Order 1: Invalid TP/SL price.; Order 3: Something new")).toEqual([
			{ index: 0, text: "Invalid TP/SL price." },
			{ index: 2, text: "Something new" },
		]);
		expect(formatExchangeErrorText("Order 1: Invalid TP/SL price.; Order 3: Something new", translate)).toBe(
			"Order 1: Invalid TP/SL price.; Order 3: Something new",
		);
		expect(formatExchangeErrorText("Order 2: Order must have minimum value of $10.", translate)).toBe(
			"Order value must be at least $10.",
		);
	});

	it("parses the SDK batch format, including a text that contains a comma", () => {
		const text =
			"order 0: Post only order would have immediately matched, bbo was 1@2., order 1: Price must be divisible by tick size.";
		expect(parseExchangeErrorText(text)).toEqual([
			{ index: 0, text: "Post only order would have immediately matched, bbo was 1@2." },
			{ index: 1, text: "Price must be divisible by tick size." },
		]);
		expect(formatExchangeErrorText("cancel 0: Order was never placed, already canceled, or filled.", translate)).toBe(
			"The order was never placed, was already canceled, or has filled.",
		);
	});

	it("adds the official insufficient-margin hints", () => {
		const text = "Insufficient margin to place order.";
		expect(formatExchangeErrorText(text, translate, { kind: "reduce-only" })).toBe(
			"Insufficient margin to place order. Try using Reduce Only.",
		);
		expect(formatExchangeErrorText(text, translate, { kind: "cancel-orders", market: "BTC" })).toBe(
			"Insufficient margin to place order. Try canceling open BTC orders.",
		);
	});

	it("renders in the active language and re-renders after a language switch", () => {
		const failure = exchangeActionFailure(LEVERAGE_DECREASE_ERROR);
		expect(formatActionFailure(failure, translate)).toBe(LEVERAGE_DECREASE_MESSAGE);
		const messages: Messages = {
			[messageId(LEVERAGE_DECREASE_MESSAGE)]: "全仓仓位的可用保证金不足，无法降低杠杆。请存入更多抵押品后再降低杠杆。",
		};
		i18n.loadAndActivate({ locale: "zh", messages });
		expect(formatActionFailure(failure, translate)).toBe(
			"全仓仓位的可用保证金不足，无法降低杠杆。请存入更多抵押品后再降低杠杆。",
		);
	});
});

describe("production Chinese catalog", () => {
	it("translates every known exchange text and hint", () => {
		const descriptors = [...DOCUMENTED_EXCHANGE_ERRORS, LEVERAGE_DECREASE_ERROR, "Action already expired"].map((text) =>
			describeExchangeErrorText(text),
		);
		descriptors.push(
			describeExchangeErrorText("Insufficient margin to place order.", { kind: "reduce-only" }),
			describeExchangeErrorText("Insufficient margin to place order.", { kind: "cancel-orders", market: "BTC" }),
		);
		for (const descriptor of descriptors) {
			expect(descriptor?.message, "known exchange text").toBeTruthy();
			expect(productionChinese(descriptor?.message), descriptor?.message).toBeTruthy();
		}
	});

	it("translates every order status reason", () => {
		for (const status of ORDER_STATUS_CODES) {
			const descriptor = describeOrderStatusReason(status);
			expect(descriptor?.message, status).toBeTruthy();
			expect(productionChinese(descriptor?.message), status).toBeTruthy();
		}
	});

	it("renders the reported leverage rejection in Chinese", () => {
		const chinese = productionChinese(LEVERAGE_DECREASE_MESSAGE);
		expect(chinese).toBe("全仓仓位的可用保证金不足，无法降低杠杆。请存入更多抵押品后再降低杠杆。");
		i18n.loadAndActivate({ locale: "zh", messages: { [messageId(LEVERAGE_DECREASE_MESSAGE)]: chinese as string } });
		expect(formatExchangeErrorText(LEVERAGE_DECREASE_ERROR, translate)).toBe(chinese);
	});
});

describe("classifyActionError", () => {
	it("keeps exchange rejection texts from the SDK response", () => {
		const topLevel = new ApiRequestError({ status: "err", response: LEVERAGE_DECREASE_ERROR }, LEVERAGE_DECREASE_ERROR);
		expect(classifyActionError(topLevel)).toEqual({
			kind: "exchange-error",
			entries: [{ text: LEVERAGE_DECREASE_ERROR }],
		});

		const bulk = new ApiRequestError(
			{
				status: "ok",
				response: {
					type: "order",
					data: { statuses: [{ resting: { oid: 1 } }, { error: "Invalid TP/SL price." }] },
				},
			},
			"order 1: Invalid TP/SL price.",
		);
		expect(classifyActionError(bulk)).toEqual({
			kind: "exchange-error",
			entries: [{ index: 1, text: "Invalid TP/SL price." }],
		});
		expect(describeActionError(bulk, translate)).toBe("Invalid TP/SL price.");
	});

	it("reports transport results by status", () => {
		expect(classifyActionError(new HttpRequestError({ detail: "Request timed out after 10000 ms" }))).toEqual({
			kind: "action-error",
			code: "request-unconfirmed",
		});
		expect(classifyActionError(new HttpRequestError({ response: new Response("slow down", { status: 429 }) }))).toEqual(
			{ kind: "action-error", code: "rate-limited" },
		);
		expect(classifyActionError(new HttpRequestError({ response: new Response("bad", { status: 400 }) }))).toEqual({
			kind: "action-error",
			code: "request-rejected",
		});
	});

	it("recognises wallet rejections through the SDK signing wrapper", () => {
		const rejected = new AbstractWalletError("Failed to sign the typed data using the wallet", {
			cause: Object.assign(new Error("User rejected the request."), { code: 4001 }),
		});
		expect(describeActionError(rejected, translate)).toBe("Transaction was rejected");
		const failed = new AbstractWalletError("Failed to sign the typed data using the wallet", {
			cause: new Error("device disconnected"),
		});
		expect(describeActionError(failed, translate)).toBe("The wallet could not sign the request. Try again.");
	});

	it("uses hl-react error names and reasons instead of their English messages", () => {
		const terms = Object.assign(new Error("Hyperliquid terms must be accepted before this action"), {
			name: "LegalActionNotAllowedError",
			reason: "terms_required",
		});
		expect(describeActionError(terms, translate)).toBe("Accept the Hyperliquid terms before continuing.");
		const changed = Object.assign(new Error("anything"), { name: "ExchangeRequestInvalidatedError" });
		expect(describeActionError(changed, translate)).toBe(
			"The active wallet or network changed. Review the account and try again.",
		);
		expect(describeActionError(new Error("The local clock cannot produce a safe Hyperliquid nonce."), translate)).toBe(
			"Your device clock is out of sync. Correct the date and time, then try again.",
		);
	});

	it("translates our own errors when they are displayed, not when they are thrown", () => {
		const error = new LocalizedActionError(msg`Margin mode data is unavailable`);
		expect(error.message).toBe("Margin mode data is unavailable");
		const failure = classifyActionError(error);
		expect(formatActionFailure(failure, translate)).toBe("Margin mode data is unavailable");
		i18n.loadAndActivate({
			locale: "zh",
			messages: { [messageId("Margin mode data is unavailable")]: "保证金模式数据不可用" },
		});
		expect(formatActionFailure(failure, translate)).toBe("保证金模式数据不可用");
	});

	it("treats our order tracking batch errors as exchange texts", () => {
		expect(classifyActionError(new Error("Order 1: Something the exchange said"))).toEqual({
			kind: "exchange-error",
			entries: [{ index: 0, text: "Something the exchange said" }],
		});
	});

	it("never shows an unrecognised English error", () => {
		const internal = new Error("Leverage request no longer matches the selected market");
		expect(classifyActionError(internal)).toEqual({ kind: "action-error", code: "unknown" });
		expect(describeActionError(internal, translate)).toBe("The request could not be completed. Try again.");
		expect(describeActionError(internal, translate, "Update failed")).toBe("Update failed");
		expect(classifyActionErrorOr(internal, msg`Referral request could not be completed.`)).toEqual(
			msg`Referral request could not be completed.`,
		);
		expect(classifyActionError("a thrown string")).toEqual({ kind: "action-error", code: "unknown" });
	});
});

describe("order status reasons", () => {
	it("translates rejected and canceled order statuses", () => {
		expect(formatOrderChildError("perpMarginRejected", translate)).toBe("Rejected due to insufficient margin");
		expect(formatOrderChildError("minTradeNtlRejected", translate)).toBe(
			"Rejected because the order value is below the minimum",
		);
		expect(describeOrderStatusReason("open")).toBeNull();
		expect(describeOrderStatusReason("toString")).toBeNull();
	});

	it("falls back to exchange rejection texts", () => {
		expect(formatOrderChildError("Invalid TP/SL price.", translate)).toBe("Invalid TP/SL price.");
		expect(formatOrderChildError("Something new", translate)).toBe("Something new");
	});
});
