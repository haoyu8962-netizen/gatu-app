// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import { ApiRequestError } from "@nktkas/hyperliquid";
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EntryExecutionError } from "@/domain/trade/order/entry-execution-guard";
import { OrderBatchResolutionError, type TrackedOrderParams, trackOrderRequest } from "@/domain/trade/order-tracking";
import { type OrderSubmitInput, useOrderSubmit } from "@/hooks/trade/use-order-submit";
import { type ActionFailure, formatActionFailure } from "@/lib/errors/action-error";
import { orderSubmissionFeedbackCause } from "@/lib/trade/order-submission-feedback";
import { createI18nRoot } from "./harness/react";

function failureText(error: ActionFailure): string {
	return formatActionFailure(error, (descriptor) => i18n._(descriptor)) ?? "";
}

const mocks = vi.hoisted(() => ({
	exchangeSession: {
		id: Symbol("order-submit-session"),
		env: "Mainnet" as const,
		clientKey: "0x1111111111111111111111111111111111111111",
		sessionMode: "wallet" as const,
		active: true,
	},
	draftRevision: 7,
	submitOrder: vi.fn(),
	submitTwap: vi.fn(),
	addOrder: vi.fn(() => "queue-1"),
	updateOrder: vi.fn(),
	resetFormIfCurrent: vi.fn(() => true),
	onReset: vi.fn(),
	getPositionSize: vi.fn<(assetId: number) => string | undefined>(),
}));

vi.mock("@/lib/hyperliquid", () => ({
	useHyperliquid: () => ({ ...mocks.exchangeSession, exchangeSession: mocks.exchangeSession }),
}));

vi.mock("@/hooks/trade/use-tracked-order", () => ({
	useTrackedOrder: () => ({ submitOrder: mocks.submitOrder, isPending: false }),
}));

vi.mock("@/hooks/trade/use-tracked-twap-order", () => ({
	useTrackedTwapOrder: () => ({ submitTwap: mocks.submitTwap, isPending: false }),
}));

vi.mock("@/stores/use-order-queue-store", () => ({
	useOrderQueueActions: () => ({ addOrder: mocks.addOrder, updateOrder: mocks.updateOrder }),
}));

