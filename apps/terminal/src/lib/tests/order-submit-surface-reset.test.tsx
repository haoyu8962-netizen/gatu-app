// @vitest-environment jsdom

import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EntryExecutionError } from "@/domain/trade/order/entry-execution-guard";
import { OrderBatchResolutionError } from "@/domain/trade/order-tracking";
import { type OrderSubmitInput, useOrderSubmit } from "@/hooks/trade/use-order-submit";
import { orderSubmissionFeedbackCause } from "@/lib/trade/order-submission-feedback";
import { createI18nRoot } from "./harness/react";

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
	hookValue = useOrderSubmit({ onReset: mocks.onReset });
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
							errors: ["Order 2 was rejected"],
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
					expect.objectContaining({ status: "partial", acceptedCount: 1, error: "Order 2 was rejected" }),
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

	it("keeps an external SDK order failure raw", async () => {
		const sdkMessage = "SDK rejected the order request";
		mocks.submitOrder.mockRejectedValueOnce(new Error(sdkMessage));

		await submit(marketInput());

		expect(mocks.updateOrder).toHaveBeenCalledWith("queue-1", { status: "failed", error: sdkMessage });
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
