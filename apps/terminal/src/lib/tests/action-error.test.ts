import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SDKError, UnknownError } from "@lifi/sdk";
import { i18n, type Messages } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { AbstractWalletError, ApiRequestError, HttpRequestError } from "@nktkas/hyperliquid";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OrderBatchResolutionError } from "@/domain/trade/order-tracking";
import {
	classifyActionError,
	classifyActionErrorOr,
	createActionError,
	describeActionError,
	describeActionFailure,
	exchangeActionFailure,
	formatActionFailure,
} from "@/lib/errors/action-error";
import {
	describeExchangeErrorText,
	formatExchangeErrorEntries,
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

const NAMED_AGENT_CAP_ERROR = "Too many extra agents for cumulative volume traded. Current limit is 3";
const NAMED_AGENT_CAP_MESSAGE =
	"This account already has the 3 named API wallets its trading volume allows. Remove one on the API Wallet page before approving another.";

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

	it("recognises the named Agent cap rejection a user reported and keeps the reported limit", () => {
		expect(formatExchangeErrorText(NAMED_AGENT_CAP_ERROR, translate)).toBe(NAMED_AGENT_CAP_MESSAGE);
		expect(formatExchangeErrorText(`${NAMED_AGENT_CAP_ERROR}.`, translate)).toBe(NAMED_AGENT_CAP_MESSAGE);
		expect(
			formatExchangeErrorText("Too many extra agents for cumulative volume traded. Current limit is 5", translate),
		).toBe(NAMED_AGENT_CAP_MESSAGE.replace("the 3 named", "the 5 named"));
		const unknown = "Too many extra agents for cumulative volume traded.";
		expect(describeExchangeErrorText(unknown)).toBeNull();
		expect(formatExchangeErrorText(unknown, translate)).toBe(unknown);
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
		expect(
			formatExchangeErrorEntries(
				parseExchangeErrorText("Order 1: Invalid TP/SL price.; Order 3: Something new"),
				translate,
			),
		).toBe("Order 1: Invalid TP/SL price.; Order 3: Something new");
		expect(
			formatExchangeErrorEntries(parseExchangeErrorText("Order 2: Order must have minimum value of $10."), translate),
		).toBe("Order value must be at least $10.");
	});

	it("keeps a separator inside an exchange text as part of that text", () => {
		const combined = "Order 1: New rejection; detail; Order 2: Price must be divisible by tick size.";
		expect(parseExchangeErrorText(combined)).toEqual([
			{ index: 0, text: "New rejection; detail" },
			{ index: 1, text: "Price must be divisible by tick size." },
		]);
		expect(formatExchangeErrorEntries(parseExchangeErrorText(combined), translate)).toBe(
			"Order 1: New rejection; detail; Order 2: Price must be a multiple of the tick size.",
		);
	});

	it("formats a single rejection text as one text, whatever it contains", () => {
		const text = "Risk check failed; order 2: see details";
		expect(formatExchangeErrorText(text, translate)).toBe(text);
	});

	it("parses the SDK batch format, including a text that contains a comma", () => {
		const text =
			"order 0: Post only order would have immediately matched, bbo was 1@2., order 1: Price must be divisible by tick size.";
		expect(parseExchangeErrorText(text)).toEqual([
			{ index: 0, text: "Post only order would have immediately matched, bbo was 1@2." },
			{ index: 1, text: "Price must be divisible by tick size." },
		]);
		expect(
			formatExchangeErrorEntries(
				parseExchangeErrorText("cancel 0: Order was never placed, already canceled, or filled."),
				translate,
			),
		).toBe("The order was never placed, was already canceled, or has filled.");
	});

	it("translates the deposit-required rejection only in its known forms and keeps the account address", () => {
		expect(formatExchangeErrorText("Must deposit before performing actions.", translate)).toBe(
			"No balance on Hyperliquid. Deposit first.",
		);
		const user = "0x1111111111111111111111111111111111111111";
		expect(formatExchangeErrorText(`Must deposit before performing actions. User: ${user}`, translate)).toBe(
			`Account ${user} has no balance on Hyperliquid. Deposit first.`,
		);
		const unknown = "Must deposit before performing actions. Required collateral: 25 USDC.";
		expect(describeExchangeErrorText(unknown)).toBeNull();
		expect(formatExchangeErrorText(unknown, translate)).toBe(unknown);
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
		const descriptors = [
			...DOCUMENTED_EXCHANGE_ERRORS,
			LEVERAGE_DECREASE_ERROR,
			NAMED_AGENT_CAP_ERROR,
			"Action already expired",
			"Must deposit before performing actions.",
			"Must deposit before performing actions. User: 0x1111111111111111111111111111111111111111",
		].map((text) => describeExchangeErrorText(text));
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

	it("keeps each rejected order's own text and position from our order tracking result", () => {
		const error = new OrderBatchResolutionError({
			status: "partial",
			totalCount: 3,
			acceptedCount: 1,
			rejectedCount: 2,
			errors: [
				{ index: 0, text: "Risk cap exceeded; contact support" },
				{ index: 2, text: "Price must be divisible by tick size." },
			],
		});
		const failure = classifyActionError(error);
		expect(failure).toEqual({
			kind: "exchange-error",
			entries: [
				{ index: 0, text: "Risk cap exceeded; contact support" },
				{ index: 2, text: "Price must be divisible by tick size." },
			],
		});
		expect(formatActionFailure(failure, translate)).toBe(
			"Order 1: Risk cap exceeded; contact support; Order 3: Price must be a multiple of the tick size.",
		);
	});

	it("never takes a wallet or provider message for an exchange text because of its shape", () => {
		const wrapped = new AbstractWalletError("Failed to sign the typed data using the wallet", {
			cause: new Error("Error 0: Device disconnected"),
		});
		expect(classifyActionError(wrapped)).toEqual({ kind: "action-error", code: "signing-failed" });
		expect(classifyActionError(new Error("Order 1: Something the exchange said"))).toEqual({
			kind: "action-error",
			code: "unknown",
		});
		expect(classifyActionError(new Error("Price must be divisible by tick size."))).toEqual({
			kind: "exchange-error",
			entries: [{ text: "Price must be divisible by tick size." }],
		});
	});

	it("reads exchange rejections before looking for wallet rejection words", () => {
		const statuses = [
			{ error: "Account policy: user denied access." },
			{ error: "Insufficient margin to place order." },
		];
		const error = new ApiRequestError(
			{ status: "ok", response: { type: "order", data: { statuses } } },
			"order 0: Account policy: user denied access., order 1: Insufficient margin to place order.",
		);
		expect(classifyActionError(error)).toEqual({
			kind: "exchange-error",
			entries: [
				{ index: 0, text: "Account policy: user denied access." },
				{ index: 1, text: "Insufficient margin to place order." },
			],
		});
	});

	it("finds our own message inside the errors the LI.FI SDK wraps around it", () => {
		const ours = new LocalizedActionError(msg`LI.FI requested a network that does not match this bridge route.`);
		const wrapped = new SDKError(new UnknownError(ours.message, ours));
		expect(classifyActionError(wrapped)).toEqual(msg`LI.FI requested a network that does not match this bridge route.`);
		expect(describeActionError(wrapped, translate)).toBe(
			"LI.FI requested a network that does not match this bridge route.",
		);
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

	it("throws shared reasons that render in the language active when they are displayed", () => {
		const error = createActionError("identity-changed", { cause: new Error("lease invalidated") });
		expect(error).toBeInstanceOf(LocalizedActionError);
		expect(error.message).toBe("The active wallet or network changed. Review the account and try again.");
		const failure = classifyActionError(error);
		i18n.loadAndActivate({
			locale: "zh",
			messages: {
				[messageId("The active wallet or network changed. Review the account and try again.")]:
					"当前钱包或网络已变化。请检查账户后重试。",
			},
		});
		expect(describeActionFailure(failure, translate)).toBe("当前钱包或网络已变化。请检查账户后重试。");
	});

	it("keeps our own reason when the SDK wraps a failure raised while a wallet signs", () => {
		const wrapped = new AbstractWalletError("Failed to sign the typed data using the wallet", {
			cause: createActionError("identity-changed"),
		});
		expect(describeActionError(wrapped, translate)).toBe(
			"The active wallet or network changed. Review the account and try again.",
		);
		const legal = new AbstractWalletError("Failed to sign the typed data using the wallet", {
			cause: Object.assign(new Error("Hyperliquid terms must be accepted before this action"), {
				name: "LegalActionNotAllowedError",
				reason: "terms_required",
			}),
		});
		expect(describeActionError(legal, translate)).toBe("Accept the Hyperliquid terms before continuing.");
	});

	it("describes a stored failure with the caller's fallback or the generic message", () => {
		const unknown = classifyActionError(new Error("Something internal"));
		expect(describeActionFailure(unknown, translate)).toBe("The request could not be completed. Try again.");
		expect(describeActionFailure(unknown, translate, "Bridge failed")).toBe("Bridge failed");
		expect(describeActionFailure(msg`Transaction was rejected`, translate, "Bridge failed")).toBe(
			"Transaction was rejected",
		);
	});

	it.each([
		[
			"The active embedded wallet does not match the selected Hyperliquid account.",
			"Selected wallet does not match the connected account. Reconnect your wallet and try again.",
		],
		[
			"The active external wallet does not match the selected Hyperliquid account.",
			"Selected wallet does not match the connected account. Reconnect your wallet and try again.",
		],
		[
			"A trading connection is already being established in another tab.",
			"A trading connection is already being established in another tab. Finish or cancel it there before trying again.",
		],
		[
			"Secure Agent registration requires Web Locks support. Update your browser and try again.",
			"This browser cannot safely coordinate the trading connection across tabs. Use a supported browser.",
		],
		[
			"Stored Agent key is invalid",
			"The trading key stored in this browser is invalid. Reset the trading connection before trying again.",
		],
		...[
			"Agent key storage could not be verified",
			"Agent private key could not be stored securely",
			"Agent storage unavailable",
			"Secure Agent registration session is unavailable",
			"Agent registration cleanup could not be verified",
			"Agent approval submission state could not be stored safely",
			"Agent approval submission coordination could not be rolled back safely",
		].map((message) => [
			message,
			"This browser could not store the trading key safely. Check that site storage is available, then try again.",
		]),
		...["Agent approval could not be confirmed", "Agent registration session changed"].map((message) => [
			message,
			"The connection could not be completed. It may already be approved; wait a moment and try again.",
		]),
		["Agent registration is disabled for owner-wallet trading", "Trading could not be enabled. Try again."],
		["Agent verification is disabled for owner-wallet trading", "Trading could not be enabled. Try again."],
		[
			"Wallet or network changed and Agent registration cleanup failed",
			"The active wallet or network changed. Review the account and try again.",
		],
	])("maps the hl-react and wallet adapter message %s", (message, expected) => {
		expect(describeActionError(new Error(message), translate)).toBe(expected);
	});

	it("uses stable hl-react and deposit error names instead of their English messages", () => {
		const resetRequired = Object.assign(new Error("The previous trading connection cannot be resumed safely"), {
			name: "AgentRegistrationResetRequiredError",
		});
		expect(describeActionError(resetRequired, translate)).toBe(
			"This browser no longer has the exact trading key for the pending approval. Reset the trading connection before trying again.",
		);
		const guardTimeout = Object.assign(
			new Error("The pre-execution guard timed out before the signing request could start."),
			{ name: "AgentRegistrationPreExecutionGuardTimeoutError" },
		);
		expect(describeActionError(guardTimeout, translate, "Transfer failed")).toBe(
			"The checks before this request took too long. Nothing was signed or sent. Try again.",
		);
		const rateLimited = Object.assign(new Error("Could not load agent status"), {
			name: "AgentStatusError",
			reason: "rate_limited",
		});
		expect(describeActionError(rateLimited, translate)).toBe("Too many requests. Wait a moment and try again.");
		const statusUnavailable = Object.assign(new Error("Could not load agent status"), {
			name: "AgentStatusError",
			reason: "network",
		});
		expect(describeActionError(statusUnavailable, translate)).toBe("Trading could not be enabled. Try again.");
		const recoveryStorage = Object.assign(new Error("CCTP deposit tracking storage is unavailable."), {
			name: "CctpDepositTrackingPersistenceError",
		});
		expect(describeActionError(recoveryStorage, translate)).toBe(
			"This browser could not store deposit recovery data, so this deposit was not submitted. Allow site storage, then try again.",
		);
		const prototypeName = Object.assign(new Error("Something internal"), { name: "toString" });
		expect(classifyActionError(prototypeName)).toEqual({ kind: "action-error", code: "unknown" });
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
