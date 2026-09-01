// @vitest-environment jsdom

import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type OrderSubmitInput, useOrderSubmit } from "@/hooks/trade/use-order-submit";
import { orderSubmissionFeedbackCause } from "@/lib/trade/order-submission-feedback";
import { createI18nRoot } from "./harness/react";

const mocks = vi.hoisted(() => ({
	submitOrder: vi.fn(),
	submitTwap: vi.fn(),
	addOrder: vi.fn(() => "queue-1"),
	updateOrder: vi.fn(),
	resetForm: vi.fn(),
	onReset: vi.fn(),
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
	useOrderEntryActions: () => ({ resetForm: mocks.resetForm }),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let hookValue: ReturnType<typeof useOrderSubmit> | null = null;

function Probe() {
	hookValue = useOrderSubmit({ onReset: mocks.onReset });
	return null;
}

function marketInput(overrides: Partial<OrderSubmitInput> = {}): OrderSubmitInput {
	return {
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

describe("useOrderSubmit surface reset", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		mocks.submitOrder.mockReset();
		mocks.submitTwap.mockReset();
		mocks.addOrder.mockReset();
		mocks.addOrder.mockReturnValue("queue-1");
		mocks.updateOrder.mockReset();
		mocks.resetForm.mockReset();
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

		expect(mocks.resetForm).toHaveBeenCalledOnce();
		expect(mocks.onReset).toHaveBeenCalledOnce();
	});

	it("keeps the surface inputs when the submission never reaches the exchange", async () => {
		mocks.submitOrder.mockResolvedValue({ state: "blocked", reason: "pending" });
		await submit(marketInput());

		expect(mocks.resetForm).not.toHaveBeenCalled();
		expect(mocks.onReset).not.toHaveBeenCalled();
	});

	it("stores a tracked-order client failure as a locale-independent descriptor", async () => {
		mocks.submitOrder.mockRejectedValueOnce(orderSubmissionFeedbackCause("coordination-unavailable"));

		await submit(marketInput());

		expect(mocks.updateOrder).toHaveBeenCalledWith("queue-1", {
			status: "failed",
			error: { kind: "order-submission", code: "coordination-unavailable" },
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
