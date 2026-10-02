import { createHash } from "node:crypto";
import { setupI18n } from "@lingui/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getNumberFormatters } from "@/lib/format";
import { getOrderNotificationCopy } from "@/lib/trade/order-notification-copy";
import type { OrderQueueItem } from "@/stores/use-order-queue-store";

const formatSettings = vi.hoisted(() => ({ numberFormatLocale: "en-US" }));
vi.mock("@/stores/use-global-settings-store", () => ({
	getResolvedFormatLocale: () => formatSettings.numberFormatLocale,
}));

const i18n = setupI18n({ locale: "en", messages: { en: {} } });

function messageId(message: string): string {
	return createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0, 6);
}
const base: OrderQueueItem = {
	id: "test",
	owner: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
	env: "Mainnet",
	createdAt: 0,
	status: "success",
	operation: "order",
	outcome: "filled",
	market: "HYPE",
	side: "buy",
	size: "1.25",
	price: "111",
	quoteToken: "USDC",
};
const execution = {
	evidence: "exchange-response" as const,
	filledSize: "1.25",
	requestedSize: "1.25",
	averagePrice: "101.125",
	orderIds: [42],
	completeness: "full" as const,
};
function copy(update: Partial<OrderQueueItem> = {}) {
	const result = getOrderNotificationCopy(
		{ ...base, ...update },
		(descriptor) => i18n._(descriptor),
		getNumberFormatters(),
	);
	return Object.fromEntries(
		Object.entries(result).map(([key, value]) => [key, value?.replace(/[\u2066-\u2069]/g, "")]),
	);
}

