// @vitest-environment jsdom

import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type OrderSubmitInput, useOrderSubmit } from "@/hooks/trade/use-order-submit";
import { createI18nRoot } from "./harness/react";

const mocks = vi.hoisted(() => ({
	submitOrder: vi.fn(),
	submitTwap: vi.fn(),
	addOrder: vi.fn(() => "queue-1"),
	updateOrder: vi.fn(),
	resetForm: vi.fn(),
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
	hookValue = useOrderSubmit();
	return null;
}

function twapInput(overrides: Partial<OrderSubmitInput> = {}): OrderSubmitInput {
	return {
		market: { assetId: 0, kind: "perp", name: "BTC", szDecimals: 5 },
		baseToken: "BTC",
		side: "buy",
		orderType: "twap",
		sizeValue: 1,
		price: 100,
		executionReferencePx: 100.5,
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
		twapMinutesNum: 30,
		twapRandomize: true,
		twapTriggerPx: null,
		twapStopPx: null,
		tpSlEnabled: false,
		canUseTpSl: false,
		tpPriceNum: null,
		slPriceNum: null,
		twapOrder: true,
		scaleOrder: false,
		triggerOrder: false,
		...overrides,
	};
}

const CONFIRMED = {
	state: "confirmed",
	result: { status: "ok", response: { type: "twapOrder", data: { status: { running: { twapId: 1 } } } } },
} as const;

describe("useOrderSubmit TWAP details", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		mocks.submitOrder.mockReset();
		mocks.submitTwap.mockReset();
		mocks.addOrder.mockReset();
		mocks.addOrder.mockReturnValue("queue-1");
		mocks.updateOrder.mockReset();
		mocks.resetForm.mockReset();
		mocks.submitTwap.mockResolvedValue(CONFIRMED);
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

	it("submits a plain TWAP without any details key", async () => {
		await submit(twapInput());

		expect(mocks.submitTwap).toHaveBeenCalledOnce();
		const [params, options] = mocks.submitTwap.mock.calls[0] ?? [];
		expect(params).toEqual({ twap: { a: 0, b: true, s: "1", r: false, m: 30, t: true } });
		expect(params).not.toHaveProperty("details");
		expect(options).toMatchObject({ coin: "BTC", queueId: "queue-1" });
		expect(mocks.updateOrder).toHaveBeenCalledWith("queue-1", { status: "success", outcome: "twapStarted" });
	});

	it("derives the trigger direction from the live mark, not the execution reference price", async () => {
		await submit(twapInput({ twapTriggerPx: "100.2", markPx: 100, executionReferencePx: 100.5 }));
		expect(mocks.submitTwap.mock.calls[0]?.[0]).toMatchObject({ details: { t: { p: "100.2", a: true }, s: null } });

		mocks.submitTwap.mockClear();
		await submit(twapInput({ twapTriggerPx: "99", markPx: 100 }));
		expect(mocks.submitTwap.mock.calls[0]?.[0]).toMatchObject({ details: { t: { p: "99", a: false }, s: null } });
	});

	it("sends the already tick-rounded trigger and stop strings verbatim", async () => {
		await submit(twapInput({ twapTriggerPx: "117313", twapStopPx: "118000", markPx: 117312 }));

		expect(mocks.submitTwap.mock.calls[0]?.[0]).toEqual({
			twap: { a: 0, b: true, s: "1", r: false, m: 30, t: true },
			details: { t: { p: "117313", a: true }, s: "118000" },
		});
	});

	it("keeps a stop-only TWAP with a null trigger", async () => {
		await submit(twapInput({ side: "sell", twapStopPx: "90" }));

		expect(mocks.submitTwap.mock.calls[0]?.[0]).toEqual({
			twap: { a: 0, b: false, s: "1", r: false, m: 30, t: true },
			details: { t: null, s: "90" },
		});
	});

	it("treats zero-valued prices as unset instead of sending them", async () => {
		await submit(twapInput({ twapTriggerPx: "0", twapStopPx: "0" }));

		expect(mocks.submitTwap.mock.calls[0]?.[0]).not.toHaveProperty("details");
	});

	it("fails the queue item instead of submitting when the trigger equals the mark", async () => {
		await submit(twapInput({ twapTriggerPx: "100", markPx: 100 }));

		expect(mocks.submitTwap).not.toHaveBeenCalled();
		expect(mocks.updateOrder).toHaveBeenCalledWith("queue-1", {
			status: "failed",
			error: "Trigger price is not valid against the live mark price",
		});
		expect(mocks.resetForm).not.toHaveBeenCalled();
	});
});