vi.mock("@/stores/use-order-entry-store", () => ({
	getOrderEntryDraftResetToken: () => ({ marketIdentity: "Mainnet:perp:BTC", draftRevision: mocks.draftRevision }),
	useOrderEntryActions: () => ({ resetFormIfCurrent: mocks.resetFormIfCurrent }),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let hookValue: ReturnType<typeof useOrderSubmit> | null = null;

function Probe() {
	hookValue = useOrderSubmit({ onReset: mocks.onReset, getPositionSize: mocks.getPositionSize });
	return null;
}

function marketInput(overrides: Partial<OrderSubmitInput> = {}): OrderSubmitInput {
	const draftResetToken = hookValue?.captureDraftResetToken();
	if (!draftResetToken) throw new Error("Expected a current draft reset token");
	return {
		draftResetToken,
		market: { assetId: 0, kind: "perp", name: "BTC", szDecimals: 5 },
		baseToken: "BTC",
		side: "buy",
		orderType: "market",
		sizeValue: 1,
		price: 100,
		executionReferencePx: 100,
		markPx: 100,
		marginMode: "cross",
		slippageBps: 50,
		reduceOnly: false,
		tif: "Gtc",
		limitPriceInput: "",
		triggerPriceInput: "",
		scaleStartPriceInput: "",
		scaleEndPriceInput: "",
		scaleLevelsNum: null,
		scaleSkewInput: "",
		twapMinutesNum: null,
		twapRandomize: false,
		twapAdvancedEnabled: false,
		twapTriggerPx: null,
		twapStopPx: null,
		tpSlEnabled: false,
		canUseTpSl: false,
		tpPriceNum: null,
		slPriceNum: null,
		twapOrder: false,
		scaleOrder: false,
		triggerOrder: false,
		...overrides,
	};
}

function scaleInput(overrides: Partial<OrderSubmitInput> = {}): OrderSubmitInput {
	return marketInput({
		orderType: "scale",
		scaleOrder: true,
		scaleStartPriceInput: "100",
		scaleEndPriceInput: "110",
		scaleLevelsNum: 2,
		scaleSkewInput: "1",
		sizeValue: 1,
		...overrides,
	});
}

const CONFIRMED_ORDER = {
	state: "confirmed",
	result: { status: "ok", response: { type: "order", data: { statuses: [{ resting: { oid: 1 } }] } } },
} as const;

function replaceSession(clientKey: string) {
	mocks.exchangeSession.active = false;
	mocks.exchangeSession = { ...mocks.exchangeSession, id: Symbol("order-submit-session"), clientKey, active: true };
}

describe("useOrderSubmit surface reset", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		mocks.draftRevision = 7;
		replaceSession("0x1111111111111111111111111111111111111111");
		mocks.submitOrder.mockReset();
		mocks.submitTwap.mockReset();
		mocks.addOrder.mockReset();
		mocks.addOrder.mockReturnValue("queue-1");
		mocks.updateOrder.mockReset();
		mocks.resetFormIfCurrent.mockReset().mockReturnValue(true);
		mocks.onReset.mockReset();
		mocks.getPositionSize.mockReset();
		i18n.loadAndActivate({ locale: "en", messages: {} });
		mocks.submitOrder.mockResolvedValue(CONFIRMED_ORDER);
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createI18nRoot(container);
		act(() => root.render(createElement(Probe)));
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		hookValue = null;
	});

	async function submit(input: OrderSubmitInput) {
		if (!hookValue) throw new Error("Expected order submit hook");
		await act(async () => {
			await hookValue?.handleSubmit(input);
		});
	}

	it("captures actual fill quantity and average in the notification", async () => {
		mocks.submitOrder.mockImplementation(async (_params, options) => {
			const result = {
				status: "ok",
				response: { type: "order", data: { statuses: [{ filled: { totalSz: "0.68", avgPx: "92.762", oid: 11 } }] } },
			};
			options.onResponse(result, _params.orders);
			return { state: "confirmed", result };
		});
		await submit(marketInput({ sizeValue: 0.68, quoteToken: "USDC" }));
		expect(mocks.addOrder).toHaveBeenCalledWith(
			expect.objectContaining({ size: "0.68", price: "100", quoteToken: "USDC" }),
		);
		expect(mocks.updateOrder).toHaveBeenCalledWith("queue-1", {
			execution: expect.objectContaining({
				filledSize: "0.68",
				requestedSize: "0.68",
				averagePrice: "92.762",
				completeness: "full",
			}),
		});
		expect(mocks.updateOrder).toHaveBeenLastCalledWith("queue-1", { status: "success", outcome: "filled" });
	});

	it("reports a partial market execution as partial rather than fully filled", async () => {
		mocks.submitOrder.mockImplementation(async (params: TrackedOrderParams, options) => {
			expect(params.orders).toHaveLength(1);
			expect(params.orders[0]).toEqual(expect.objectContaining({ t: { limit: { tif: "FrontendMarket" } } }));
			const tracked = trackOrderRequest(params);
			const result = {
				status: "ok",
				response: { type: "order", data: { statuses: [{ filled: { totalSz: "0.4", avgPx: "99", oid: 12 } }] } },
			};
			options.onResponse(result, tracked.params.orders);
			return { state: "confirmed", result };
		});
		await submit(marketInput());
		expect(mocks.updateOrder).toHaveBeenCalledWith("queue-1", {
			execution: expect.objectContaining({
				filledSize: "0.4",
				requestedSize: "1",
				completeness: "partial",
				partialIoc: { cloid: expect.stringMatching(/^0x[\da-f]{32}$/), orderId: 12 },
			}),
		});
		expect(mocks.updateOrder).toHaveBeenLastCalledWith("queue-1", { status: "partial", outcome: "filled" });
	});

	it("treats accepted Scale layers as success while retaining partial execution evidence", async () => {
		mocks.submitOrder.mockImplementation(async (params, options) => {
			expect(params.orders).toHaveLength(2);
			expect(params.orders).toEqual([
				expect.objectContaining({ t: { limit: { tif: "Gtc" } } }),
				expect.objectContaining({ t: { limit: { tif: "Gtc" } } }),
			]);
			const result = {
				status: "ok",
				response: {
					type: "order",
					data: {
						statuses: [{ filled: { totalSz: params.orders[0].s, avgPx: "99", oid: 20 } }, { resting: { oid: 21 } }],
					},
				},
			};
			options.onResponse(result, params.orders);
			return { state: "confirmed", result };
		});
		await submit(
			marketInput({
				orderType: "scale",
				scaleOrder: true,
				scaleStartPriceInput: "90",
				scaleEndPriceInput: "100",
				scaleLevelsNum: 2,
				scaleSkewInput: "1",
			}),
		);
		expect(mocks.updateOrder).toHaveBeenCalledWith("queue-1", {
			execution: expect.objectContaining({ filledSize: "0.5", requestedSize: "1", completeness: "partial" }),
		});
		expect(mocks.updateOrder).toHaveBeenLastCalledWith("queue-1", { status: "success", outcome: "filled" });
	});

	it("keeps actual main fills when TP/SL submission partially fails", async () => {
		mocks.submitOrder.mockImplementation(async (_params, options) => {
			options.onResponse(
				{
					status: "ok",
					response: {
						type: "order",
						data: { statuses: [{ filled: { totalSz: "1", avgPx: "99", oid: 13 } }, { error: "TP rejected" }] },
					},
				},
				_params.orders,
			);
			throw new OrderBatchResolutionError({
				status: "partial",
				totalCount: 2,
				acceptedCount: 1,
				rejectedCount: 1,
				errors: [{ text: "TP rejected" }],
			});
		});
		await submit(marketInput({ tpSlEnabled: true, canUseTpSl: true, tpPriceNum: 120 }));
		expect(mocks.updateOrder).toHaveBeenCalledWith("queue-1", {
			execution: expect.objectContaining({ filledSize: "1", averagePrice: "99", completeness: "full" }),
		});
		expect(mocks.updateOrder).toHaveBeenLastCalledWith(
			"queue-1",
			expect.objectContaining({
				status: "partial",
				error: { kind: "exchange-error", entries: [{ text: "TP rejected" }] },
			}),
		);
	});

	it("clears the surface-local inputs exactly when the shared form is reset", async () => {
		await submit(marketInput());

		expect(mocks.resetFormIfCurrent).toHaveBeenCalledExactlyOnceWith({
			marketIdentity: "Mainnet:perp:BTC",
			draftRevision: 7,
		});
		expect(mocks.onReset).toHaveBeenCalledOnce();
	});

	it("keeps the surface inputs when the submission never reaches the exchange", async () => {
		mocks.submitOrder.mockResolvedValue({ state: "blocked", reason: "pending" });
		await submit(marketInput());

		expect(mocks.resetFormIfCurrent).not.toHaveBeenCalled();
		expect(mocks.onReset).not.toHaveBeenCalled();
	});

	it("rejects a confirmation after the shared draft changes", async () => {
		const input = marketInput();
		mocks.draftRevision += 1;

		await submit(input);

		expect(mocks.addOrder).not.toHaveBeenCalled();
		expect(mocks.submitOrder).not.toHaveBeenCalled();
		expect(mocks.submitTwap).not.toHaveBeenCalled();
		expect(mocks.resetFormIfCurrent).not.toHaveBeenCalled();
		expect(mocks.onReset).not.toHaveBeenCalled();
	});

	it("rejects a confirmation captured before an account A-B-A cycle", async () => {
		const input = marketInput();
		replaceSession("0x2222222222222222222222222222222222222222");
		act(() => root.render(createElement(Probe)));
		replaceSession("0x1111111111111111111111111111111111111111");
		act(() => root.render(createElement(Probe)));

		await submit(input);

		expect(mocks.addOrder).not.toHaveBeenCalled();
		expect(mocks.submitOrder).not.toHaveBeenCalled();
		expect(mocks.submitTwap).not.toHaveBeenCalled();
		expect(mocks.resetFormIfCurrent).not.toHaveBeenCalled();
		expect(mocks.onReset).not.toHaveBeenCalled();
	});

	it.each(["confirmed", "reconciling", "partial", "TWAP reconciling"] as const)(
		"preserves local inputs when a late %s result cannot reset the shared draft",
		async (outcome) => {
			let resolveSubmission: ((value: unknown) => void) | undefined;
			let rejectSubmission: ((reason: unknown) => void) | undefined;
			const deferred = new Promise((resolve, reject) => {
				resolveSubmission = resolve;
				rejectSubmission = reject;
			});
			const twapOrder = outcome === "TWAP reconciling";
			(twapOrder ? mocks.submitTwap : mocks.submitOrder).mockReturnValue(deferred);
			const input = outcome === "partial" ? scaleInput() : marketInput({ twapOrder, twapMinutesNum: 30 });
			let submissionPromise: Promise<void> | undefined;
			act(() => {
				submissionPromise = hookValue?.handleSubmit(input);
			});
			mocks.draftRevision += 1;
			mocks.resetFormIfCurrent.mockReturnValue(false);

			await act(async () => {
				if (outcome === "partial") {
					rejectSubmission?.(
						new OrderBatchResolutionError({
							status: "partial",
							totalCount: 2,
							acceptedCount: 1,
							rejectedCount: 1,
							errors: [{ index: 1, text: "Order must have minimum value of $10." }],
						}),
					);
				} else {
					resolveSubmission?.(
						outcome === "confirmed" ? CONFIRMED_ORDER : { state: "reconciling", submissionId: "pending-1" },
					);
				}
				await submissionPromise;
			});

			expect(mocks.resetFormIfCurrent).toHaveBeenCalledExactlyOnceWith(input.draftResetToken.orderEntry);
			expect(mocks.onReset).not.toHaveBeenCalled();
			if (outcome === "partial") {
				expect(mocks.updateOrder).toHaveBeenCalledWith(
					"queue-1",
					expect.objectContaining({
						status: "partial",
						acceptedCount: 1,
						error: {
							kind: "exchange-error",
							entries: [{ index: 1, text: "Order must have minimum value of $10." }],
						},
					}),
				);
			}
		},
	);

	it("keeps the current account draft when the previous account submission finishes", async () => {
		let resolveSubmission: ((value: typeof CONFIRMED_ORDER) => void) | undefined;
		mocks.submitOrder.mockReturnValue(
			new Promise<typeof CONFIRMED_ORDER>((resolve) => {
				resolveSubmission = resolve;
			}),
		);
		let submissionPromise: Promise<void> | undefined;
		act(() => {
			submissionPromise = hookValue?.handleSubmit(marketInput());
		});
		replaceSession("0x2222222222222222222222222222222222222222");
		act(() => root.render(createElement(Probe)));
		await act(async () => {
			resolveSubmission?.(CONFIRMED_ORDER);
			await submissionPromise;
		});

		expect(mocks.resetFormIfCurrent).not.toHaveBeenCalled();
		expect(mocks.onReset).not.toHaveBeenCalled();
		expect(mocks.updateOrder).toHaveBeenCalledWith("queue-1", expect.objectContaining({ status: "success" }));
	});

	it("stores a tracked-order client failure as a locale-independent descriptor", async () => {
		mocks.submitOrder.mockRejectedValueOnce(orderSubmissionFeedbackCause("coordination-unavailable"));

		await submit(marketInput());

		expect(mocks.updateOrder).toHaveBeenCalledWith("queue-1", {
			status: "failed",
			error: { kind: "order-submission", code: "coordination-unavailable" },
		});
	});

	it("stores a live execution-guard failure as a locale-independent descriptor", async () => {
		mocks.submitOrder.mockRejectedValueOnce(new EntryExecutionError("mark-price-unavailable"));

		await submit(marketInput());

		expect(mocks.updateOrder).toHaveBeenCalledWith("queue-1", {
			status: "failed",
			error: { kind: "order-submission", code: "live-trading-data-unavailable" },
		});
	});

	it("never stores an unrecognised failure as untranslated text", async () => {
		mocks.submitOrder.mockRejectedValueOnce(new Error("SDK rejected the order request"));

		await submit(marketInput());

		expect(mocks.updateOrder).toHaveBeenCalledWith("queue-1", {
			status: "failed",
			error: { kind: "order-submission", code: "order-failed" },
		});
	});

	it("stores exchange rejections as data rendered in the active language", async () => {
		const unknownRejection = "Order rejected by a rule the terminal does not know yet.";
		mocks.submitOrder
			.mockRejectedValueOnce(
				new OrderBatchResolutionError({
					status: "rejected",
					totalCount: 1,
					acceptedCount: 0,
					rejectedCount: 1,
					errors: [{ index: 0, text: "Price must be divisible by tick size." }],
				}),
			)
			.mockRejectedValueOnce(new ApiRequestError({ status: "err", response: unknownRejection }, unknownRejection));

		await submit(marketInput());
		await submit(marketInput());

		const [known, unknown] = mocks.updateOrder.mock.calls
			.filter(([, update]) => update.status === "failed")
			.map(([, update]) => failureText(update.error));
		expect(known).toBe("Price must be a multiple of the tick size.");
		expect(unknown).toBe(unknownRejection);
	});

	it.each([
		{ label: "an opposite position the order can reduce", side: "buy", positionSize: "-0.5", hint: true },
		{ label: "an order more than twice the opposite position", side: "buy", positionSize: "-0.49", hint: false },
		{ label: "a position on the same side", side: "sell", positionSize: "-0.5", hint: false },
		{ label: "no position", side: "buy", positionSize: undefined, hint: false },
	] as const)("suggests Reduce Only for insufficient margin with $label", async ({ side, positionSize, hint }) => {
		mocks.getPositionSize.mockReturnValue(positionSize);
		mocks.submitOrder.mockRejectedValueOnce(
			new OrderBatchResolutionError({
				status: "rejected",
				totalCount: 1,
				acceptedCount: 0,
				rejectedCount: 1,
				errors: [{ index: 0, text: "Insufficient margin to place order." }],
			}),
		);

		await submit(marketInput({ side }));

		expect(mocks.getPositionSize).toHaveBeenCalledWith(0);
		const [, update] = mocks.updateOrder.mock.calls.at(-1) ?? [];
		expect(failureText(update?.error)).toBe(
			hint ? "Insufficient margin to place order. Try using Reduce Only." : "Insufficient margin to place order.",
		);
	});

	it("uses the position read when the order was submitted, not the one when a late rejection arrives", async () => {
		mocks.getPositionSize.mockReturnValue(undefined);
		mocks.submitOrder.mockImplementationOnce(async () => {
			mocks.getPositionSize.mockReturnValue("-5");
			throw new OrderBatchResolutionError({
				status: "rejected",
				totalCount: 1,
				acceptedCount: 0,
				rejectedCount: 1,
				errors: [{ index: 0, text: "Insufficient margin to place order." }],
			});
		});

		await submit(marketInput({ side: "buy" }));

		const [, update] = mocks.updateOrder.mock.calls.at(-1) ?? [];
		expect(failureText(update?.error)).toBe("Insufficient margin to place order.");
	});

	it("does not suggest Reduce Only for a reduce-only or spot order", async () => {
		mocks.getPositionSize.mockReturnValue("-5");
		const insufficientMargin = () =>
			new OrderBatchResolutionError({
				status: "rejected",
				totalCount: 1,
				acceptedCount: 0,
				rejectedCount: 1,
				errors: [{ index: 0, text: "Insufficient margin to place order." }],
			});
		mocks.submitOrder.mockRejectedValueOnce(insufficientMargin()).mockRejectedValueOnce(insufficientMargin());

		await submit(marketInput({ reduceOnly: true }));
		await submit(marketInput({ market: { assetId: 10_107, kind: "spot", name: "@107", szDecimals: 2 } }));

		const texts = mocks.updateOrder.mock.calls
			.filter(([, update]) => update.status === "failed")
			.map(([, update]) => failureText(update.error));
		expect(texts).toEqual(["Insufficient margin to place order.", "Insufficient margin to place order."]);
	});

	it("expands a scale order into one queued plan and resets both form halves", async () => {
		await submit(scaleInput());

		const [params] = mocks.submitOrder.mock.calls[0] ?? [];
		expect(params.orders).toHaveLength(2);
		expect(mocks.addOrder).toHaveBeenCalledWith(expect.objectContaining({ orderType: "scale" }));
		expect(mocks.onReset).toHaveBeenCalledOnce();
	});

	it("stores local scale validation as a locale-independent descriptor", async () => {
		await submit(scaleInput({ scaleLevelsNum: null }));

		expect(mocks.submitOrder).not.toHaveBeenCalled();
		expect(mocks.updateOrder).toHaveBeenCalledWith("queue-1", {
			status: "failed",
			error: { kind: "order-submission", code: "scale-levels-range" },
		});
	});

	it("queues a twap entry and resets both form halves once it is running", async () => {
		mocks.submitTwap.mockResolvedValue({
			state: "confirmed",
			result: { status: "ok", response: { type: "twapOrder", data: { status: { running: { twapId: 1 } } } } },
		});
		await submit(marketInput({ orderType: "twap", twapOrder: true, twapMinutesNum: 30, twapRandomize: true }));

		expect(mocks.addOrder).toHaveBeenCalledWith(expect.objectContaining({ orderType: "twap" }));
		expect(mocks.updateOrder).toHaveBeenCalledWith("queue-1", { status: "success", outcome: "twapStarted" });
		expect(mocks.onReset).toHaveBeenCalledOnce();
	});
});