describe("compact order notification copy", () => {
	beforeEach(() => {
		formatSettings.numberFormatLocale = "en-US";
		i18n.loadAndActivate({ locale: "en", messages: {} });
	});
	it.each([
		["en-US", "88,140.123"],
		["de-DE", "88.140,123"],
		["fr-FR", "88 140,123"],
	])("uses shared %s separators for execution averages", (locale, expected) => {
		formatSettings.numberFormatLocale = locale;
		const fill = { ...execution, averagePrice: "88140.12345" };
		expect(copy({ execution: fill }).detail).toBe(`Avg. $${expected}`);
		expect(copy({ execution: fill, quoteToken: "BTC" }).detail).toBe(`Avg. ${expected} BTC`);
		expect(fill.averagePrice).toBe("88140.12345");
	});
	it("keeps non-tick and tiny averages at eight significant digits without compact notation", () => {
		expect(copy({ execution: { ...execution, averagePrice: "0.000000123456789" } }).detail).toBe(
			"Avg. $0.00000012345679",
		);
		expect(copy({ execution: { ...execution, averagePrice: "1234567.89" } }).detail).toBe("Avg. $1,234,567.9");
		expect(copy({ execution: { ...execution, averagePrice: "101.123456789" } }).detail).toBe("Avg. $101.12346");
	});
	it.each([
		["en-US", "Bought 1,234.5 HYPE", "Partially filled 1,234.5 / 2,000.25 HYPE"],
		["de-DE", "Bought 1.234,5 HYPE", "Partially filled 1.234,5 / 2.000,25 HYPE"],
		["fr-FR", "Bought 1 234,5 HYPE", "Partially filled 1 234,5 / 2 000,25 HYPE"],
	])("writes filled and requested sizes with the %s separators", (locale, full, partial) => {
		formatSettings.numberFormatLocale = locale;
		const fill = { ...execution, filledSize: "1234.5", requestedSize: "1234.5" };
		expect(copy({ execution: fill }).summary).toBe(full);
		expect(
			copy({ status: "partial", execution: { ...fill, requestedSize: "2000.25", completeness: "partial" } }).summary,
		).toBe(partial);
		expect(fill.filledSize).toBe("1234.5");
	});
	it("keeps number preferences independent of translation language", () => {
		formatSettings.numberFormatLocale = "de-DE";
		i18n.loadAndActivate({ locale: "ar", messages: {} });
		expect(copy({ execution }).detail).toBe("Avg. $101,125");
	});
	it("uses actual execution amount and average, never request price", () => {
		expect(copy({ execution })).toMatchObject({ summary: "Bought 1.25 HYPE", detail: "Avg. $101.125" });
		expect(JSON.stringify(copy({ execution }))).not.toContain("111");
	});
	it("isolates amounts for bidirectional translations", () => {
		expect(
			getOrderNotificationCopy({ ...base, execution }, (descriptor) => i18n._(descriptor), getNumberFormatters())
				.summary,
		).toContain("\u20681.25 HYPE\u2069");
	});
	it("supports sells and non-dollar quotes", () => {
		expect(copy({ execution, side: "sell", quoteToken: "BTC" })).toMatchObject({
			summary: "Sold 1.25 HYPE",
			detail: "Avg. 101.125 BTC",
		});
	});
	it("does not invent a quote currency when restored metadata lacks it", () => {
		expect(copy({ execution, quoteToken: undefined }).detail).toBeUndefined();
	});
	it("uses a status-only fallback when execution evidence is absent or invalid", () => {
		expect(copy()).toMatchObject({ summary: "HYPE order filled", detail: undefined });
		expect(copy({ execution: { ...execution, averagePrice: "invalid" } })).toMatchObject({
			summary: "HYPE order filled",
			detail: undefined,
		});
	});
	it("does not call an accepted order filled", () => {
		expect(copy({ outcome: "resting" }).summary).toBe("HYPE order submitted");
		expect(copy({ outcome: "triggerSet" }).summary).toBe("HYPE order submitted");
	});
	it("does not call pre-send progress submitted", () => {
		expect(copy({ status: "pending" }).summary).toBe("HYPE · Submitting…");
	});
	it("distinguishes actual partial fill and omits redundant all-accepted counts", () => {
		expect(
			copy({
				status: "partial",
				execution: { ...execution, filledSize: "0.5", completeness: "partial" },
				acceptedCount: 1,
				totalCount: 1,
			}),
		).toMatchObject({ summary: "Partially filled 0.5 / 1.25 HYPE", detail: "Avg. $101.125", count: undefined });
	});
	it("states the official TP/SL rule only for partial fills that carried TP/SL", () => {
		const partial = { ...execution, filledSize: "0.5", completeness: "partial" as const };
		const notice =
			"Attached TP/SL is placed only if the order fully fills, or if its remainder is canceled for insufficient margin. Review your position's TP/SL.";
		expect(copy({ status: "partial", execution: partial, slPrice: "95" }).notice).toBe(notice);
		expect(copy({ status: "partial", execution: partial, tpPrice: "120", orderType: "limit" }).notice).toBe(notice);
		expect(copy({ status: "partial", execution: partial }).notice).toBeUndefined();
		expect(copy({ execution, tpPrice: "120", slPrice: "95" }).notice).toBeUndefined();
		expect(copy({ status: "failed", tpPrice: "120" }).notice).toBeUndefined();
	});
	it.each(["accepted", "canceled", "unknown", "pending"] as const)(
		"states the same TP/SL rule without inferring an attached order that is %s",
		(attachedStatus) => {
			const result = copy({
				status: "partial",
				execution: { ...execution, filledSize: "0.5", completeness: "partial" },
				slPrice: "95",
				children: [
					{ assetId: 0, market: "HYPE", size: "1.25", filledSize: "0.5", status: "partial" },
					{ assetId: 0, market: "HYPE", size: "1.25", status: attachedStatus },
				],
			});
			expect(result.notice).toBe(
				"Attached TP/SL is placed only if the order fully fills, or if its remainder is canceled for insufficient margin. Review your position's TP/SL.",
			);
		},
	);
	it("retains a fully filled main order and attached order failure", () => {
		expect(
			copy({ status: "partial", execution, acceptedCount: 1, totalCount: 2, error: "TP order rejected" }),
		).toMatchObject({ summary: "Bought 1.25 HYPE", count: "Accepted 1/2 · Review orders", error: "TP order rejected" });
	});
	it("retains unknown and avoids duplicate status-only reconciliation error", () => {
		expect(
			copy({ status: "unconfirmed", error: { kind: "order-reconciliation", code: "status-unconfirmed" } }),
		).toMatchObject({ summary: "HYPE · Unconfirmed — review before retrying", error: undefined });
		expect(copy({ status: "unconfirmed", error: "specific transport context" }).error).toBe(
			"specific transport context",
		);
	});
	it("does not report flat positions from a count", () => {
		const result = copy({
			operation: "close-all",
			status: "partial",
			countMode: "filled",
			acceptedCount: 1,
			totalCount: 2,
			error: { kind: "partial-close-all", acceptedCount: 1, totalCount: 2 },
		});
		expect(result.count).toBe("Fully filled 1/2 · Review positions");
		expect(result.error).toBeUndefined();
		expect(result.summary).not.toContain("All positions closed");
	});
	it("preserves semantic action and market with an explicit result message", () => {
		expect(
			copy({
				title: { id: "test-isolated-margin", message: "Isolated Margin" },
				message: { id: "test-margin-updated", message: "Margin updated" },
			}).summary,
		).toBe("Isolated Margin · HYPE · Margin updated");
		expect(
			copy({
				title: { id: "test-leverage", message: "Leverage" },
				market: undefined,
				status: "failed",
				message: { id: "test-update-failed", message: "Update failed" },
			}).summary,
		).toBe("Leverage · Update failed");
	});
	it("labels TWAP creation and swap without pretending base quantity is the market pair", () => {
		expect(copy({ orderType: "twap", outcome: "twapStarted" }).summary).toBe("TWAP · HYPE · Created");
		expect(copy({ operation: "spot-swap", market: "USDC → HYPE" }).summary).toBe("Swap · USDC → HYPE · Filled");
	});
	it("keeps the unconfirmed summary short when a line below already says what to review", () => {
		expect(
			copy({
				orderType: "twap",
				status: "unconfirmed",
				error: { kind: "order-reconciliation", code: "twap-status-unconfirmed" },
			}),
		).toMatchObject({ summary: "TWAP · HYPE · Unconfirmed", error: "Review active TWAP orders before retrying" });
		expect(copy({ status: "unconfirmed" }).summary).toBe("HYPE · Unconfirmed — review before retrying");
	});
	it("does not repeat a generic failure reason that the Failed summary already states", () => {
		expect(copy({ status: "failed", error: { kind: "order-submission", code: "order-failed" } })).toMatchObject({
			summary: "HYPE order failed",
			error: undefined,
		});
		expect(
			copy({ operation: "market-close", status: "failed", error: { kind: "localized", code: "failed-market-close" } })
				.error,
		).toBeUndefined();
		expect(
			copy({
				operation: "spot-swap",
				market: "USDC → HYPE",
				status: "failed",
				error: { kind: "spot-swap", code: "failed" },
			}).error,
		).toBeUndefined();
		expect(copy({ status: "failed", error: { kind: "order-submission", code: "blocked-order" } }).error).toBe(
			"Another order for this market is still being confirmed.",
		);
	});
	it("retains raw failures in full, including an unbroken reference", () => {
		const error = `Rejected:${"long_reference".repeat(30)}`;
		expect(copy({ status: "failed", error })).toMatchObject({ summary: "HYPE order failed", error });
	});
	it("omits a Market Close or Close All error that only repeats the per-market lines", () => {
		const rejection = "No liquidity available for market order.";
		const marketClose = {
			operation: "market-close" as const,
			status: "failed" as const,
			children: [{ assetId: 0, market: "HYPE", size: "1", status: "rejected" as const, error: rejection }],
		};
		expect(
			copy({ ...marketClose, error: { kind: "exchange-error", entries: [{ index: 0, text: rejection }] } }).error,
		).toBeUndefined();
		expect(copy({ ...marketClose, error: rejection }).error).toBeUndefined();

		const closeAll = {
			operation: "close-all" as const,
			status: "failed" as const,
			children: [
				{ assetId: 0, market: "HYPE", size: "1", status: "rejected" as const, error: rejection },
				{ assetId: 1, market: "BTC", size: "2", status: "rejected" as const, error: "Invalid TP/SL price." },
			],
		};
		expect(
			copy({
				...closeAll,
				error: {
					kind: "exchange-error",
					entries: [
						{ index: 0, text: rejection },
						{ index: 1, text: "Invalid TP/SL price." },
					],
				},
			}).error,
		).toBeUndefined();
		expect(
			copy({ ...closeAll, error: { kind: "exchange-error", entries: [{ text: rejection }] } }).error,
		).toBeUndefined();
		expect(
			copy({ ...closeAll, error: { kind: "exchange-error", entries: [{ index: 1, text: rejection }] } }).error,
		).toBe("No liquidity is available for this market order.");
	});
	it("keeps an error that adds to the per-market lines", () => {
		const children = [
			{
				assetId: 0,
				market: "HYPE",
				size: "1",
				status: "rejected" as const,
				error: "Insufficient margin to place order.",
			},
		];
		expect(
			copy({
				status: "failed",
				children,
				error: {
					kind: "exchange-error",
					entries: [{ index: 0, text: "Insufficient margin to place order." }],
					hint: { kind: "reduce-only" },
				},
			}).error,
		).toBe("Insufficient margin to place order. Try using Reduce Only.");
		expect(
			copy({
				status: "failed",
				children,
				error: { kind: "exchange-error", entries: [{ index: 0, text: "Price must be divisible by tick size." }] },
			}).error,
		).toBe("Price must be a multiple of the tick size.");
		expect(copy({ status: "failed", children, error: { kind: "action-error", code: "rate-limited" } }).error).toBe(
			"Too many requests. Wait a moment and try again.",
		);
	});
	it("renders a stored failure in the language that is active when it is displayed", () => {
		const failed = {
			status: "failed" as const,
			error: { kind: "exchange-error" as const, entries: [{ text: "Order must have minimum value of $10." }] },
		};
		expect(copy(failed).error).toBe("Order value must be at least $10.");

		i18n.loadAndActivate({
			locale: "zh",
			messages: { [messageId(`Order value must be at least \${amount}.`)]: `订单价值至少为 \${amount}。` },
		});

		expect(copy(failed).error).toBe("订单价值至少为 $10。");
	});
});
